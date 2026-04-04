import { kv } from '@vercel/kv'
import {
  AUTOMATED_DROPTIMIZER_SCENARIO,
  classifyDroptimizerFailure,
  RUN_STATUSES,
  todayDateString,
} from './_droptimizer-automation.js'
import {
  buildScenarioPayload,
  DROPTIMIZER_SCENARIOS,
  extractReportId,
  isExactDroptimizerPayload,
  sleep,
} from './_droptimizer.js'
import { fetchAndParseRaidbotsReport } from './_raidbots-report.js'
import { submitRaidbotsDroptimizer, pollRaidbotsSim } from './_raidbots.js'
import {
  charactersByName,
  createOrResetRun,
  ENROLLMENT_STATUSES,
  latestRunByCharacter,
  listEnrollments,
  listValidEnrollments,
  loadCharacters,
  loadEnrollment,
  loadLatestRunsForCharacters,
  loadSchedulerState,
  normalizeName,
  replaceRunItems,
  syncCharacterDroptimizerUrl,
  syncCharacterMetadataFromActor,
  TRIGGER_KINDS,
  updateEnrollmentValidation,
  updateRun,
  loadRunningRuns,
} from './_droptimizer-store.js'

const GUILD_KEY = 'wow-gear-diary:guild'
const DEFAULT_GUILD = {
  region: 'eu',
  realm: 'tarren-mill',
}

export const SUPPORTED_AUTOMATION_SCENARIOS = [AUTOMATED_DROPTIMIZER_SCENARIO]
export const DIRECT_MAX_ATTEMPTS = 3
export const DIRECT_POLL_INTERVAL_MS = 60_000
export const DIRECT_MAX_POLLS = 30

function nowIso(date = new Date()) {
  return date.toISOString()
}

function resolveRealm(member, guild) {
  return member?.realm?.trim() || guild?.realm || DEFAULT_GUILD.realm
}

function resolveRegion(guild) {
  return guild?.region || DEFAULT_GUILD.region
}

function parsePayloadInput(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch (error) {
      throw new Error(`Payload is not valid JSON: ${error.message}`)
    }
  }

  return payload
}

function extractPayloadActor(payload) {
  return {
    name: payload?.armory?.name ?? payload?.character?.name ?? payload?.baseActorName ?? null,
    realm: payload?.armory?.realm ?? payload?.character?.realm?.slug ?? payload?.character?.realm?.name ?? null,
    region: payload?.armory?.region ?? payload?.region ?? null,
  }
}

export function assertAutomationScenario(scenario) {
  if (!SUPPORTED_AUTOMATION_SCENARIOS.includes(scenario)) {
    throw new Error(`Scenario "${scenario}" is not enabled for automation`)
  }
}

export function validateEnrollmentPayload({ characterName, scenario, payload }) {
  const normalizedPayload = parsePayloadInput(payload)
  const scenarioConfig = DROPTIMIZER_SCENARIOS[scenario]
  if (!scenarioConfig) {
    throw new Error(`Unknown Droptimizer scenario: ${scenario}`)
  }

  if (!isExactDroptimizerPayload(normalizedPayload)) {
    throw new Error('Payload must be an exact Raidbots Droptimizer request JSON')
  }

  if (!Array.isArray(normalizedPayload.droptimizerItems) || normalizedPayload.droptimizerItems.length === 0) {
    throw new Error('Payload is missing droptimizerItems')
  }

  const actor = extractPayloadActor(normalizedPayload)
  if (!actor.name) {
    throw new Error('Payload is missing an actor name')
  }

  if (normalizeName(actor.name) !== normalizeName(characterName)) {
    throw new Error(`Payload actor "${actor.name}" does not match "${characterName}"`)
  }

  return {
    payload: normalizedPayload,
    actor,
  }
}

export async function loadGuildMeta() {
  if (process.env.KV_REST_API_URL) {
    try {
      const guild = await kv.get(GUILD_KEY)
      if (guild && typeof guild === 'object') {
        return {
          ...DEFAULT_GUILD,
          ...guild,
        }
      }
    } catch (error) {
      console.error('[droptimizer guild]', error.message)
    }
  }

  return { ...DEFAULT_GUILD }
}

