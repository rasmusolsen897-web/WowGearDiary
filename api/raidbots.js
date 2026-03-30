/**
 * api/raidbots.js — Vercel serverless proxy for Raidbots
 *
 * POST /api/raidbots
 *   body: { simc: "...", type: "quick" }
 *   → POST https://www.raidbots.com/api/job/advanced (or /quick)
 *   → returns { jobId }
 *
 * GET /api/raidbots?jobId=XXX
 *   → GET https://www.raidbots.com/api/job/XXX
 *   → returns { status, progress, resultUrl }
 */

const RAIDBOTS_BASE = 'https://www.raidbots.com'

// Map friendly type names to Raidbots endpoint paths
const SIM_TYPE_MAP = {
  quick:        '/api/job/quick',
  advanced:     '/api/job/advanced',
  droptimizer:  '/api/job/droptimizer',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const session = process.env.RAIDBOTS_SESSION
  const csrf    = process.env.RAIDBOTS_CSRF

  if (!session || !csrf) {
    return res.status(503).json({ error: 'RAIDBOTS_SESSION and RAIDBOTS_CSRF must be set' })
  }

  try {
    // ── Poll job status ───────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { jobId } = req.query
      if (!jobId) return res.status(400).json({ error: 'jobId query param required' })

      const pollRes = await fetch(`${RAIDBOTS_BASE}/api/job/${jobId}`, {
        headers: {
          Cookie: `raidsid=${session}`,
          'x-csrf-token': csrf,
          'User-Agent': 'WowGearDiary/1.0',
        },
      })

      if (!pollRes.ok) {
        const text = await pollRes.text()
        return res.status(pollRes.status).json({ error: `Raidbots poll failed: ${text}` })
      }

      const job = await pollRes.json()

      return res.status(200).json({
        status:    job.job?.status ?? 'unknown',
        progress:  job.job?.progress ?? 0,
        resultUrl: job.job?.status === 'complete'
          ? `${RAIDBOTS_BASE}/simbot/report/${jobId}`
          : null,
        raw: job,
      })
    }

    // ── Submit sim ────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { simc, type = 'quick', advancedInput, droptimizer } = req.body ?? {}

      if (!simc && !advancedInput) {
        return res.status(400).json({ error: 'simc or advancedInput required in request body' })
      }

      const endpoint = SIM_TYPE_MAP[type] ?? SIM_TYPE_MAP.quick

      // Build the Raidbots job payload
      const payload = type === 'droptimizer'
        ? {
            region:    droptimizer?.region   ?? 'eu',
            realm:     droptimizer?.realm    ?? 'tarren-mill',
            name:      droptimizer?.name     ?? '',
            simcVersion: 'nightly',
            ...droptimizer,
          }
        : type === 'advanced'
          ? { advancedInput }
          : { simc, simcVersion: 'nightly' }

      const submitRes = await fetch(`${RAIDBOTS_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `raidsid=${session}`,
          'x-csrf-token': csrf,
          'User-Agent': 'WowGearDiary/1.0',
          Referer: 'https://www.raidbots.com/simbot',
          Origin: 'https://www.raidbots.com',
        },
        body: JSON.stringify(payload),
      })

      if (!submitRes.ok) {
        const text = await submitRes.text()
        return res.status(submitRes.status).json({ error: `Raidbots submit failed (${submitRes.status}): ${text}` })
      }

      const data = await submitRes.json()
      const jobId = data.job?.id ?? data.id ?? null

      if (!jobId) {
        return res.status(500).json({ error: 'Raidbots did not return a job ID', raw: data })
      }

      return res.status(200).json({ jobId })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/raidbots]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
