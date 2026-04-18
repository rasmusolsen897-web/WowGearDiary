/**
 * api/blizzard.js — Vercel serverless proxy for Blizzard Battle.net API
 *
 * GET /api/blizzard?action=token&region=eu
 *   → POST https://oauth.battle.net/token (client_credentials)
 *   → returns { access_token, expires_in }
 *
 * GET /api/blizzard?action=character&region=eu&realm=tarren-mill&name=whooplol
 *   → fetches a fresh token, then GET character equipment endpoint
 *   → returns normalized { name, realm, avgIlvl, gear[] }
 *
 * GET /api/blizzard?action=media&region=eu&realm=tarren-mill&name=whooplol
 *   → returns { avatarUrl } (character portrait)
 */

import { getBlizzardToken, API_HOST } from './_blizzardAuth.js'
import { applyRateLimit } from './_rateLimit.js'
import { buildBlizzardPathSegment } from '../src/utils/characterIdentity.js'

const VALID_REGIONS = new Set(['eu', 'us', 'kr', 'tw'])

function isSafeQueryValue(value) {
  const normalized = String(value ?? '').normalize('NFC').trim()
  return normalized.length >= 1 && normalized.length <= 40 && !/[/?#\\]/.test(normalized)
}

function normalizeSlotType(type) {
  const map = {
    HEAD: 'Head', NECK: 'Neck', SHOULDER: 'Shoulder', BACK: 'Back',
    CHEST: 'Chest', WRIST: 'Wrist', HANDS: 'Hands', WAIST: 'Waist',
    LEGS: 'Legs', FEET: 'Feet', FINGER_1: 'Ring 1', FINGER_2: 'Ring 2',
    TRINKET_1: 'Trinket 1', TRINKET_2: 'Trinket 2',
    MAIN_HAND: 'Weapon', OFF_HAND: 'Off-Hand',
  }
  return map[type] ?? type
}

async function fetchCharacter(region, realm, name, token) {
  const host      = API_HOST[region] ?? API_HOST.eu
  const namespace = `profile-${region}`
  const realmSlug = buildBlizzardPathSegment(realm)
  const nameSlug  = buildBlizzardPathSegment(name)

  const [equipRes, summaryRes] = await Promise.all([
    fetch(`${host}/profile/wow/character/${realmSlug}/${nameSlug}/equipment?namespace=${namespace}&locale=en_US`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${host}/profile/wow/character/${realmSlug}/${nameSlug}?namespace=${namespace}&locale=en_US`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ])

  if (!equipRes.ok) {
    throw new Error(`Character not found: ${name}-${realm} (${equipRes.status})`)
  }

  const [equip, summary] = await Promise.all([equipRes.json(), summaryRes.ok ? summaryRes.json() : {}])

  const gear = (equip.equipped_items ?? []).map((item) => ({
    slot:    normalizeSlotType(item.slot?.type ?? ''),
    item:    item.name ?? 'Unknown',
    ilvl:    item.level?.value ?? 0,
    id:      item.item?.id ?? null,
    quality: item.quality?.type ?? 'COMMON',
    isTier:  item.set != null,
  }))

  const CRAFTED_WEAPON_MIN_ILVL = 285
  const tierCount = gear.filter(g => g.isTier).length
  const craftedWeapon = gear.find(g =>
    (g.slot === 'Weapon' || g.slot === 'Off-Hand') && g.ilvl >= CRAFTED_WEAPON_MIN_ILVL
  )
  const hasCraftedWeapon  = craftedWeapon != null
  const craftedWeaponIlvl = craftedWeapon?.ilvl ?? null

  const avgIlvl = summary.equipped_item_level ?? summary.average_item_level ?? 0

  return {
    name:    summary.name ?? name,
    realm:   summary.realm?.name ?? realm,
    class:   summary.character_class?.name ?? '',
    spec:    summary.active_spec?.name ?? '',
    level:   summary.level ?? 0,
    faction: summary.faction?.type ?? '',
    avgIlvl,
    gear,
    tierCount,
    hasCraftedWeapon,
    craftedWeaponIlvl,
  }
}

function isDebugRequest(req) {
  return req.query?.debug === '1'
}

async function fetchMedia(region, realm, name, token) {
  const host      = API_HOST[region] ?? API_HOST.eu
  const namespace = `profile-${region}`
  const realmSlug = buildBlizzardPathSegment(realm)
  const nameSlug  = buildBlizzardPathSegment(name)

  const res = await fetch(
    `${host}/profile/wow/character/${realmSlug}/${nameSlug}/character-media?namespace=${namespace}&locale=en_US`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) return { avatarUrl: null }
  const data = await res.json()
  const avatar = (data.assets ?? []).find((a) => a.key === 'avatar')
  return { avatarUrl: avatar?.value ?? null }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action, region = 'eu', realm, name } = req.query

  if (!VALID_REGIONS.has(region)) {
    return res.status(400).json({ error: 'invalid region' })
  }

  if (!['character', 'media'].includes(action)) {
    return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  if (!realm || !name) return res.status(400).json({ error: 'realm and name required' })
  if (!isSafeQueryValue(realm) || !isSafeQueryValue(name)) {
    return res.status(400).json({ error: 'invalid realm or name' })
  }

  const rateLimit = applyRateLimit(req, res, {
    key: `blizzard:${action}`,
    limit: action === 'media' ? 120 : 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.ok) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter })
  }

  try {
    // All other actions need a token first
    const token = await getBlizzardToken(region)

    if (action === 'character') {
      const data = await fetchCharacter(region, realm, name, token)
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')

      if (isDebugRequest(req)) {
        const host      = API_HOST[region] ?? API_HOST.eu
        const namespace = `profile-${region}`
        const realmSlug = buildBlizzardPathSegment(realm)
        const nameSlug  = buildBlizzardPathSegment(name)
        const summaryRes = await fetch(`${host}/profile/wow/character/${realmSlug}/${nameSlug}?namespace=${namespace}&locale=en_US`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const summary = summaryRes.ok ? await summaryRes.json() : {}

        return res.status(200).json({
          ...data,
          debug: {
            averageItemLevel: summary.average_item_level ?? null,
            equippedItemLevel: summary.equipped_item_level ?? null,
          },
        })
      }

      // Fire-and-forget iLvl snapshot (best-effort, doesn't block response)
      if (data.avgIlvl && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
        sb.from('ilvl_snapshots').upsert(
          { character_name: data.name, avg_ilvl: data.avgIlvl, snapped_at: new Date().toISOString().slice(0, 10) },
          { onConflict: 'character_name,snapped_at' },
        ).then(() => {})
      }

      return res.status(200).json(data)
    }

    if (action === 'media') {
      const data = await fetchMedia(region, realm, name, token)
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
      return res.status(200).json(data)
    }
  } catch (err) {
    console.error('[api/blizzard]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
