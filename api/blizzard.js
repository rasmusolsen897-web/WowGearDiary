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

const OAUTH_HOST = {
  eu: 'https://oauth.battle.net',
  us: 'https://oauth.battle.net',
  kr: 'https://kr.battle.net/oauth',
  tw: 'https://tw.battle.net/oauth',
}

const API_HOST = {
  eu: 'https://eu.api.blizzard.com',
  us: 'https://us.api.blizzard.com',
  kr: 'https://kr.api.blizzard.com',
  tw: 'https://tw.api.blizzard.com',
}

// In-memory token cache — survives within a single serverless instance burst
let blizTokenCache = { token: null, expiresAt: 0 }

async function getToken(region) {
  // Return cached token if still valid
  if (blizTokenCache.token && Date.now() < blizTokenCache.expiresAt) {
    return { access_token: blizTokenCache.token }
  }

  const clientId     = process.env.BLIZZARD_CLIENT_ID
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenUrl    = `${OAUTH_HOST[region] ?? OAUTH_HOST.eu}/token`

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Blizzard OAuth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  // Cache with 60-second safety margin before actual expiry
  blizTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  }
  return data
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
  const realmSlug = realm.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
  const nameSlug  = name.toLowerCase()

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

  const avgIlvl = summary.average_item_level ?? summary.equipped_item_level ?? 0

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

async function fetchMedia(region, realm, name, token) {
  const host      = API_HOST[region] ?? API_HOST.eu
  const namespace = `profile-${region}`
  const realmSlug = realm.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
  const nameSlug  = name.toLowerCase()

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

  try {
    if (action === 'token') {
      const token = await getToken(region)
      return res.status(200).json(token)
    }

    // All other actions need a token first
    const { access_token: token } = await getToken(region)

    if (action === 'character') {
      if (!realm || !name) return res.status(400).json({ error: 'realm and name required' })
      const data = await fetchCharacter(region, realm, name, token)
      return res.status(200).json(data)
    }

    if (action === 'media') {
      if (!realm || !name) return res.status(400).json({ error: 'realm and name required' })
      const data = await fetchMedia(region, realm, name, token)
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('[api/blizzard]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
