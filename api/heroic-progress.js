import { applyRateLimit } from './_rateLimit.js'
import { fetchWCLGraphQL } from './_wcl.js'
import {
  MIDNIGHT_TIER_ZONE_ID,
  MIDNIGHT_TIER_ZONE_NAME,
  summarizeMidnightHeroicProgress,
} from './_heroicProgress.js'
import { buildIdentitySlug } from '../src/utils/characterIdentity.js'

const HEROIC_PROGRESS_QUERY = /* GraphQL */ `
  query CharacterRankings($name: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int) {
    characterData {
      character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
        name
        rankingsHeroic: zoneRankings(zoneID: $zoneID, difficulty: 5)
      }
    }
  }
`

function normalizeText(value) {
  return String(value ?? '').normalize('NFC').trim()
}

function slugifyRealm(realm) {
  return buildIdentitySlug(realm)
}

function normalizeRegion(region) {
  return normalizeText(region || 'eu').toLowerCase()
}

function getRosterFromBody(body) {
  if (Array.isArray(body?.members)) return body.members
  if (Array.isArray(body?.guild?.members)) return body.guild.members
  return []
}

function getDefaultRealm(body) {
  return normalizeText(body?.realm ?? body?.guild?.realm ?? '')
}

function getDefaultRegion(body) {
  return normalizeRegion(body?.region ?? body?.guild?.region ?? 'eu')
}

function getMemberName(member) {
  return normalizeText(member?.name)
}

function getMemberRealm(member, fallbackRealm) {
  const rawRealm = member?.realm?.slug
    ?? member?.realm?.name
    ?? member?.realm
    ?? fallbackRealm

  return slugifyRealm(rawRealm)
}

async function fetchMemberHeroicRankings(member, region, guildRealm) {
  const name = getMemberName(member)
  const realm = getMemberRealm(member, guildRealm)

  if (!name || !realm) {
    return { name, rankings: [] }
  }

  const { response, data } = await fetchWCLGraphQL(HEROIC_PROGRESS_QUERY, {
    name,
    serverSlug: realm,
    serverRegion: region,
    zoneID: MIDNIGHT_TIER_ZONE_ID,
  })

  if (!response.ok) {
    const message = data?.errors?.length
      ? data.errors.map((entry) => entry.message).join('; ')
      : `HTTP ${response.status}`
    throw new Error(`WCL heroic progress failed for ${name}-${realm}: ${message}`)
  }

  const character = data?.data?.characterData?.character ?? null

  return {
    name: character?.name ?? name,
    rankings: character?.rankingsHeroic?.rankings ?? [],
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST' })
  }

  const body = req.body ?? {}
  const region = getDefaultRegion(body)
  const guildRealm = getDefaultRealm(body)
  const roster = getRosterFromBody(body)
  const mains = roster.filter((member) => getMemberName(member) && member?.isMain !== false)

  if (!guildRealm) {
    return res.status(400).json({ error: 'realm required' })
  }

  const rateLimit = applyRateLimit(req, res, {
    key: 'heroic-progress',
    limit: 30,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.ok) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter })
  }

  try {
    const results = await Promise.allSettled(
      mains.map((member) => fetchMemberHeroicRankings(member, region, guildRealm))
    )

    const memberResults = []
    const warnings = []

    results.forEach((result, index) => {
      const memberName = getMemberName(mains[index])
      if (result.status === 'fulfilled') {
        memberResults.push(result.value)
        return
      }

      warnings.push(memberName ? `${memberName}: ${result.reason?.message ?? 'unknown error'}` : 'unknown member')
    })

    const summary = summarizeMidnightHeroicProgress({
      memberResults,
      mainCount: mains.length,
      zoneId: MIDNIGHT_TIER_ZONE_ID,
      zoneName: MIDNIGHT_TIER_ZONE_NAME,
    })

    if (warnings.length) {
      summary.warnings = warnings
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate')
    return res.status(200).json(summary)
  } catch (err) {
    console.error('[api/heroic-progress]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
