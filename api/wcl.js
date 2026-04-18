import { applyRateLimit } from './_rateLimit.js'
import { fetchWCLGraphQL, isAllowedWCLQuery } from './_wcl.js'

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

  if (!isAllowedWCLQuery(query)) {
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
    const { response: gqlRes, data } = await fetchWCLGraphQL(query, variables ?? {})

    if (!gqlRes.ok) {
      return res.status(gqlRes.status).json(data)
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/wcl]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
