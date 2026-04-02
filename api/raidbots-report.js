import { getBlizzardToken, API_HOST } from './_blizzardAuth.js'

/**
 * api/raidbots-report.js — Proxy for public Raidbots report data
 *
 * GET /api/raidbots-report?id=REPORT_ID
 *
 * Detection strategy (Raidbots removed the `simbot` wrapper from data.json ~2025):
 *   1. Fetch /data.csv — lightweight, always present
 *   2. If CSV rows contain slash-delimited item profiles → Droptimizer
 *      Parse items from CSV, return compact normalized shape
 *   3. If only a baseline row → Quick Sim
 *      Fall through to data.json, return raw for the hook to read
 *
 * Droptimizer CSV row name format:
 *   encounterSourceId/encounterNpcId/difficulty/itemId/itemLevel/bonusId/slot///
 *   e.g. "1308/2740/raid-heroic/249920/276/7967/finger2///"
 */

const SLOT_NAMES = new Set([
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands',
  'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2',
  'mainhand', 'main_hand', 'offhand', 'off_hand', 'ranged',
])

/** Parse a simple CSV line into an array of trimmed strings */
function parseCSVLine(line) {
  return line.split(',').map(c => c.trim())
}

/** Parse full CSV text → array of string arrays (including header row) */
function parseCSV(text) {
  return text.trim().split('\n').map(parseCSVLine)
}

/**
 * Parse the slash-delimited Droptimizer sim name into structured fields.
 * Format: encounterSourceId/encounterNpcId/difficulty/itemId/itemLevel/bonusId/slot
 */
function parseSimName(name) {
  const parts = name.split('/')

  // Difficulty segment matches known prefixes
  const diffIdx = parts.findIndex(p => /^(raid-|mythic-plus|world-boss|pvp|vault)/i.test(p))
  const source = diffIdx >= 0
    ? parts[diffIdx].replace(/-/g, ' ')
    : ''

  // itemId is immediately after the difficulty segment
  const itemId = diffIdx >= 0 ? parseInt(parts[diffIdx + 1], 10) || 0 : 0

  // itemLevel is 2 segments after difficulty
  const itemLevel = diffIdx >= 0 ? parseInt(parts[diffIdx + 2], 10) || 0 : 0

  // Slot matches a known slot name anywhere in the path
  const slot = parts.find(p => SLOT_NAMES.has(p)) ?? ''

  return { itemId, itemLevel, slot, source }
}

/**
 * Look up item names + quality from Blizzard static API.
 * Returns a map of { [itemId]: { name, quality } }.
 * Failures are silently swallowed — caller falls back to "Item {id}".
 */
async function fetchItemDetails(itemIds) {
  if (!itemIds.length) return {}
  let token
  try { token = await getBlizzardToken('eu') } catch { return {} }

  const host = API_HOST.eu
  const results = await Promise.allSettled(
    itemIds.map(id =>
      fetch(`${host}/data/wow/item/${id}?namespace=static-eu&locale=en_US`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : null)
    )
  )

  const map = {}
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      map[itemIds[i]] = {
        name:    r.value.name        ?? null,
        quality: r.value.quality?.type ?? 'COMMON',
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

  const baseUrl = `https://www.raidbots.com/simbot/report/${id}`

  try {
    // ── Step 1: Fetch CSV (lightweight, always available) ────────────────────
    const csvRes = await fetch(`${baseUrl}/data.csv`, {
      headers: { 'User-Agent': 'WowGearDiary/1.0' },
    })

    if (!csvRes.ok) {
      return res.status(csvRes.status).json({ error: `Report not found (${csvRes.status})` })
    }

    const csvText = await csvRes.text()
    const [_header, ...dataRows] = parseCSV(csvText)

    const baselineRow = dataRows.find(r => !r[0]?.includes('/'))
    const itemRows    = dataRows.filter(r => r[0]?.includes('/'))

    // ── Step 2: Droptimizer — item rows present ───────────────────────────────
    if (itemRows.length > 0) {
      const characterName = baselineRow?.[0] ?? null
      const baseDps       = parseFloat(baselineRow?.[1] ?? '0') || 0

      // Parse all rows first, then bulk-enrich with Blizzard item names
      const parsedItems = itemRows.map(row => {
        const { itemId, itemLevel, slot, source } = parseSimName(row[0])
        const dps      = parseFloat(row[1]) || 0
        const dpsDelta = Math.round(dps - baseDps)
        const dpsPct   = baseDps > 0
          ? Math.round(dpsDelta / baseDps * 10000) / 100
          : 0
        return { itemId, itemLevel, slot, source, dpsDelta, dpsPct }
      })

      const uniqueIds = [...new Set(parsedItems.map(u => u.itemId).filter(Boolean))]
      const itemDetails = await fetchItemDetails(uniqueIds)

      const upgrades = parsedItems
        .map(u => ({
          itemId:    u.itemId,
          name:      itemDetails[u.itemId]?.name    ?? `Item ${u.itemId}`,
          quality:   itemDetails[u.itemId]?.quality ?? 'COMMON',
          slot:      u.slot,
          itemLevel: u.itemLevel,
          dpsDelta:  u.dpsDelta,
          dpsPct:    u.dpsPct,
          source:    u.source,
        }))
        .sort((a, b) => b.dpsDelta - a.dpsDelta)

      // Infer difficulty from first item row
      const difficulty = itemRows[0][0].split('/')
        .find(p => /^(raid-|mythic-plus|world-boss|pvp)/i.test(p)) ?? null

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
      return res.status(200).json({
        type: 'droptimizer',
        characterName,
        spec:       null,           // not available in CSV
        baseDps:    Math.round(baseDps),
        difficulty,
        upgrades,
      })
    }

    // ── Step 3: Quick Sim — fall back to data.json ───────────────────────────
    const jsonRes = await fetch(`${baseUrl}/data.json`, {
      headers: { 'User-Agent': 'WowGearDiary/1.0' },
    })

    if (!jsonRes.ok) {
      return res.status(jsonRes.status).json({ error: `Report not found (${jsonRes.status})` })
    }

    const data = await jsonRes.json()
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json(data)

  } catch (err) {
    console.error('[api/raidbots-report]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
