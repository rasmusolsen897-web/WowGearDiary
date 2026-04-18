import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/blizzard.js'

function createReq(query = {}) {
  return {
    method: 'GET',
    query,
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

test('character response prefers equipped item level when Blizzard returns both values', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.BLIZZARD_CLIENT_ID
  const originalClientSecret = process.env.BLIZZARD_CLIENT_SECRET

  process.env.BLIZZARD_CLIENT_ID = 'test-client'
  process.env.BLIZZARD_CLIENT_SECRET = 'test-secret'

  global.fetch = async (url) => {
    if (String(url).includes('/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'fake-token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/equipment?')) {
      return {
        ok: true,
        json: async () => ({
          equipped_items: [],
        }),
      }
    }

    if (String(url).includes('?namespace=')) {
      return {
        ok: true,
        json: async () => ({
          name: 'Whooplol',
          average_item_level: 271,
          equipped_item_level: 274,
          realm: { name: 'Tarren Mill' },
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      action: 'character',
      region: 'eu',
      realm: 'tarren-mill',
      name: 'whooplol',
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.avgIlvl, 274)
  } finally {
    global.fetch = originalFetch

    if (originalClientId == null) delete process.env.BLIZZARD_CLIENT_ID
    else process.env.BLIZZARD_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.BLIZZARD_CLIENT_SECRET
    else process.env.BLIZZARD_CLIENT_SECRET = originalClientSecret
  }
})

test('debug character response includes raw Blizzard item level fields', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.BLIZZARD_CLIENT_ID
  const originalClientSecret = process.env.BLIZZARD_CLIENT_SECRET

  process.env.BLIZZARD_CLIENT_ID = 'test-client'
  process.env.BLIZZARD_CLIENT_SECRET = 'test-secret'

  global.fetch = async (url) => {
    if (String(url).includes('/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'fake-token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/equipment?')) {
      return {
        ok: true,
        json: async () => ({
          equipped_items: [],
        }),
      }
    }

    if (String(url).includes('?namespace=')) {
      return {
        ok: true,
        json: async () => ({
          name: 'Whooplol',
          average_item_level: 271,
          equipped_item_level: 274,
          realm: { name: 'Tarren Mill' },
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      action: 'character',
      region: 'eu',
      realm: 'tarren-mill',
      name: 'whooplol',
      debug: '1',
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.debug, {
      averageItemLevel: 271,
      equippedItemLevel: 274,
    })
  } finally {
    global.fetch = originalFetch

    if (originalClientId == null) delete process.env.BLIZZARD_CLIENT_ID
    else process.env.BLIZZARD_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.BLIZZARD_CLIENT_SECRET
    else process.env.BLIZZARD_CLIENT_SECRET = originalClientSecret
  }
})

test('character response accepts accented names and encodes Blizzard path segments', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.BLIZZARD_CLIENT_ID
  const originalClientSecret = process.env.BLIZZARD_CLIENT_SECRET

  process.env.BLIZZARD_CLIENT_ID = 'test-client'
  process.env.BLIZZARD_CLIENT_SECRET = 'test-secret'

  const seenUrls = []

  global.fetch = async (url) => {
    seenUrls.push(String(url))

    if (String(url).includes('/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'fake-token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/equipment?')) {
      return {
        ok: true,
        json: async () => ({
          equipped_items: [],
        }),
      }
    }

    if (String(url).includes('?namespace=')) {
      return {
        ok: true,
        json: async () => ({
          name: 'Okràm',
          equipped_item_level: 274,
          realm: { name: 'Argent Dawn' },
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      action: 'character',
      region: 'eu',
      realm: 'Argent Dawn',
      name: 'Okràm',
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.name, 'Okràm')
    assert.ok(seenUrls.some((url) => url.includes('/argent-dawn/okr%C3%A0m/')))
  } finally {
    global.fetch = originalFetch

    if (originalClientId == null) delete process.env.BLIZZARD_CLIENT_ID
    else process.env.BLIZZARD_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.BLIZZARD_CLIENT_SECRET
    else process.env.BLIZZARD_CLIENT_SECRET = originalClientSecret
  }
})
