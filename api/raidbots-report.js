import { getBlizzardToken, API_HOST } from './_blizzardAuth.js'
import { applyRateLimit } from './_rateLimit.js'
import { fetchAndParseRaidbotsReport } from './_raidbots-report.js'

/**
 * Look up item names + quality from Blizzard static API.
 * Returns a map of { [itemId]: { name, quality } }.
 * Failures are silently swallowed so callers can fall back gracefully.
 */
async function fetchItemDetails(itemIds) {
  if (!itemIds.length) return {}

  let token
  try {
    token = await getBlizzardToken('eu')
  } catch {
    return {}
  }

  const host = API_HOST.eu
  const results = await Promise.allSettled(
    itemIds.map((id) =>
      fetch(`${host}/data/wow/item/${id}?namespace=static-eu&locale=en_US`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => (response.ok ? response.json() : null))
    )
  )

  const map = {}
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      map[itemIds[index]] = {
        name: result.value.name ?? null,
        quality: result.value.quality?.type ?? 'COMMON',
      }
    }
  })
  return map
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id query param required' })
  if (!/^[A-Za-z0-9]{6,64}$/.test(id)) {
    return res.status(400).json({ error: 'invalid report id' })
  }

  const rateLimit = applyRateLimit(req, res, {
    key: 'raidbots-report',
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.ok) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter })
  }

  try {
    const { data } = await fetchAndParseRaidbotsReport(id)

    if (data?.type === 'droptimizer' && Array.isArray(data.upgrades)) {
      const uniqueIds = [...new Set(
        data.upgrades
          .map((item) => item.itemId ?? item.item_id ?? null)
          .filter(Boolean)
      )]
      const itemDetails = await fetchItemDetails(uniqueIds)

      data.upgrades = data.upgrades.map((item) => {
        const itemId = item.itemId ?? item.item_id ?? null
        const details = itemId ? itemDetails[itemId] : null
        const fallbackName = item.itemName ?? item.item_name ?? item.name ?? (itemId ? `Item ${itemId}` : 'Unknown Item')

        return {
          ...item,
          itemName: details?.name ?? item.itemName ?? item.item_name ?? fallbackName,
          name: details?.name ?? item.itemName ?? item.item_name ?? fallbackName,
          quality: details?.quality ?? item.quality ?? 'COMMON',
        }
      })
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/raidbots-report]', err.message)
    const statusMatch = err.message.match(/\((\d{3})\)/)
    const status = statusMatch ? Number(statusMatch[1]) : 500
    return res.status(status).json({ error: err.message })
  }
}
