import { defineEventHandler, getRequestHeader, readBody } from 'nitro/h3'
import { start } from 'workflow/api'
import { AUTOMATED_DROPTIMIZER_SCENARIO, todayDateString } from '../../../api/_droptimizer-automation.js'
import { ENROLLMENT_STATUSES, loadEnrollment, updateEnrollmentValidation, TRIGGER_KINDS } from '../../../api/_droptimizer-store.js'
import { getSupabase, isConfigured } from '../../../api/_supabase.js'
import { processDroptimizerRuns } from '../../../workflows/droptimizer-runs.js'

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
  const characterName = String(body?.characterName ?? '').trim()
  const scenario = String(body?.scenario ?? '').trim()

  if (!characterName || scenario !== AUTOMATED_DROPTIMIZER_SCENARIO) {
    return { ok: false, error: 'characterName and a supported scenario are required' }
  }

  const supabase = getSupabase()
  const enrollment = await loadEnrollment(supabase, characterName, scenario)
  if (!enrollment?.payload) {
    return { ok: false, error: `No enrollment found for ${characterName}` }
  }

  await updateEnrollmentValidation(supabase, characterName, scenario, {
    enabled: false,
    validation_status: ENROLLMENT_STATUSES.pending,
    validation_error: null,
    validated_at: null,
  })

  const run = await start(processDroptimizerRuns, [{
    characterNames: [characterName],
    scenario,
    triggerKind: TRIGGER_KINDS.validation,
    runDate: todayDateString(),
    updateScheduler: false,
    validation: true,
    workflowRunId: null,
  }])

  return {
    ok: true,
    character: characterName,
    scenario,
    workflowRunId: run.runId,
  }
})
