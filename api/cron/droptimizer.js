import { kv } from '@vercel/kv'
import {
  AUTOMATED_DROPTIMIZER_SCENARIO,
  classifyDroptimizerFailure,
  compareQueuedCharacters,
  getRetryDelayMs,
  isTerminalRunStatus,
  LOCK_TTL_MS,
  RUN_STALE_MS,
  RUN_STATUSES,
  todayDateString,
} from '../_droptimizer-automation.js'
import { buildScenarioPayload, DROPTIMIZER_SCENARIOS, extractReportId, sleep } from '../_droptimizer.js'
import { createRaidbotsSession, pollRaidbotsSim, submitRaidbotsDroptimizer } from '../_raidbots.js'
import { fetchAndParseRaidbotsReport } from '../_raidbots-report.js'
import { getSupabase, isConfigured } from '../_supabase.js'

const GUILD_KEY = 'wow-gear-diary:guild'
const FALLBACK_GUILD = {
  region: 'eu',
  realm: 'tarren-mill',
}
const SUPPORTED_SCENARIOS = [AUTOMATED_DROPTIMIZER_SCENARIO]
const MANUAL_MAX_ATTEMPTS = 2
const MANUAL_POLL_INTERVAL_MS = 5000
const MANUAL_MAX_POLLS = 24
const MAX_QUEUE_ATTEMPTS = 3

function nowIso(date = new Date()) {
  return date.toISOString()
}

function addMs(date, amount) {
  return new Date(date.getTime() + amount)
}

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function normalizeQueryValue(value) {
  const raw = firstQueryValue(value)
  if (raw == null) return null
  const normalized = String(raw).trim()
  return normalized || null
}

function resolveRealm(member, defaultRealm) {
  return member?.realm?.trim() || defaultRealm
}

function enrichRun(run, charactersByName) {
  const member = charactersByName.get(String(run?.character_name ?? '').trim().toLowerCase()) ?? null
  return {
    ...run,
    is_main: member?.is_main ?? true,
    realm: member?.realm ?? '',
  }
}

function buildSummary({
  action,
  scenario,
  run = null,
  character = null,
  lockAcquired = true,
  nextRetryAt = null,
  ...rest
}) {
  return {
    ok: true,
    lockAcquired,
    action,
    scenario,
    character: character ?? run?.character_name ?? null,
    runId: run?.id ?? null,
    attemptCount: run?.attempt_count ?? null,
    nextRetryAt: nextRetryAt ?? run?.next_retry_at ?? null,
    ...rest,
  }
}

async function loadGuildMeta() {
  if (process.env.KV_REST_API_URL) {
    try {
      const guild = await kv.get(GUILD_KEY)
      if (guild) return guild
    } catch (error) {
      console.error('[cron/droptimizer guild]', error.message)
    }
  }

  return FALLBACK_GUILD
}

async function loadCharacters(supabase) {
  const { data, error } = await supabase
    .from('characters')
    .select('name, realm, class, spec, role, is_main')
    .order('is_main', { ascending: false })
    .order('name')

  if (error) throw error
  return data ?? []
}

async function loadRunById(supabase, runId) {
  if (!runId) return null

  const { data, error } = await supabase
    .from('sim_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

async function loadSchedulerState(supabase, scenarioKey) {
  const { data, error } = await supabase
    .from('droptimizer_scheduler_state')
    .select('*')
    .eq('scenario', scenarioKey)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error(`Missing scheduler state for scenario "${scenarioKey}"`)
  }
  return data
}

async function acquireSchedulerLock(supabase, scenarioKey) {
  const lockedAt = new Date()
  const lockToken = crypto.randomUUID()
  const lockExpiresAt = addMs(lockedAt, LOCK_TTL_MS).toISOString()

  const { data, error } = await supabase
    .from('droptimizer_scheduler_state')
    .update({
      lock_token: lockToken,
      lock_expires_at: lockExpiresAt,
      updated_at: nowIso(lockedAt),
    })
    .eq('scenario', scenarioKey)
    .or(`lock_expires_at.is.null,lock_expires_at.lte.${nowIso(lockedAt)}`)
    .select('*')

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return { lockAcquired: false, lockToken: null, state: await loadSchedulerState(supabase, scenarioKey) }
  }

  return { lockAcquired: true, lockToken, state: row }
}

