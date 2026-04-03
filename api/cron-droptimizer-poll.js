/**
 * api/cron-droptimizer-poll.js
 *
 * Vercel Cron — runs every 5 minutes
 * Checks the status of pending Droptimizer jobs and, when complete,
 * writes the report URL back to `characters.droptimizerUrl` in Supabase.
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET   Vercel cron secret (auto-set by Vercel)
 */

import { createClient } from '@supabase/supabase-js'

const RAIDBOTS_BASE = 'https://www.raidbots.com'

// Only look at jobs submitted in the past 24 hours to avoid polling stale records
const MAX_AGE_HOURS = 24

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not set' })
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Fetch all pending jobs submitted in the last MAX_AGE_HOURS
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString()
  const { data: jobs, error } = await sb
    .from('droptimizer_jobs')
    .select('*')
    .in('status', ['queued', 'running'])
    .gte('submitted_at', cutoff)
    .order('submitted_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  if (!jobs?.length) return res.status(200).json({ message: 'No pending jobs' })

  const completed = []
  const stillRunning = []
  const failed = []

  for (const job of jobs) {
    if (!job.job_id) continue // submission itself failed — skip

    try {
      const r = await fetch(`${RAIDBOTS_BASE}/api/job/${job.job_id}?noLog=1`, {
        headers: { 'User-Agent': 'WowGearDiary/1.0' },
      })

      if (!r.ok) {
        console.warn(`[cron-droptimizer-poll] Job ${job.job_id} status check failed: ${r.status}`)
        continue
      }

      const data  = await r.json()
      // State may be nested under data.job or at top level depending on Raidbots version
      const state = data.job?.state ?? data.state ?? 'unknown'

      if (state === 'complete') {
        const reportUrl = `${RAIDBOTS_BASE}/simbot/report/${job.job_id}`

        // Update job record
        await sb.from('droptimizer_jobs').update({
          status:       'complete',
          report_url:   reportUrl,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id)

        // Write report URL back to the character record
        await sb.from('characters')
          .update({ droptimizer_url: reportUrl })
          .ilike('name', job.character_name) // case-insensitive match

        console.log(`[cron-droptimizer-poll] Completed: ${job.character_name} → ${reportUrl}`)
        completed.push({ name: job.character_name, reportUrl })

      } else if (state === 'error' || state === 'failed') {
        const errMsg = data.job?.error ?? data.error ?? state
        await sb.from('droptimizer_jobs').update({
          status:    'error',
          error_msg: errMsg,
        }).eq('id', job.id)

        console.error(`[cron-droptimizer-poll] Job failed: ${job.character_name} — ${errMsg}`)
        failed.push({ name: job.character_name, error: errMsg })

      } else {
        // queued / running / simulating — mark as running if not already
        if (job.status === 'queued') {
          await sb.from('droptimizer_jobs').update({ status: 'running' }).eq('id', job.id)
        }
        stillRunning.push({ name: job.character_name, state })
      }

    } catch (err) {
      console.error(`[cron-droptimizer-poll] Error checking ${job.job_id}:`, err.message)
    }
  }

  return res.status(200).json({
    checked:     jobs.length,
    completed:   completed.length,
    stillRunning: stillRunning.length,
    failed:      failed.length,
    details: { completed, stillRunning, failed },
  })
}
