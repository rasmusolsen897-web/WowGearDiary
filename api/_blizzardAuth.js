/**
 * api/_blizzardAuth.js — Shared Blizzard OAuth2 token helper
 *
 * Imported by api/blizzard.js and api/raidbots-report.js.
 * Each serverless function gets its own module instance, so the cache
 * is per-function-instance (survives warm invocations within a burst).
 */

export const OAUTH_HOST = {
  eu: 'https://oauth.battle.net',
  us: 'https://oauth.battle.net',
  kr: 'https://kr.battle.net/oauth',
  tw: 'https://tw.battle.net/oauth',
}

export const API_HOST = {
  eu: 'https://eu.api.blizzard.com',
  us: 'https://us.api.blizzard.com',
  kr: 'https://kr.api.blizzard.com',
  tw: 'https://tw.api.blizzard.com',
}

// In-memory token cache — survives within a single warm serverless instance
let _cache = { token: null, expiresAt: 0 }

export async function getBlizzardToken(region = 'eu') {
  if (_cache.token && Date.now() < _cache.expiresAt) {
    return _cache.token
  }

  const clientId     = process.env.BLIZZARD_CLIENT_ID
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenUrl    = `${OAUTH_HOST[region] ?? OAUTH_HOST.eu}/token`

  const res = await fetch(tokenUrl, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Blizzard OAuth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  _cache = {
    token:     data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  }
  return _cache.token
}
