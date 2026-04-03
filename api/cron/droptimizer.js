import { kv } from '@vercel/kv'
import { buildScenarioPayload, DROPTIMIZER_SCENARIOS, extractReportId, sleep } from '../_droptimizer.js'
import { createRaidbotsSession, pollRaidbotsSim, submitRaidbotsDroptimizer } from '../_raidbots.js'
import { fetchAndParseRaidbotsReport } from '../_raidbots-report.js'
import { getSupabase, isConfigured } from '../_supabase.js'

const GUILD_KEY = 'wow-gear-diary:guild'
const FALLBACK_GUILD = {
  region: 'eu',
  realm: 'tarren-mill',
}
const RUN_STATUSES = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
}
const SCENARIO_ORDER = ['raid_heroic', 'mythic_plus_all']
const MAX_ATTEMPTS = 2
const POLL_INTERVAL_MS = 5000
const MAX_POLLS = 24

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
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

async function createOrResetRun(supabase, payload) {
  const row = {
    character_name: payload.characterName,
    scenario: payload.scenario,
    run_date: payload.runDate,
    status: payload.status,
    source: 'automation',
    report_url: null,
    raidbots_job_id: null,
    base_dps: null,
    difficulty: payload.difficulty,
    error_message: null,
    started_at: new Date().toISOString(),
    completed_at: null,
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

async function runScenarioForCharacter(supabase, { member, region, realm, scenarioKey, runDate, raidsid }) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  const run = await createOrResetRun(supabase, {
    characterName: member.name,
    scenario: scenarioKey,
    runDate,
    status: RUN_STATUSES.running,
    difficulty: scenario.difficulty,
  })

  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const droptimizerPayload = buildScenarioPayload(scenarioKey, {
        name: member.name,
        realm,
        region,
      })

      const { simId } = await submitRaidbotsDroptimizer({
        session: raidsid,
        droptimizer: droptimizerPayload,
      })

      await updateRun(supabase, run.id, {
        raidbots_job_id: simId,
        error_message: null,
      })

      let resultUrl = null
      for (let pollIndex = 0; pollIndex < MAX_POLLS; pollIndex += 1) {
        const polled = await pollRaidbotsSim(simId)
        if (polled.status === 'complete') {
          resultUrl = polled.resultUrl
          break
        }
        if (polled.status === 'failed' || polled.status === 'errored') {
          throw new Error(`Raidbots job ${polled.status}`)
        }
        await sleep(POLL_INTERVAL_MS)
      }

      if (!resultUrl) {
        throw new Error('Timed out waiting for Droptimizer report')
      }

      const { data: report } = await fetchAndParseRaidbotsReport(extractReportId(resultUrl))
      if (report?.type !== 'droptimizer') {
        throw new Error('Raidbots report was not a Droptimizer result')
      }

      await replaceRunItems(supabase, run.id, report.upgrades ?? [])
      await updateRun(supabase, run.id, {
        status: RUN_STATUSES.completed,
        report_url: resultUrl,
        base_dps: report.baseDps ?? null,
        error_message: null,
        completed_at: new Date().toISOString(),
      })

      return { status: RUN_STATUSES.completed, reportUrl: resultUrl, itemCount: report.upgrades?.length ?? 0 }
    } catch (error) {
      lastError = error
      console.error(`[cron/droptimizer ${member.name} ${scenarioKey}]`, error.message)
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * POLL_INTERVAL_MS)
      }
    }
  }

  await updateRun(supabase, run.id, {
    status: RUN_STATUSES.failed,
    error_message: lastError?.message ?? 'Unknown Droptimizer error',
    completed_at: new Date().toISOString(),
  })

  return { status: RUN_STATUSES.failed, error: lastError?.message ?? 'Unknown Droptimizer error' }
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
  const requestedCharacterKey = requestedCharacter?.toLowerCase() ?? null
  const requestedScenario = normalizeQueryValue(req.query?.scenario) ?? null
  if (requestedScenario && !SCENARIO_ORDER.includes(requestedScenario)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown scenario "${requestedScenario}"`,
      supportedScenarios: SCENARIO_ORDER,
    })
  }
  const scenarioOrder = requestedScenario ? [requestedScenario] : SCENARIO_ORDER

  const guild = await loadGuildMeta()
  const region = guild?.region ?? FALLBACK_GUILD.region
  const defaultRealm = guild?.realm ?? FALLBACK_GUILD.realm
  const supabase = getSupabase()

  const { data: characters, error } = await supabase
    .from('characters')
    .select('name, realm, class, spec, role, is_main')
    .order('is_main', { ascending: false })
    .order('name')

  if (error) {
    console.error('[cron/droptimizer characters]', error.message)
    return res.status(500).json({ ok: false, error: error.message })
  }

  const selectedCharacters = requestedCharacterKey
    ? (characters ?? []).filter((member) => member.name?.trim().toLowerCase() === requestedCharacterKey)
    : (characters ?? [])

  if (requestedCharacterKey && !selectedCharacters.length) {
    return res.status(404).json({
      ok: false,
      error: `Character "${requestedCharacter}" not found`,
    })
  }

  const runDate = todayDateString()
  let raidsid

  try {
    raidsid = await createRaidbotsSession()
  } catch (sessionError) {
    console.error('[cron/droptimizer auth]', sessionError.message)
    return res.status(500).json({ ok: false, error: sessionError.message })
  }

  const summary = {
    ok: true,
    runDate,
    region,
    filters: {
      character: requestedCharacter,
      scenario: requestedScenario,
    },
    processed: [],
    skipped: [],
  }

  for (const member of selectedCharacters) {
    const realm = member.realm?.trim() || defaultRealm
    if (!member.name || !realm || !region) {
      summary.skipped.push({
        name: member.name ?? 'Unknown',
        reason: 'Missing name, realm, or region',
      })
      continue
    }

    const memberSummary = { name: member.name, realm, scenarios: {} }
    for (const scenarioKey of scenarioOrder) {
      memberSummary.scenarios[scenarioKey] = await runScenarioForCharacter(supabase, {
        member,
        region,
        realm,
        scenarioKey,
        runDate,
        raidsid,
      })
    }
    summary.processed.push(memberSummary)
  }

  return res.status(200).json(summary)
}