async function updateSchedulerState(supabase, scenarioKey, patch, lockToken = null) {
  let query = supabase
    .from('droptimizer_scheduler_state')
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq('scenario', scenarioKey)

  if (lockToken) query = query.eq('lock_token', lockToken)

  const { data, error } = await query.select('*')
  if (error) throw error

  return Array.isArray(data) ? data[0] ?? null : null
}

async function releaseSchedulerLock(supabase, scenarioKey, lockToken) {
  if (!lockToken) return

  const { error } = await supabase
    .from('droptimizer_scheduler_state')
    .update({
      lock_token: null,
      lock_expires_at: null,
      updated_at: nowIso(),
    })
    .eq('scenario', scenarioKey)
    .eq('lock_token', lockToken)

  if (error) throw error
}

async function createOrResetRun(supabase, payload) {
  const row = {
    character_name: payload.characterName,
    scenario: payload.scenario,
    run_date: payload.runDate,
    status: payload.status,
    source: payload.source ?? 'automation',
    report_url: null,
    raidbots_job_id: null,
    base_dps: null,
    difficulty: payload.difficulty,
    error_message: null,
    started_at: nowIso(),
    completed_at: null,
    attempt_count: payload.attemptCount ?? 0,
    next_retry_at: null,
  }

  const { data: run, error } = await supabase
    .from('sim_runs')
    .upsert(row, { onConflict: 'character_name,scenario,run_date' })
    .select('*')
    .single()

  if (error) throw error

  await supabase.from('sim_run_items').delete().eq('sim_run_id', run.id)
  return run
}

async function updateRun(supabase, runId, patch) {
  const { data: run, error } = await supabase
    .from('sim_runs')
    .update(patch)
    .eq('id', runId)
    .select('*')
    .single()

  if (error) throw error
  return run
}

async function replaceRunItems(supabase, runId, upgrades) {
  await supabase.from('sim_run_items').delete().eq('sim_run_id', runId)

  if (!upgrades.length) return

  const rows = upgrades.map((item) => ({
    sim_run_id: runId,
    item_id: item.itemId ?? null,
    item_name: item.itemName ?? item.name ?? 'Unknown Item',
    slot: item.slot ?? '',
    item_level: item.itemLevel ?? null,
    dps_delta: item.dpsDelta ?? 0,
    dps_pct: item.dpsPct ?? 0,
    source_type: item.sourceType ?? null,
    source_id: item.sourceId ?? null,
    source_name: item.sourceName ?? item.source ?? null,
    difficulty: item.difficulty ?? null,
  }))

  const { error } = await supabase.from('sim_run_items').insert(rows)
  if (error) throw error
}

async function syncCharacterDroptimizerUrl(supabase, characterName, reportUrl) {
  if (!characterName) return

  const { error } = await supabase
    .from('characters')
    .update({ droptimizer_url: reportUrl ?? null })
    .ilike('name', characterName)

  if (error) throw error
}

async function markRunFailed(supabase, run, message, patch = {}) {
  return updateRun(supabase, run.id, {
    status: RUN_STATUSES.failed,
    error_message: message,
    completed_at: nowIso(),
    next_retry_at: null,
    ...patch,
  })
}

async function scheduleRunRetry(supabase, run, message, options = {}) {
  const attemptsUsed = options.incrementAttempt
    ? (run.attempt_count ?? 0) + 1
    : (run.attempt_count ?? 0)
  const retryDelayMs = getRetryDelayMs(attemptsUsed)

  if (!retryDelayMs || attemptsUsed >= MAX_QUEUE_ATTEMPTS) {
    return markRunFailed(supabase, run, message, {
      attempt_count: attemptsUsed,
      raidbots_job_id: options.clearJob ? null : run.raidbots_job_id,
      report_url: options.clearReport ? null : run.report_url,
      base_dps: options.clearReport ? null : run.base_dps,
    })
  }

  return updateRun(supabase, run.id, {
    status: RUN_STATUSES.retryable,
    error_message: message,
    next_retry_at: addMs(new Date(), retryDelayMs).toISOString(),
    completed_at: null,
    attempt_count: attemptsUsed,
    raidbots_job_id: options.clearJob ? null : run.raidbots_job_id,
    report_url: options.clearReport ? null : run.report_url,
    base_dps: options.clearReport ? null : run.base_dps,
  })
}

