import { sleep } from 'workflow'

const SUBMIT_SPACING = '60s'
const POLL_INTERVAL = '60s'
const MAX_ATTEMPTS = 3
const MAX_POLLS = 30

function extractHttpStatus(message) {
  const match = String(message ?? '').match(/\((\d{3})\):/)
  return match ? Number.parseInt(match[1], 10) : null
}

function extractErrorCode(message) {
  const match = String(message ?? '').match(/"error":"([^"]+)"/i)
  return match ? match[1] : null
}

function classifyFailure(message) {
  const normalized = String(message ?? '').trim() || 'Unknown Droptimizer error'
  const httpStatus = extractHttpStatus(normalized)
  const errorCode = extractErrorCode(normalized)
  const permanentCodes = new Set([
    'droptimizer_no_actors',
    'droptimizer_no_instance_selected',
    'unsupported_spec',
  ])
  const transientHttpStatuses = new Set([408, 429, 500, 502, 503, 504])

  if (errorCode && permanentCodes.has(errorCode)) {
    return { kind: 'permanent', message: normalized }
  }

  if (httpStatus && transientHttpStatuses.has(httpStatus)) {
    return { kind: 'transient', message: normalized }
  }

  if (httpStatus && httpStatus >= 400) {
    return { kind: 'permanent', message: normalized }
  }

  if (/report not found/i.test(normalized)) {
    return { kind: 'transient', message: normalized }
  }

  if (/timed out|timeout|network|fetch failed|socket|econnreset|enotfound|temporar/i.test(normalized)) {
    return { kind: 'transient', message: normalized }
  }

  return { kind: 'transient', message: normalized }
}

export async function processDroptimizerRuns(input) {
  "use workflow";

  const {
    characterNames = [],
    scenario,
    triggerKind,
    runDate,
    updateScheduler = false,
    validation = false,
    workflowRunId = null,
  } = input ?? {}

  const results = []

  for (let index = 0; index < characterNames.length; index += 1) {
    const characterName = characterNames[index]
    if (index > 0) {
      await sleep(SUBMIT_SPACING)
    }

    if (validation) {
      await markValidationPendingStep(characterName, scenario)
    }

    let submitted = null
    let completed = false

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !completed; attempt += 1) {
      try {
        submitted = await submitCharacterStep({
          characterName,
          scenario,
          triggerKind,
          runDate,
          workflowRunId,
          validation,
          attempt,
        })
      } catch (error) {
        const failure = classifyFailure(error?.message ?? error)
        const shouldRetry = failure.kind === 'transient' && attempt < MAX_ATTEMPTS
        if (shouldRetry) {
          continue
        }

        const finalized = await finalizeFailureStep({
          characterName,
          scenario,
          errorMessage: failure.message,
          runId: submitted?.runId ?? null,
          validation,
        })
        results.push({
          ok: false,
          character: characterName,
          error: finalized.message,
          kind: finalized.kind,
          runId: submitted?.runId ?? null,
        })
        completed = true
        break
      }

      let pollFailures = 0

      for (let pollIndex = 0; pollIndex < MAX_POLLS && !completed; pollIndex += 1) {
        await sleep(POLL_INTERVAL)

        try {
          const result = await pollCharacterStep({
            characterName,
            scenario,
            simId: submitted.simId,
            runId: submitted.runId,
            payloadActor: submitted.payloadActor,
            realm: submitted.realm,
            validation,
          })

          if (result.status === 'completed') {
            results.push({
              ok: true,
              character: characterName,
              reportUrl: result.reportUrl,
              runId: submitted.runId ?? null,
            })
            completed = true
          }
        } catch (error) {
          const failure = classifyFailure(error?.message ?? error)
          if (failure.kind === 'transient' && pollFailures < (MAX_ATTEMPTS - 1)) {
            pollFailures += 1
            continue
          }

          const finalized = await finalizeFailureStep({
            characterName,
            scenario,
            errorMessage: failure.message,
            runId: submitted.runId ?? null,
            validation,
          })
          results.push({
            ok: false,
            character: characterName,
            error: finalized.message,
            kind: finalized.kind,
            runId: submitted.runId ?? null,
          })
          completed = true
        }
      }

      if (!completed) {
        const finalized = await finalizeFailureStep({
          characterName,
          scenario,
          errorMessage: 'Timed out waiting for Droptimizer report',
          runId: submitted?.runId ?? null,
          validation,
        })
        results.push({
          ok: false,
          character: characterName,
          error: finalized.message,
          kind: finalized.kind,
          runId: submitted?.runId ?? null,
        })
        completed = true
      }
    }
  }

  if (updateScheduler) {
    await completeBatchStep({
      scenario,
      runDate,
      workflowRunId,
      results,
    })
  }

  return {
    scenario,
    validation,
    runDate,
    results,
  }
}

async function markValidationPendingStep(characterName, scenario) {
  "use step";

  const { getSupabase } = await import('../api/_supabase.js')
  const { ENROLLMENT_STATUSES, updateEnrollmentValidation } = await import('../api/_droptimizer-store.js')
  const supabase = getSupabase()

  return updateEnrollmentValidation(supabase, characterName, scenario, {
    enabled: false,
    validation_status: ENROLLMENT_STATUSES.pending,
    validation_error: null,
    validated_at: null,
  })
}

async function submitCharacterStep(input) {
  "use step";

  const { getSupabase } = await import('../api/_supabase.js')
  const { startScenarioSubmission } = await import('../api/_droptimizer-execution.js')
  const supabase = getSupabase()
  const result = await startScenarioSubmission({
    supabase,
    characterName: input.characterName,
    scenario: input.scenario,
    triggerKind: input.triggerKind,
    workflowRunId: input.workflowRunId,
    runDate: input.runDate,
    validation: input.validation,
    attemptCount: input.attempt,
  })

  return {
    simId: result.simId,
    runId: result.run?.id ?? null,
    realm: result.realm,
    payloadActor: result.payload?.character ?? null,
  }
}

async function pollCharacterStep(input) {
  "use step";

  const { getSupabase } = await import('../api/_supabase.js')
  const { pollScenarioSubmission } = await import('../api/_droptimizer-execution.js')
  const supabase = getSupabase()

  return pollScenarioSubmission({
    supabase,
    characterName: input.characterName,
    scenario: input.scenario,
    simId: input.simId,
    runId: input.runId,
    payloadActor: input.payloadActor,
    realm: input.realm,
    validation: input.validation,
  })
}

async function finalizeFailureStep(input) {
  "use step";

  const { getSupabase } = await import('../api/_supabase.js')
  const { finalizeScenarioFailure } = await import('../api/_droptimizer-execution.js')
  const supabase = getSupabase()

  return finalizeScenarioFailure({
    supabase,
    characterName: input.characterName,
    scenario: input.scenario,
    error: new Error(input.errorMessage),
    runId: input.runId,
    validation: input.validation,
  })
}

async function completeBatchStep(input) {
  "use step";

  const { getSupabase } = await import('../api/_supabase.js')
  const { updateSchedulerState } = await import('../api/_droptimizer-store.js')
  const supabase = getSupabase()
  const lastError = input.results.find((result) => result.ok === false)?.error ?? null

  return updateSchedulerState(supabase, input.scenario, {
    active_workflow_run_id: null,
    current_run_date: input.runDate,
    last_completed_at: new Date().toISOString(),
    last_error: lastError,
  })
}
