import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/wcl.js'
import { resetWCLTokenCacheForTests } from '../api/_wcl.js'

function createReq(body = {}) {
  return {
    method: 'POST',
    body,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end(payload) {
      this.body = payload
      return this
    },
  }
}

test('api/wcl still allows the canonical character rankings query and returns the upstream payload', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.WCL_CLIENT_ID
  const originalClientSecret = process.env.WCL_CLIENT_SECRET

  process.env.WCL_CLIENT_ID = 'test-client'
  process.env.WCL_CLIENT_SECRET = 'test-secret'
  resetWCLTokenCacheForTests()

  global.fetch = async (url) => {
    if (String(url).includes('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'wcl-token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/api/v2/client')) {
      return {
        ok: true,
        json: async () => ({ data: { worldData: { zone: { id: 41, name: 'Zone 41' } } } }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      query: `
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
      `,
      variables: {
        name: 'Whooplol',
        serverSlug: 'tarren-mill',
        serverRegion: 'eu',
        zoneID: 41,
      },
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { data: { worldData: { zone: { id: 41, name: 'Zone 41' } } } })
  } finally {
    global.fetch = originalFetch
    resetWCLTokenCacheForTests()

    if (originalClientId == null) delete process.env.WCL_CLIENT_ID
    else process.env.WCL_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.WCL_CLIENT_SECRET
    else process.env.WCL_CLIENT_SECRET = originalClientSecret
  }
})

test('api/wcl rejects non-allowlisted query shapes', async () => {
  const req = createReq({
    query: '{ worldData { zone(id: 999) { id name frozen } } }',
    variables: {},
  })
  const res = createRes()

  await handler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, 'Query shape not allowed')
})