async function finalizeRunFromReport(supabase, run, reportUrl) {
  const { data: report } = await fetchAndParseRaidbotsReport(extractReportId(reportUrl))
  if (report?.type !== 'droptimizer') {
    throw new Error('Raidbots report was not a Droptimizer result')
  }

  await replaceRunItems(supabase, run.id, report.upgrades ?? [])
  await syncCharacterDroptimizerUrl(supabase, run.character_name, reportUrl)

  return updateRun(supabase, run.id, {
    status: RUN_STATUSES.completed,
    report_url: reportUrl,
    base_dps: report.baseDps ?? null,
    difficulty: report.difficulty ?? run.difficulty,
    error_message: null,
    completed_at: nowIso(),
    next_retry_at: null,
  })
}

async function seedQueuedRuns(supabase, scenarioKey, runDate, characters) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  const { data: existingRuns, error } = await supabase
    .from('sim_runs')
    .select('character_name')
    .eq('scenario', scenarioKey)
    .eq('run_date', runDate)

  if (error) throw error

  const existing = new Set((existingRuns ?? []).map((row) => String(row.character_name ?? '').trim().toLowerCase()))
  const rows = characters
    .filter((member) => member.name?.trim())
    .filter((member) => !existing.has(member.name.trim().toLowerCase()))
    .map((member) => ({
      character_name: member.name.trim(),
      scenario: scenarioKey,
      run_date: runDate,
      status: RUN_STATUSES.queued,
      source: 'automation',
      raidbots_job_id: null,
      report_url: null,
      base_dps: null,
      difficulty: scenario.difficulty,
      error_message: null,
      started_at: nowIso(),
      completed_at: null,
      attempt_count: 0,
      next_retry_at: null,
    }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('sim_runs').insert(rows)
    if (insertError) throw insertError
  }

  return { seededRuns: rows.length }
}

async function selectNextQueuedRun(supabase, scenarioKey, runDate, charactersByName) {
  const { data: runs, error } = await supabase
    .from('sim_runs')
    .select('*')
    .eq('scenario', scenarioKey)
    .eq('run_date', runDate)
    .in('status', [RUN_STATUSES.queued, RUN_STATUSES.retryable])

  if (error) throw error

  const now = Date.now()
  const eligibleRuns = (runs ?? [])
    .filter((run) => !run.next_retry_at || Date.parse(run.next_retry_at) <= now)
    .map((run) => enrichRun(run, charactersByName))
    .sort(compareQueuedCharacters)

  return eligibleRuns[0] ?? null
}

function isRunStale(run) {
  if (!run?.started_at) return false
  return (Date.now() - Date.parse(run.started_at)) >= RUN_STALE_MS
}