export async function listBatchCandidates(supabase, scenario) {
  assertAutomationScenario(scenario)

  const [guild, characters, enrollments, runs] = await Promise.all([
    loadGuildMeta(),
    loadCharacters(supabase),
    listValidEnrollments(supabase, scenario),
    loadLatestRunsForCharacters(supabase, scenario),
  ])

  const validByName = new Map(
    enrollments.map((row) => [normalizeName(row.character_name), row]),
  )
  const latestRuns = latestRunByCharacter(runs)

  const rows = characters
    .filter((character) => character?.name)
    .filter((character) => validByName.has(normalizeName(character.name)))
    .sort((left, right) => {
      const leftMain = left?.is_main === false ? 1 : 0
      const rightMain = right?.is_main === false ? 1 : 0
      if (leftMain !== rightMain) return leftMain - rightMain
      return String(left.name).localeCompare(String(right.name), 'en', { sensitivity: 'base' })
    })
    .map((character) => ({
      character,
      enrollment: validByName.get(normalizeName(character.name)),
      latestRun: latestRuns.get(normalizeName(character.name)) ?? null,
      realm: resolveRealm(character, guild),
      region: resolveRegion(guild),
    }))

  return {
    guild,
    rows,
  }
}

async function resolveCharacterContext(supabase, characterName) {
  const [guild, characters] = await Promise.all([
    loadGuildMeta(),
    loadCharacters(supabase),
  ])
  const byName = charactersByName(characters)
  const member = byName.get(normalizeName(characterName)) ?? null

  return {
    guild,
    member,
    realm: resolveRealm(member, guild),
    region: resolveRegion(guild),
  }
}

async function createRunRecord({
  supabase,
  characterName,
  scenario,
  runDate,
  triggerKind,
  workflowRunId,
  attemptCount,
}) {
  const scenarioConfig = DROPTIMIZER_SCENARIOS[scenario]
  let resolvedWorkflowRunId = workflowRunId
  if (!resolvedWorkflowRunId && triggerKind === TRIGGER_KINDS.automation) {
    const scheduler = await loadSchedulerState(supabase, scenario).catch(() => null)
    resolvedWorkflowRunId = scheduler?.active_workflow_run_id ?? null
  }

  return createOrResetRun(supabase, {
    characterName,
    scenario,
    runDate,
    status: RUN_STATUSES.running,
    source: triggerKind,
    triggerKind,
    difficulty: scenarioConfig?.difficulty ?? null,
    workflowRunId: resolvedWorkflowRunId,
    attemptCount,
  })
}

export async function startScenarioSubmission({
  supabase,
  characterName,
  scenario,
  triggerKind = TRIGGER_KINDS.manual,
  workflowRunId = null,
  runDate = todayDateString(),
  payloadOverride = null,
  validation = false,
  attemptCount = 1,
}) {
  const scenarioConfig = DROPTIMIZER_SCENARIOS[scenario]
  if (!scenarioConfig) {
    throw new Error(`Unknown Droptimizer scenario: ${scenario}`)
  }

  if (!validation) {
    assertAutomationScenario(scenario)
  }

  const enrollment = payloadOverride
    ? null
    : await loadEnrollment(supabase, characterName, scenario)
  const payloadTemplate = payloadOverride ?? enrollment?.payload ?? null
  if (!payloadTemplate) {
    throw new Error(`Character "${characterName}" is not enrolled`)
  }

  if (!validation) {
    if (!enrollment?.enabled || enrollment?.validation_status !== ENROLLMENT_STATUSES.valid) {
      throw new Error(`Character "${characterName}" is not enrolled with a valid payload`)
    }
  }

  const { region, realm } = await resolveCharacterContext(supabase, characterName)
  const payload = payloadOverride ?? await buildScenarioPayload(scenario, {
    name: characterName,
    realm,
    region,
  })

  const run = validation
    ? null
    : await createRunRecord({
      supabase,
      characterName,
      scenario,
      runDate,
      triggerKind,
      workflowRunId,
      attemptCount,
    })

  const submission = await submitRaidbotsDroptimizer({ droptimizer: payload })

  if (run) {
    await updateRun(supabase, run.id, {
      raidbots_job_id: submission.simId,
      attempt_count: attemptCount,
      error_message: null,
      started_at: nowIso(),
      completed_at: null,
      next_retry_at: null,
    })
  }

  return {
    run,
    simId: submission.simId,
    payload: submission.payload,
    region,
    realm,
  }
}

