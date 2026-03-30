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

    // ── Droptimizer: parse server-side, return compact shape ──────────────────
    if (data?.simbot?.type === 'droptimizer') {
      const baseDps = Math.round(data?.sim?.players?.[0]?.collected_data?.dps?.mean ?? 0)

      // Primary path: simbot.droptimizer.upgrades[]
      let upgrades = null
      const raw = data?.simbot?.droptimizer?.upgrades
      if (Array.isArray(raw) && raw.length) {
        upgrades = raw.map(u => ({
          itemId:    u.id ?? 0,
          name:      u.name ?? 'Unknown',
          slot:      u.slot ?? '',
          itemLevel: u.itemLevel ?? 0,
          dpsDelta:  Math.round(u.dps ?? 0),
          dpsPct:    baseDps > 0 ? Math.round((u.dps ?? 0) / baseDps * 10000) / 100 : 0,
          source:    u.sourceName ?? u.source ?? '',
        }))
      }

      // Fallback path: sim.profilesets.results[]
      if (!upgrades) {
        const results = data?.sim?.profilesets?.results
        if (Array.isArray(results) && results.length) {
          upgrades = results
            .filter(r => typeof r.mean === 'number')
            .map(r => {
              const parts = (r.name ?? '').split('/')
              const slot  = (parts[1] ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const delta = Math.round(r.mean)
              return {
                itemId:    parseInt(parts[2] ?? '0', 10),
                name:      `Item ${parts[2] ?? '?'}`,
                slot,
                itemLevel: 0,
                dpsDelta:  delta,
                dpsPct:    baseDps > 0 ? Math.round(delta / baseDps * 10000) / 100 : 0,
                source:    '',
              }
            })
        }
      }

      upgrades = (upgrades ?? []).sort((a, b) => b.dpsDelta - a.dpsDelta)

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
      return res.status(200).json({
        type:          'droptimizer',
        characterName: data?.sim?.players?.[0]?.name ?? null,
        spec:          data?.simbot?.meta?.specName ?? null,
        baseDps,
        difficulty:    data?.simbot?.droptimizer?.difficulty ?? null,
        upgrades,
      })
    }

    // ── All other report types (Quick Sim, Top Gear, etc.) ───────────────────
    // Cache for 1 hour — report data never changes once complete
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/raidbots-report]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
