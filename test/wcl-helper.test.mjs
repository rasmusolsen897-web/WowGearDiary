import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchWCLGraphQL, resetWCLTokenCacheForTests } from '../api/_wcl.js'

test('shared WCL helper reuses a cached OAuth token', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.WCL_CLIENT_ID
  const originalClientSecret = process.env.WCL_CLIENT_SECRET

  process.env.WCL_CLIENT_ID = 'test-client'
  process.env.WCL_CLIENT_SECRET = 'test-secret'
  resetWCLTokenCacheForTests()

  let tokenFetchCount = 0
  const authorizationHeaders = []

  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/oauth/token')) {
      tokenFetchCount += 1
      return {
        ok: true,
        json: async () => ({ access_token: 'cached-token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/api/v2/client')) {
      authorizationHeaders.push(options.headers.Authorization)
      return {
        ok: true,
        json: async () => ({ data: { worldData: { zone: { id: 48, name: 'VS / DR / MQD (Beta)' } } } }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    await fetchWCLGraphQL('{ worldData { zone(id: 48) { id name } } }')
    await fetchWCLGraphQL('{ worldData { zone(id: 48) { id name } } }')

    assert.equal(tokenFetchCount, 1)
    assert.deepEqual(authorizationHeaders, ['Bearer cached-token', 'Bearer cached-token'])
  } finally {
    global.fetch = originalFetch
    resetWCLTokenCacheForTests()

    if (originalClientId == null) delete process.env.WCL_CLIENT_ID
    else process.env.WCL_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.WCL_CLIENT_SECRET
    else process.env.WCL_CLIENT_SECRET = originalClientSecret
  }
})

