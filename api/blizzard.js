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
const OVERVIEW_EXPANSION_ID = 'midnight'
const OVERVIEW_EXPANSION_NAME = 'Midnight'
const OVERVIEW_DIFFICULTY_SLUG = 'heroic'
const PROFILE_PAGE_LOCALE = 'en-gb'

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

function buildEmptyRaidSummary({ name = '', realm = '', lastUpdated = null } = {}) {
  return {
    name,
    realm,
    lastUpdated,
    guildName: null,
    expansionId: OVERVIEW_EXPANSION_ID,
    expansionName: OVERVIEW_EXPANSION_NAME,
    difficulty: OVERVIEW_DIFFICULTY_SLUG,
    progressedBossCount: 0,
    bossCount: 0,
    raids: [],
  }
}

function normalizeRaidBoss(boss) {
  const killCount = boss?.killCount ?? 0

  return {
    name: boss?.name ?? 'Unknown Boss',
    killCount,
    lastTimestamp: boss?.lastTimestamp ?? null,
    progressed: killCount > 0,
  }
}

function normalizeRaidSummary(payload) {
  const character = payload?.character ?? {}
  const summary = buildEmptyRaidSummary({
    name: character?.name ?? '',
    realm: character?.realm?.name ?? '',
    lastUpdated: character?.lastUpdatedTimestamp?.iso8601 ?? null,
  })
  summary.guildName = character?.guild?.name ?? null

  const expansions = payload?.expansions ?? payload?.raids?.expansions ?? []
  const midnight = expansions.find((expansion) => expansion?.id === OVERVIEW_EXPANSION_ID)

  if (!midnight) return summary

  summary.expansionName = midnight?.name ?? OVERVIEW_EXPANSION_NAME

  summary.raids = (midnight?.raids ?? []).flatMap((raid) => {
    const heroic = (raid?.difficulties ?? []).find(
      (difficulty) => difficulty?.difficulty?.slug === OVERVIEW_DIFFICULTY_SLUG
    )

    if (!heroic) return []

    const bosses = (heroic?.bosses ?? []).map(normalizeRaidBoss)
    const bossCount = heroic?.total ?? bosses.length
    const progressedBossCount = bosses.filter((boss) => boss.progressed).length

    return [{
      id: raid?.id ?? raid?.name ?? 'unknown-raid',
      name: raid?.name ?? 'Unknown Raid',
      progressedBossCount,
      bossCount,
      progress: heroic?.progress?.slug ?? 'not-started',
      bosses,
    }]
  })

  summary.progressedBossCount = summary.raids.reduce((sum, raid) => sum + raid.progressedBossCount, 0)
  summary.bossCount = summary.raids.reduce((sum, raid) => sum + raid.bossCount, 0)

  return summary
}

function extractProfileRaidState(html) {
  const marker = 'var characterProfileInitialState = '
  const start = html.indexOf(marker)
  if (start === -1) return null

  const afterMarker = html.slice(start + marker.length)
  const payloadStart = afterMarker.indexOf('{"character":')
  const payloadEnd = afterMarker.indexOf(',"variableName":"characterProfileInitialState"')

  if (payloadStart === -1 || payloadEnd === -1 || payloadEnd <= payloadStart) {
    return null
  }

  const json = `${afterMarker.slice(payloadStart, payloadEnd)}}`

  try {
    return JSON.parse(json)
  } catch {
    return null
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

async function fetchRaids(region, realm, name, token) {
  const host = API_HOST[region] ?? API_HOST.eu
  const namespace = `profile-${region}`
  const realmSlug = buildBlizzardPathSegment(realm)
  const nameSlug = buildBlizzardPathSegment(name)

  const res = await fetch(
    `${host}/profile/wow/character/${realmSlug}/${nameSlug}/encounters/raids?namespace=${namespace}&locale=en_US`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) {
    throw new Error(`Character raids not found: ${name}-${realm} (${res.status})`)
  }

  const payload = await res.json()
  const summary = normalizeRaidSummary(payload)

  if (summary.bossCount > 0) {
    return summary
  }

  const profileRes = await fetch(
    `https://worldofwarcraft.blizzard.com/${PROFILE_PAGE_LOCALE}/character/${region}/${realmSlug}/${nameSlug}/pve/raids`
  )

  if (!profileRes.ok) return summary

  const html = await profileRes.text()
  const pageState = extractProfileRaidState(html)
  if (!pageState) return summary

  return normalizeRaidSummary(pageState)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action, region = 'eu', realm, name } = req.query

  if (!VALID_REGIONS.has(region)) {
    return res.status(400).json({ error: 'invalid region' })
  }

  if (!['character', 'media', 'raids'].includes(action)) {
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

    if (action === 'raids') {
      const data = await fetchRaids(region, realm, name, token)
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
      return res.status(200).json(data)
    }
  } catch (err) {
    console.error('[api/blizzard]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
