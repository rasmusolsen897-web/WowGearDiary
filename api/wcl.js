/**
 * api/wcl.js — Vercel serverless proxy for Warcraft Logs GraphQL API
 *
 * POST /api/wcl
 *   body: { query: "...", variables: { ... } }
 *   → POST https://www.warcraftlogs.com/oauth/token (client_credentials)
 *   → POST https://www.warcraftlogs.com/api/v2/client with Bearer token
 *   → returns raw WCL GraphQL response
 */

const WCL_OAUTH_URL = 'https://www.warcraftlogs.com/oauth/token'
const WCL_API_URL   = 'https://www.warcraftlogs.com/api/v2/client'

async function getWCLToken() {
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

  const { access_token } = await res.json()
  return access_token
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
