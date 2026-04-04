import { AUTOMATED_DROPTIMIZER_SCENARIO, todayDateString } from './_droptimizer-automation.js'
import { buildAutomationStatus } from './_droptimizer-execution.js'
import { ensureSchedulerState } from './_droptimizer-store.js'
import { getSupabase, isConfigured } from './_supabase.js'

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

  try {
    const supabase = getSupabase()
    const [scheduler, status] = await Promise.all([
      ensureSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO),
      buildAutomationStatus(supabase, AUTOMATED_DROPTIMIZER_SCENARIO),
    ])

    return res.status(200).json({
      ok: true,
      available: true,
      scenario: AUTOMATED_DROPTIMIZER_SCENARIO,
      runDate: scheduler?.current_run_date ?? todayDateString(),
      activeWorkflowRunId: scheduler?.active_workflow_run_id ?? null,
      lastStartedAt: scheduler?.last_started_at ?? null,
      lastCompletedAt: scheduler?.last_completed_at ?? null,
      lastError: scheduler?.last_error ?? null,
      scheduler: {
        updatedAt: scheduler?.updated_at ?? null,
        currentRunDate: scheduler?.current_run_date ?? null,
        activeWorkflowRunId: scheduler?.active_workflow_run_id ?? null,
        lastKickoffAt: scheduler?.last_kickoff_at ?? null,
      },
      counts: status.counts,
      rows: status.rows,
      guild: {
        region: status.guild?.region ?? null,
        realm: status.guild?.realm ?? null,
      },
    })
  } catch (error) {
    console.error('[api/droptimizer-status]', error.message)
    return res.status(500).json({ error: error.message })
  }
}