export async function completeScenarioFromReport({
  supabase,
  characterName,
  scenario,
  reportUrl,
  runId = null,
  payloadActor = null,
  realm = '',
  validation = false,
}) {
  const { data: report } = await fetchAndParseRaidbotsReport(extractReportId(reportUrl))
  if (report?.type !== 'droptimizer') {
    throw new Error('Raidbots report was not a Droptimizer result')
  }

  if (validation) {
    await updateEnrollmentValidation(supabase, characterName, scenario, {
      enabled: true,
      validation_status: ENROLLMENT_STATUSES.valid,
      validation_error: null,
      validated_at: nowIso(),
    })
  } else if (runId) {
    await replaceRunItems(supabase, runId, report.upgrades ?? [])
    await updateRun(supabase, runId, {
      status: RUN_STATUSES.completed,
      report_url: reportUrl,
      base_dps: report.baseDps ?? null,
      difficulty: report.difficulty ?? DROPTIMIZER_SCENARIOS[scenario]?.difficulty ?? null,
      error_message: null,
      completed_at: nowIso(),
      next_retry_at: null,
    })
  }

  await syncCharacterDroptimizerUrl(supabase, characterName, reportUrl)

  if (payloadActor) {
    await syncCharacterMetadataFromActor(supabase, characterName, payloadActor, realm)
  }

  return {
    status: RUN_STATUSES.completed,
    reportUrl,
    report,
  }
}

export async function pollScenarioSubmission({
  supabase,
  characterName,
  scenario,
  simId,
  runId = null,
  payloadActor = null,
  realm = '',
  validation = false,
}) {
  const polled = await pollRaidbotsSim(simId)

  if (polled.status === 'complete') {
    return completeScenarioFromReport({
      supabase,
      characterName,
      scenario,
      reportUrl: polled.resultUrl,
      runId,
      payloadActor,
      realm,
      validation,
    })
  }

  if (polled.status === 'failed' || polled.status === 'errored') {
    throw new Error(`Raidbots job ${polled.status}`)
  }

  return {
    status: RUN_STATUSES.running,
    progress: polled.progress ?? 0,
  }
}

export async function finalizeScenarioFailure({
  supabase,
  characterName,
  scenario,
  error,
  runId = null,
  validation = false,
}) {
  const classified = classifyDroptimizerFailure(error)

  if (validation) {
    await updateEnrollmentValidation(supabase, characterName, scenario, {
      enabled: false,
      validation_status: classified.kind === 'permanent'
        ? ENROLLMENT_STATUSES.invalid
        : ENROLLMENT_STATUSES.pending,
      validation_error: classified.message,
      validated_at: null,
    })
  } else if (runId) {
    await updateRun(supabase, runId, {
      status: RUN_STATUSES.failed,
      error_message: classified.message,
      completed_at: nowIso(),
      next_retry_at: null,
    })
  }

  return classified
}

export async function executeDirectScenario({
  supabase,
  characterName,
  scenario,
  triggerKind = TRIGGER_KINDS.manual,
  workflowRunId = null,
  runDate = todayDateString(),
  payloadOverride = null,
  validation = false,
  maxAttempts = DIRECT_MAX_ATTEMPTS,
  pollIntervalMs = DIRECT_POLL_INTERVAL_MS,
  maxPolls = DIRECT_MAX_POLLS,
}) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let started = null

    try {
      started = await startScenarioSubmission({
        supabase,
        characterName,
        scenario,
        triggerKind,
        workflowRunId,
        runDate,
        payloadOverride,
        validation,
        attemptCount: attempt,
      })

      for (let pollIndex = 0; pollIndex < maxPolls; pollIndex += 1) {
        const result = await pollScenarioSubmission({
          supabase,
          characterName,
          scenario,
          simId: started.simId,
          runId: started.run?.id ?? null,
          payloadActor: started.payload?.character ?? null,
          realm: started.realm,
          validation,
        })

        if (result.status === RUN_STATUSES.completed) {
          return {
            ok: true,
            attemptCount: attempt,
            runId: started.run?.id ?? null,
            ...result,
          }
        }

        await sleep(pollIntervalMs)
      }

      throw new Error('Timed out waiting for Droptimizer report')
    } catch (error) {
      lastError = error
      const classified = classifyDroptimizerFailure(error)
      const shouldRetry = classified.kind === 'transient' && attempt < maxAttempts

      if (!shouldRetry) {
        const finalized = await finalizeScenarioFailure({
          supabase,
          characterName,
          scenario,
          error,
          runId: started?.run?.id ?? null,
          validation,
        })

        return {
          ok: false,
          attemptCount: attempt,
          kind: finalized.kind,
          error: finalized.message,
          runId: started?.run?.id ?? null,
        }
      }
    }
  }

  const finalized = await finalizeScenarioFailure({
    supabase,
    characterName,
    scenario,
    error: lastError ?? new Error('Unknown Droptimizer error'),
    validation,
  })

  return {
    ok: false,
    attemptCount: maxAttempts,
    kind: finalized.kind,
    error: finalized.message,
    runId: null,
  }
}

