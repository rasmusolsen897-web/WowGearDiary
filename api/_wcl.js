const WCL_OAUTH_URL = 'https://www.warcraftlogs.com/oauth/token'
const WCL_API_URL = 'https://www.warcraftlogs.com/api/v2/client'

function normalizeQuery(query = '') {
  return String(query).replace(/\s+/g, ' ').trim()
}

export const ALLOWED_WCL_QUERY_SIGNATURES = new Set([
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

let wclTokenCache = { token: null, expiresAt: 0 }

export function isAllowedWCLQuery(query) {
  return ALLOWED_WCL_QUERY_SIGNATURES.has(normalizeQuery(query))
}

export function resetWCLTokenCacheForTests() {
  wclTokenCache = { token: null, expiresAt: 0 }
}

export async function getWCLToken() {
  if (wclTokenCache.token && Date.now() < wclTokenCache.expiresAt) {
    return wclTokenCache.token
  }

  const clientId = process.env.WCL_CLIENT_ID
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
  wclTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  }
  return wclTokenCache.token
}

export async function fetchWCLGraphQL(query, variables = {}) {
  const token = await getWCLToken()

  const response = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const data = await response.json()
  return { response, data }
}

