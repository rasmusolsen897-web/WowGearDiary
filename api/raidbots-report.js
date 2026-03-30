/**
 * api/raidbots-report.js — Proxy for public Raidbots report data
 *
 * GET /api/raidbots-report?id=REPORT_ID
 *   → GET https://www.raidbots.com/simbot/report/{id}/data.json
 *   → returns the SimC JSON (no auth required — reports are public)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id query param required' })

  try {
    const upstream = await fetch(`https://www.raidbots.com/simbot/report/${id}/data.json`, {
      headers: { 'User-Agent': 'WowGearDiary/1.0' },
    })

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Report not found (${upstream.status})` })
    }

    const data = await upstream.json()
    // Cache for 1 hour — report data never changes once complete
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/raidbots-report]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
