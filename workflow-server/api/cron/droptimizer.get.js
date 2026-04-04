import { defineEventHandler, getRequestHeader } from 'nitro/h3'
import { start } from 'workflow/api'
import { AUTOMATED_DROPTIMIZER_SCENARIO, todayDateString } from '../../../api/_droptimizer-automation.js'
import { listBatchCandidates } from '../../../api/_droptimizer-execution.js'
import { ensureSchedulerState, TRIGGER_KINDS, updateSchedulerState } from '../../../api/_droptimizer-store.js'
import { getSupabase, isConfigured } from '../../../api/_supabase.js'
import { processDroptimizerRuns } from '../../../workflows/droptimizer-runs.js'

function nowIso(date = new Date()) {
  return date.toISOString()
}

export default defineEventHandler(async (event) => {
  const authHeader = getRequestHeader(event, 'authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const error = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }

  if (!isConfigured()) {
    return { ok: false, error: 'Supabase not configured' }
  }

  const supabase = getSupabase()
  const runDate = todayDateString()
  const scheduler = await ensureSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO)

  if (scheduler?.current_run_date === runDate && scheduler?.last_kickoff_at) {
    return {
      ok: true,
      action: 'already_started',
      scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
      runDate,
      lastKickoffAt: scheduler.last_kickoff_at,
      workflowRunId: scheduler.active_workflow_run_id ?? null,
    }
  }

  const { rows } = await listBatchCandidates(supabase, AUTOMATED_DROPTIMIZER_SCENARIO)
  const characterNames = rows.map((row) => row.character.name)
  const run = await start(processDroptimizerRuns, [{
    characterNames,
    scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
    triggerKind: TRIGGER_KINDS.automation,
    runDate,
    updateScheduler: true,
    validation: false,
    workflowRunId: null,
  }])

  await updateSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO, {
    active_workflow_run_id: run.runId,
    current_run_date: runDate,
    last_kickoff_at: nowIso(),
    last_started_at: nowIso(),
    last_completed_at: null,
    last_error: null,
  })

  return {
    ok: true,
    action: 'started',
    scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
    runDate,
    attempted: characterNames.length,
    workflowRunId: run.runId,
  }
})