export async function buildAutomationStatus(supabase, scenario) {
  const [guild, characters, enrollments, runs] = await Promise.all([
    loadGuildMeta(),
    loadCharacters(supabase),
    listEnrollments(supabase, scenario),
    loadLatestRunsForCharacters(supabase, scenario),
  ])

  const enrollmentByName = new Map(
    enrollments.map((row) => [normalizeName(row.character_name), row]),
  )
  const latestRuns = latestRunByCharacter(runs)

  const rows = characters
    .filter((character) => character?.name)
    .sort((left, right) => {
      const leftMain = left?.is_main === false ? 1 : 0
      const rightMain = right?.is_main === false ? 1 : 0
      if (leftMain !== rightMain) return leftMain - rightMain
      return String(left.name).localeCompare(String(right.name), 'en', { sensitivity: 'base' })
    })
    .map((character) => {
      const enrollment = enrollmentByName.get(normalizeName(character.name)) ?? null
      const latestRun = latestRuns.get(normalizeName(character.name)) ?? null

      let enrollmentStatus = 'not_enrolled'
      if (enrollment) {
        if (enrollment.enabled && enrollment.validation_status === ENROLLMENT_STATUSES.valid) {
          enrollmentStatus = ENROLLMENT_STATUSES.valid
        } else if (enrollment.validation_status === ENROLLMENT_STATUSES.invalid) {
          enrollmentStatus = ENROLLMENT_STATUSES.invalid
        } else {
          enrollmentStatus = ENROLLMENT_STATUSES.pending
        }
      }

      return {
        character: character.name,
        realm: resolveRealm(character, guild),
        scenario,
        enrollmentStatus,
        lastValidationError: enrollment?.validation_error ?? null,
        validatedAt: enrollment?.validated_at ?? null,
        updatedAt: enrollment?.updated_at ?? null,
        lastRunStatus: latestRun?.status ?? null,
        lastCompletedAt: latestRun?.completed_at ?? null,
        lastStartedAt: latestRun?.started_at ?? null,
        reportUrl: latestRun?.report_url ?? character?.droptimizer_url ?? null,
      }
    })

  const counts = rows.reduce((acc, row) => {
    acc[row.enrollmentStatus] = (acc[row.enrollmentStatus] ?? 0) + 1
    return acc
  }, {
    valid: 0,
    pending: 0,
    invalid: 0,
    not_enrolled: 0,
  })

  return {
    guild,
    rows,
    counts,
  }
}

const STALE_RUN_MS = 60 * 60 * 1000 // 1 hour

export async function collectPendingRuns(supabase) {
  const runs = await loadRunningRuns(supabase)
  const results = []

  for (const run of runs) {
    const startedAt = run.started_at ? new Date(run.started_at).getTime() : 0
    const isStale = startedAt > 0 && (Date.now() - startedAt) > STALE_RUN_MS

    if (isStale) {
      await finalizeScenarioFailure({
        supabase,
        characterName: run.character_name,
        scenario: run.scenario,
        error: new Error('Raidbots job timed out (stale after 1 hour)'),
        runId: run.id,
      })
      results.push({
        ok: false,
        character: run.character_name,
        runId: run.id,
        action: 'stale_timeout',
      })
      continue
    }

    try {
      const result = await pollScenarioSubmission({
        supabase,
        characterName: run.character_name,
        scenario: run.scenario,
        simId: run.raidbots_job_id,
        runId: run.id,
      })

      if (result.status === RUN_STATUSES.completed) {
        results.push({
          ok: true,
          character: run.character_name,
          runId: run.id,
          action: 'completed',
          reportUrl: result.reportUrl,
        })
      } else {
        results.push({
          ok: true,
          character: run.character_name,
          runId: run.id,
          action: 'still_running',
          progress: result.progress ?? 0,
        })
      }
    } catch (error) {
      await finalizeScenarioFailure({
        supabase,
        characterName: run.character_name,
        scenario: run.scenario,
        error,
        runId: run.id,
      })
      results.push({
        ok: false,
        character: run.character_name,
        runId: run.id,
        action: 'failed',
        error: error.message,
      })
    }
  }

  return results
}
