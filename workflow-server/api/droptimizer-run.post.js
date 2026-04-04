import { defineEventHandler, getRequestHeader, readBody } from 'nitro/h3'
import { start } from 'workflow/api'
import { AUTOMATED_DROPTIMIZER_SCENARIO, todayDateString } from '../../api/_droptimizer-automation.js'
import { listBatchCandidates } from '../../api/_droptimizer-execution.js'
import { TRIGGER_KINDS, updateSchedulerState } from '../../api/_droptimizer-store.js'
import { getSupabase, isConfigured } from '../../api/_supabase.js'
import { processDroptimizerRuns } from '../../workflows/droptimizer-runs.js'

function ensureWriteToken(event) {
  const expected = process.env.GUILD_WRITE_TOKEN
  const provided = getRequestHeader(event, 'x-write-token')
  if (!expected || provided !== expected) {
    const error = new Error('Invalid write token')
    error.statusCode = 401
    throw error
  }
}

export default defineEventHandler(async (event) => {
  if (!isConfigured()) {
    return { ok: false, error: 'Supabase not configured' }
  }

  ensureWriteToken(event)
  const body = await readBody(event)
  const scenario = String(body?.scenario ?? '').trim()
  const characterName = String(body?.characterName ?? '').trim()
  const batch = body?.batch === true
  if (scenario !== AUTOMATED_DROPTIMIZER_SCENARIO) {
    return { ok: false, error: `Scenario "${scenario}" is not enabled for automation` }
  }

  if (batch) {
    const supabase = getSupabase()
    const { rows } = await listBatchCandidates(supabase, scenario)
    const characterNames = rows.map((row) => row.character.name)
    const runDate = todayDateString()

    const run = await start(processDroptimizerRuns, [{
      characterNames,
      scenario,
      triggerKind: TRIGGER_KINDS.automation,
      runDate,
      updateScheduler: true,
      validation: false,
      workflowRunId: null,
    }])

    await updateSchedulerState(supabase, scenario, {
      active_workflow_run_id: run.runId,
      current_run_date: runDate,
      last_kickoff_at: new Date().toISOString(),
      last_started_at: new Date().toISOString(),
      last_completed_at: null,
      last_error: null,
    })

    return {
      ok: true,
      mode: 'batch',
      scenario,
      runDate,
      characterNames,
      workflowRunId: run.runId,
    }
  }

  if (!characterName) {
    return { ok: false, error: 'characterName is required when batch=false' }
  }

  const run = await start(processDroptimizerRuns, [{
    characterNames: [characterName],
    scenario,
    triggerKind: TRIGGER_KINDS.manual,
    runDate: todayDateString(),
    updateScheduler: false,
    validation: false,
    workflowRunId: null,
  }])

  return {
    ok: true,
    mode: 'single',
    scenario,
    character: characterName,
    workflowRunId: run.runId,
  }
})
