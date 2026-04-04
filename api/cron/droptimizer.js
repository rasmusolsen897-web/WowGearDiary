import { AUTOMATED_DROPTIMIZER_SCENARIO, todayDateString } from '../_droptimizer-automation.js'
import { executeDirectScenario, listBatchCandidates } from '../_droptimizer-execution.js'
import { ensureSchedulerState, TRIGGER_KINDS, updateSchedulerState } from '../_droptimizer-store.js'
import { getSupabase, isConfigured } from '../_supabase.js'

function nowIso(date = new Date()) {
  return date.toISOString()
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

  const supabase = getSupabase()
  const runDate = todayDateString()

  try {
    const scheduler = await ensureSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO)
    if (scheduler?.current_run_date === runDate && scheduler?.last_kickoff_at) {
      return res.status(200).json({
        ok: true,
        action: 'already_started',
        scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
        runDate,
        lastKickoffAt: scheduler.last_kickoff_at,
      })
    }

    await updateSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO, {
      current_run_date: runDate,
      last_kickoff_at: nowIso(),
      last_started_at: nowIso(),
      last_completed_at: null,
      last_error: null,
      active_workflow_run_id: null,
    })

    const { rows } = await listBatchCandidates(supabase, AUTOMATED_DROPTIMIZER_SCENARIO)
    const results = []

    for (const row of rows) {
      results.push(await executeDirectScenario({
        supabase,
        characterName: row.character.name,
        scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
        triggerKind: TRIGGER_KINDS.automation,
        runDate,
      }))
    }

    const lastError = results.find((result) => result.ok === false)?.error ?? null
    await updateSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO, {
      active_workflow_run_id: null,
      current_run_date: runDate,
      last_completed_at: nowIso(),
      last_error: lastError,
    })

    return res.status(200).json({
      ok: true,
      action: 'completed',
      scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
      runDate,
      attempted: rows.length,
      results,
    })
  } catch (error) {
    await updateSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO, {
      current_run_date: runDate,
      active_workflow_run_id: null,
      last_error: error.message,
    }).catch((updateError) => {
      console.error('[cron/droptimizer scheduler]', updateError.message)
    })

    console.error('[cron/droptimizer]', error.message)
    return res.status(500).json({ ok: false, error: error.message })
  }
}