async function continueActiveRun(supabase, scenarioKey, lockToken, run) {
  if (run.report_url) {
    try {
      const completedRun = await finalizeRunFromReport(supabase, run, run.report_url)
      await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
      return buildSummary({
        action: 'finalized',
        scenario: scenarioKey,
        run: completedRun,
        reportUrl: completedRun.report_url,
      })
    } catch (error) {
      const classified = classifyDroptimizerFailure(error)
      const updatedRun = classified.kind === 'transient'
        ? await scheduleRunRetry(supabase, run, classified.message, { clearJob: false, clearReport: false })
        : await markRunFailed(supabase, run, classified.message)

      await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
      return buildSummary({
        action: updatedRun.status === RUN_STATUSES.retryable ? 'retry_scheduled' : 'failed',
        scenario: scenarioKey,
        run: updatedRun,
      })
    }
  }

  if (run.raidbots_job_id) {
    try {
      const polled = await pollRaidbotsSim(run.raidbots_job_id)

      if (polled.status === 'complete') {
        const completedRun = await finalizeRunFromReport(supabase, run, polled.resultUrl)
        await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
        return buildSummary({
          action: 'completed',
          scenario: scenarioKey,
          run: completedRun,
          reportUrl: completedRun.report_url,
        })
      }

      if (polled.status === 'failed' || polled.status === 'errored') {
        const updatedRun = await scheduleRunRetry(
          supabase,
          run,
          `Raidbots job ${polled.status}`,
          { clearJob: true, clearReport: true },
        )
        await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
        return buildSummary({
          action: updatedRun.status === RUN_STATUSES.retryable ? 'retry_scheduled' : 'failed',
          scenario: scenarioKey,
          run: updatedRun,
        })
      }

      if (isRunStale(run)) {
        const updatedRun = await scheduleRunRetry(
          supabase,
          run,
          'Timed out waiting for Droptimizer report',
          { clearJob: true, clearReport: true },
        )
        await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
        return buildSummary({
          action: updatedRun.status === RUN_STATUSES.retryable ? 'retry_scheduled' : 'failed',
          scenario: scenarioKey,
          run: updatedRun,
        })
      }

      return buildSummary({
        action: 'running',
        scenario: scenarioKey,
        run,
      })
    } catch (error) {
      const classified = classifyDroptimizerFailure(error)
      const updatedRun = classified.kind === 'transient'
        ? await scheduleRunRetry(supabase, run, classified.message, { clearJob: true, clearReport: true })
        : await markRunFailed(supabase, run, classified.message)

      await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
      return buildSummary({
        action: updatedRun.status === RUN_STATUSES.retryable ? 'retry_scheduled' : 'failed',
        scenario: scenarioKey,
        run: updatedRun,
      })
    }
  }

  if (isRunStale(run)) {
    const updatedRun = await scheduleRunRetry(
      supabase,
      run,
      'Timed out during Droptimizer submission',
      { clearJob: true, clearReport: true },
    )
    await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
    return buildSummary({
      action: updatedRun.status === RUN_STATUSES.retryable ? 'retry_scheduled' : 'failed',
      scenario: scenarioKey,
      run: updatedRun,
    })
  }

  return buildSummary({
    action: 'running',
    scenario: scenarioKey,
    run,
  })
}

async function submitQueuedRun(supabase, scenarioKey, lockToken, run, member, region, defaultRealm) {
  const realm = resolveRealm(member, defaultRealm)
  if (!member?.name || !realm || !region) {
    const failedRun = await markRunFailed(
      supabase,
      run,
      'Missing name, realm, or region',
      { attempt_count: (run.attempt_count ?? 0) + 1 },
    )
    await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
    return buildSummary({
      action: 'failed',
      scenario: scenarioKey,
      run: failedRun,
    })
  }

  let workingRun = await updateRun(supabase, run.id, {
    status: RUN_STATUSES.running,
    started_at: nowIso(),
    completed_at: null,
    error_message: null,
    next_retry_at: null,
    attempt_count: (run.attempt_count ?? 0) + 1,
    raidbots_job_id: null,
    report_url: null,
    base_dps: null,
  })
  await updateSchedulerState(supabase, scenarioKey, { active_run_id: workingRun.id }, lockToken)

  try {
    const raidsid = await createRaidbotsSession()
    const droptimizerPayload = await buildScenarioPayload(scenarioKey, {
      name: member.name,
      realm,
      region,
    })
    const { simId } = await submitRaidbotsDroptimizer({
      session: raidsid,
      droptimizer: droptimizerPayload,
    })

    workingRun = await updateRun(supabase, run.id, {
      raidbots_job_id: simId,
      error_message: null,
    })

    return buildSummary({
      action: 'submitted',
      scenario: scenarioKey,
      run: workingRun,
    })
  } catch (error) {
    const classified = classifyDroptimizerFailure(error)
    const updatedRun = classified.kind === 'transient'
      ? await scheduleRunRetry(supabase, workingRun, classified.message, { clearJob: true, clearReport: true })
      : await markRunFailed(supabase, workingRun, classified.message)

    await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
    return buildSummary({
      action: updatedRun.status === RUN_STATUSES.retryable ? 'retry_scheduled' : 'failed',
      scenario: scenarioKey,
      run: updatedRun,
    })
  }
}

