/**
 * api/raidbots.js - Vercel serverless proxy for Raidbots
 *
 * POST /api/raidbots
 *   body: { simc: "...", type: "quick" }
 *   -> POST https://www.raidbots.com/api/job/advanced (or /quick or /droptimizer)
 *   -> returns { jobId }
 *
 * GET /api/raidbots?jobId=XXX
 *   -> GET https://www.raidbots.com/api/job/XXX
 *   -> returns { status, progress, resultUrl }
 */

import { pollRaidbotsJob, submitRaidbotsJob } from './_raidbots.js'

function hasValidWriteToken(req) {
  const provided = req.headers['x-write-token']
  const expected = process.env.GUILD_WRITE_TOKEN
  return !!expected && provided === expected
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!hasValidWriteToken(req)) {
    return res.status(401).json({ error: 'Invalid write token' })
  }

  try {
    if (req.method === 'GET') {
      const { jobId } = req.query
      if (!jobId) return res.status(400).json({ error: 'jobId query param required' })

      const job = await pollRaidbotsJob(jobId)
      return res.status(200).json(job)
    }

    if (req.method === 'POST') {
      const { simc, type = 'quick', advancedInput, droptimizer } = req.body ?? {}
      const data = await submitRaidbotsJob({ simc, type, advancedInput, droptimizer })
      return res.status(200).json({ jobId: data.jobId, raw: data.raw })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/raidbots]', err.message)
    const status = /required|must be set/i.test(err.message) ? 503 : 500
    return res.status(status).json({ error: err.message })
  }
}
