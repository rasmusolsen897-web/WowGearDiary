/**
 * api/wcl.js — Vercel serverless proxy for Warcraft Logs GraphQL API
 *
 * POST /api/wcl
 *   body: { query: "...", variables: { ... } }
 *   → POST https://www.warcraftlogs.com/oauth/token (client_credentials)
 *   → POST https://www.warcraftlogs.com/api/v2/client with Bearer token
 *   → returns raw WCL GraphQL response
 */

import { applyRateLimit } from './_rateLimit.js'

const WCL_OAUTH_URL = 'https://www.warcraftlogs.com/oauth/token'
const WCL_API_URL   = 'https://www.warcraftlogs.com/api/v2/client'

function normalizeQuery(query = '') {
  return query.replace(/\s+/g, ' ').trim()
}

const ALLOWED_QUERY_SIGNATURES = new Set([
  normalizeQuery(`
    query CharacterRankings($name: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          name
          classID
          rankingsNormal: zoneRankings(zoneID: $zoneID, difficulty: 4)
          rankingsHeroic: zoneRankings(zoneID: $zoneID, difficulty: 5)
          rankingsMythic: zoneRankings(zoneID: $zoneID, difficulty: 6)
        }
      }
    }
  `),
  normalizeQuery('{ worldData { zone(id: 41) { id name } } }'),
])

// In-memory token cache — survives within a single serverless instance burst
let wclTokenCache = { token: null, expiresAt: 0 }

async function getWCLToken() {
  // Return cached token if still valid
  if (wclTokenCache.token && Date.now() < wclTokenCache.expiresAt) {
    return wclTokenCache.token
  }

  const clientId     = process.env.WCL_CLIENT_ID
  const clientSecret = process.env.WCL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('WCL_CLIENT_ID and WCL_CLIENT_SECRET must be set')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(WCL_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WCL OAuth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  // Cache with 60-second safety margin before actual expiry
  wclTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  }
  return data.access_token
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' })
  }

  const { query, variables } = req.body ?? {}

  if (!query) {
    return res.status(400).json({ error: 'Request body must include { query, variables }' })
  }

  if (!ALLOWED_QUERY_SIGNATURES.has(normalizeQuery(query))) {
    return res.status(403).json({ error: 'Query shape not allowed' })
  }

  const rateLimit = applyRateLimit(req, res, {
    key: 'wcl',
    limit: 30,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.ok) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter })
  }

  try {
    const token = await getWCLToken()

    const gqlRes = await fetch(WCL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    })

    const data = await gqlRes.json()

    if (!gqlRes.ok) {
      return res.status(gqlRes.status).json(data)
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/wcl]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