async function runManualScenarioForCharacter(supabase, { member, region, realm, scenarioKey, runDate }) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  const run = await createOrResetRun(supabase, {
    characterName: member.name,
    scenario: scenarioKey,
    runDate,
    status: RUN_STATUSES.running,
    difficulty: scenario.difficulty,
    source: 'manual',
  })

  let lastError = null

  for (let attempt = 1; attempt <= MANUAL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const droptimizerPayload = await buildScenarioPayload(scenarioKey, {
        name: member.name,
        realm,
        region,
      })

      const raidsid = await createRaidbotsSession()
      const { simId } = await submitRaidbotsDroptimizer({
        session: raidsid,
        droptimizer: droptimizerPayload,
      })

      await updateRun(supabase, run.id, {
        raidbots_job_id: simId,
        error_message: null,
        attempt_count: attempt,
      })

      let resultUrl = null
      for (let pollIndex = 0; pollIndex < MANUAL_MAX_POLLS; pollIndex += 1) {
        const polled = await pollRaidbotsSim(simId)
        if (polled.status === 'complete') {
          resultUrl = polled.resultUrl
          break
        }
        if (polled.status === 'failed' || polled.status === 'errored') {
          throw new Error(`Raidbots job ${polled.status}`)
        }
        await sleep(MANUAL_POLL_INTERVAL_MS)
      }

      if (!resultUrl) {
        throw new Error('Timed out waiting for Droptimizer report')
      }

      const completedRun = await finalizeRunFromReport(supabase, run, resultUrl)
      return buildSummary({
        action: 'completed',
        scenario: scenarioKey,
        run: completedRun,
        reportUrl: completedRun.report_url,
      })
    } catch (error) {
      lastError = error
      console.error(`[cron/droptimizer ${member.name} ${scenarioKey}]`, error.message)
      if (attempt < MANUAL_MAX_ATTEMPTS) {
        await sleep(attempt * MANUAL_POLL_INTERVAL_MS)
      }
    }
  }

  const failedRun = await markRunFailed(supabase, run, lastError?.message ?? 'Unknown Droptimizer error', {
    attempt_count: MANUAL_MAX_ATTEMPTS,
  })

  return buildSummary({
    action: 'failed',
    scenario: scenarioKey,
    run: failedRun,
  })
}

