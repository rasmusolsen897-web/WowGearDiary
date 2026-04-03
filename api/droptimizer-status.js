import { AUTOMATED_DROPTIMIZER_SCENARIO, todayDateString } from './_droptimizer-automation.js'
import { isQueueRunEligible, summarizeAutomationQueue } from './_droptimizer-status.js'
import { getSupabase, isConfigured } from './_supabase.js'

function summarizeRun(run, now) {
  if (!run) return null
  return {
    id: run.id ?? null,
    character: run.character_name ?? null,
    status: run.status ?? null,
    attemptCount: run.attempt_count ?? 0,
    nextRetryAt: run.next_retry_at ?? null,
    startedAt: run.started_at ?? null,
    completedAt: run.completed_at ?? null,
    errorMessage: run.error_message ?? null,
    realm: run.realm ?? '',
    isMain: run.is_main !== false,
    isEligible: isQueueRunEligible(run, now),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isConfigured()) {
    return res.status(200).json({
      ok: true,
      available: false,
      scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
      reason: 'Supabase not configured',
    })
  }

  const supabase = getSupabase()
  const runDate = todayDateString()
  const now = Date.now()

  const [schedulerResult, charactersResult, runsResult] = await Promise.all([
    supabase
      .from('droptimizer_scheduler_state')
      .select('scenario, active_run_id, lock_token, lock_expires_at, last_seeded_run_date, updated_at')
      .eq('scenario', AUTOMATED_DROPTIMIZER_SCENARIO)
      .maybeSingle(),
    supabase
      .from('characters')
      .select('name, realm, is_main')
      .order('is_main', { ascending: false })
      .order('name'),
    supabase
      .from('sim_runs')
      .select('id, character_name, status, attempt_count, next_retry_at, started_at, completed_at, error_message')
      .eq('scenario', AUTOMATED_DROPTIMIZER_SCENARIO)
      .eq('run_date', runDate),
  ])

  if (schedulerResult.error) {
    console.error('[api/droptimizer-status scheduler]', schedulerResult.error.message)
    return res.status(500).json({ error: schedulerResult.error.message })
  }

  if (charactersResult.error) {
    console.error('[api/droptimizer-status characters]', charactersResult.error.message)
    return res.status(500).json({ error: charactersResult.error.message })
  }

  if (runsResult.error) {
    console.error('[api/droptimizer-status runs]', runsResult.error.message)
    return res.status(500).json({ error: runsResult.error.message })
  }

  const scheduler = schedulerResult.data
  if (!scheduler) {
    return res.status(500).json({ error: 'Missing droptimizer scheduler state' })
  }

  const characters = charactersResult.data ?? []
  const runs = runsResult.data ?? []
  const queueSummary = summarizeAutomationQueue({ runs, characters, now })

  let activeRun = null
  if (scheduler.active_run_id) {
    activeRun = runs.find((run) => run.id === scheduler.active_run_id) ?? null

    if (!activeRun) {
      const activeRunResult = await supabase
        .from('sim_runs')
        .select('id, character_name, status, attempt_count, next_retry_at, started_at, completed_at, error_message')
        .eq('id', scheduler.active_run_id)
        .maybeSingle()

      if (activeRunResult.error) {
        console.error('[api/droptimizer-status active]', activeRunResult.error.message)
        return res.status(500).json({ error: activeRunResult.error.message })
      }

      activeRun = activeRunResult.data ?? null
    }
  }

  const lockExpiresAt = scheduler.lock_expires_at ?? null
  const lockHeld = Boolean(
    scheduler.lock_token
    && lockExpiresAt
    && !Number.isNaN(Date.parse(lockExpiresAt))
    && Date.parse(lockExpiresAt) > now,
  )

  return res.status(200).json({
    ok: true,
    available: true,
    scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
    runDate,
    scheduler: {
      updatedAt: scheduler.updated_at ?? null,
      lastSeededRunDate: scheduler.last_seeded_run_date ?? null,
      lockHeld,
      lockExpiresAt,
    },
    counts: queueSummary.counts,
    activeRun: summarizeRun(activeRun ?? queueSummary.inferredActiveRun, now),
    nextQueuedRun: summarizeRun(queueSummary.nextRunnableRun, now),
    queueHeadRun: summarizeRun(queueSummary.queueHeadRun, now),
    queuePreview: queueSummary.queuePreview.map((run) => summarizeRun(run, now)),
  })
}
