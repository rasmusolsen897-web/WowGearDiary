import { AUTOMATED_DROPTIMIZER_SCENARIO } from '../_droptimizer-automation.js'
import { collectPendingRuns } from '../_droptimizer-execution.js'
import { loadRunningRuns, updateSchedulerState } from '../_droptimizer-store.js'
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

  try {
    const results = await collectPendingRuns(supabase)

    const allResolved = results.length > 0 && results.every(
      (r) => r.action === 'completed' || r.action === 'failed' || r.action === 'stale_timeout',
    )
    const noneRunning = results.every((r) => r.action !== 'still_running')

    if (allResolved || (results.length === 0)) {
      const remaining = await loadRunningRuns(supabase)
      if (remaining.length === 0) {
        await updateSchedulerState(supabase, AUTOMATED_DROPTIMIZER_SCENARIO, {
          last_completed_at: nowIso(),
        }).catch((e) => console.error('[cron/droptimizer-collect scheduler]', e.message))
      }
    }

    return res.status(200).json({
      ok: true,
      action: noneRunning ? 'all_resolved' : 'partial',
      collected: results.length,
      results,
    })
  } catch (error) {
    console.error('[cron/droptimizer-collect]', error.message)
    return res.status(500).json({ ok: false, error: error.message })
  }
}