async function processAutomatedQueue(supabase, scenarioKey, guild, characters, lockToken) {
  const runDate = todayDateString()
  const defaultRealm = guild?.realm ?? FALLBACK_GUILD.realm
  const region = guild?.region ?? FALLBACK_GUILD.region
  const charactersByName = new Map(
    characters.map((member) => [member.name?.trim().toLowerCase(), member]),
  )

  const schedulerState = await loadSchedulerState(supabase, scenarioKey)
  let seededRuns = 0

  if (schedulerState.last_seeded_run_date !== runDate) {
    const seeded = await seedQueuedRuns(supabase, scenarioKey, runDate, characters)
    seededRuns = seeded.seededRuns
    await updateSchedulerState(supabase, scenarioKey, { last_seeded_run_date: runDate }, lockToken)
  }

  let activeRun = schedulerState.active_run_id
    ? enrichRun(await loadRunById(supabase, schedulerState.active_run_id), charactersByName)
    : null

  if (schedulerState.active_run_id && !activeRun) {
    await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
  }

  if (activeRun && isTerminalRunStatus(activeRun.status)) {
    await updateSchedulerState(supabase, scenarioKey, { active_run_id: null }, lockToken)
    activeRun = null
  }

  if (activeRun) {
    const continued = await continueActiveRun(supabase, scenarioKey, lockToken, activeRun)
    return {
      ...continued,
      seededRuns,
      region,
      runDate,
    }
  }

  const nextRun = await selectNextQueuedRun(supabase, scenarioKey, runDate, charactersByName)
  if (!nextRun) {
    return buildSummary({
      action: seededRuns > 0 ? 'seeded' : 'idle',
      scenario: scenarioKey,
      lockAcquired: true,
      seededRuns,
      region,
      runDate,
    })
  }

  if (nextRun.report_url || nextRun.raidbots_job_id) {
    await updateSchedulerState(supabase, scenarioKey, { active_run_id: nextRun.id }, lockToken)
    const continued = await continueActiveRun(supabase, scenarioKey, lockToken, nextRun)
    return {
      ...continued,
      seededRuns,
      region,
      runDate,
    }
  }

  const member = charactersByName.get(String(nextRun.character_name).trim().toLowerCase()) ?? null
  const submitted = await submitQueuedRun(
    supabase,
    scenarioKey,
    lockToken,
    nextRun,
    member,
    region,
    defaultRealm,
  )

  return {
    ...submitted,
    seededRuns,
    region,
    runDate,
  }
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Supabase not configured' })
  }

  const requestedCharacter = normalizeQueryValue(req.query?.character)
  const requestedScenario = normalizeQueryValue(req.query?.scenario) ?? AUTOMATED_DROPTIMIZER_SCENARIO

  if (!SUPPORTED_SCENARIOS.includes(requestedScenario)) {
    return res.status(400).json({
      ok: false,
      error: `Unsupported scenario "${requestedScenario}"`,
      supportedScenarios: SUPPORTED_SCENARIOS,
    })
  }

  const supabase = getSupabase()
  let characters

  try {
    characters = await loadCharacters(supabase)
  } catch (error) {
    console.error('[cron/droptimizer characters]', error.message)
    return res.status(500).json({ ok: false, error: error.message })
  }

  const guild = await loadGuildMeta()
  const region = guild?.region ?? FALLBACK_GUILD.region
  const defaultRealm = guild?.realm ?? FALLBACK_GUILD.realm
  const runDate = todayDateString()

  let lockToken = null

  try {
    const lock = await acquireSchedulerLock(supabase, AUTOMATED_DROPTIMIZER_SCENARIO)
    if (!lock.lockAcquired) {
      return res.status(200).json(buildSummary({
        action: 'lock_held',
        scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
        lockAcquired: false,
      }))
    }
    lockToken = lock.lockToken

    if (requestedCharacter) {
      const member = characters.find((item) => item.name?.trim().toLowerCase() === requestedCharacter.toLowerCase())
      if (!member) {
        return res.status(404).json({
          ok: false,
          error: `Character "${requestedCharacter}" not found`,
        })
      }

      const schedulerState = await loadSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO)
      if (schedulerState.active_run_id) {
        const activeRun = await loadRunById(supabase, schedulerState.active_run_id)
        if (activeRun && !isTerminalRunStatus(activeRun.status)) {
          return res.status(200).json(buildSummary({
            action: 'active_run_in_progress',
            scenario: requestedScenario,
            run: activeRun,
          }))
        }
      }

      const manualResult = await runManualScenarioForCharacter(supabase, {
        member,
        region,
        realm: resolveRealm(member, defaultRealm),
        scenarioKey: requestedScenario,
        runDate,
      })

      return res.status(200).json({
        ...manualResult,
        runDate,
        region,
        mode: 'manual',
      })
    }

    const automatedResult = await processAutomatedQueue(
      supabase,
      AUTOMATED_DROPTIMIZER_SCENARIO,
      guild,
      characters,
      lockToken,
    )

    return res.status(200).json({
      ...automatedResult,
      mode: 'automation',
    })
  } catch (error) {
    console.error('[cron/droptimizer]', error.message)
    return res.status(500).json({ ok: false, error: error.message })
  } finally {
    if (lockToken) {
      await releaseSchedulerLock(supabase, AUTOMATED_DROPTIMIZER_SCENARIO, lockToken).catch((error) => {
        console.error('[cron/droptimizer release]', error.message)
      })
    }
  }
}
