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

test('raids response returns Midnight heroic progress normalized for the overview card', async () => {
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

    if (String(url).includes('/encounters/raids?')) {
      return {
        ok: true,
        json: async () => ({
          character: {
            name: 'Whooplol',
            realm: { name: 'Tarren Mill' },
            lastUpdatedTimestamp: { iso8601: '2026-04-16T19:40:23Z' },
          },
          raids: {
            expansions: [
              {
                id: 'midnight',
                name: 'Midnight',
                raids: [
                  {
                    id: 'the-voidspire',
                    name: 'The Voidspire',
                    difficulties: [
                      {
                        difficulty: { slug: 'normal', name: 'Normal' },
                        count: 6,
                        total: 6,
                        progress: { slug: 'completed', name: 'Completed' },
                        bosses: [
                          { name: 'Imperator Averzian', killCount: 1 },
                        ],
                      },
                      {
                        difficulty: { slug: 'heroic', name: 'Heroic' },
                        count: 6,
                        total: 6,
                        progress: { slug: 'completed', name: 'Completed' },
                        bosses: [
                          { name: 'Imperator Averzian', killCount: 3, lastTimestamp: 1776363127000 },
                          { name: 'Vorasius', killCount: 3, lastTimestamp: 1776363654000 },
                          { name: 'Fallen-King Salhadaar', killCount: 3, lastTimestamp: 1776364351000 },
                          { name: 'Vaelgor & Ezzorak', killCount: 3, lastTimestamp: 1776365885000 },
                          { name: 'Lightblinded Vanguard', killCount: 3, lastTimestamp: 1776366950000 },
                          { name: 'Crown of the Cosmos', killCount: 2, lastTimestamp: 1776368039000 },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'march-on-queldanas',
                    name: "March on Quel'Danas",
                    difficulties: [
                      {
                        difficulty: { slug: 'heroic', name: 'Heroic' },
                        count: 0,
                        total: 2,
                        progress: { slug: 'not-started', name: 'Not Started' },
                        bosses: [
                          { name: "Belo'ren, Child of Al'ar", killCount: 0 },
                          { name: 'Midnight Falls', killCount: 0 },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'the-war-within',
                name: 'The War Within',
                raids: [
                  {
                    id: 'manaforge-omega',
                    name: 'Manaforge Omega',
                    difficulties: [
                      {
                        difficulty: { slug: 'heroic', name: 'Heroic' },
                        count: 3,
                        total: 8,
                        progress: { slug: 'in-progress', name: 'In Progress' },
                        bosses: [
                          { name: 'Plexus Sentinel', killCount: 1 },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      action: 'raids',
      region: 'eu',
      realm: 'tarren-mill',
      name: 'whooplol',
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.name, 'Whooplol')
    assert.equal(res.body.realm, 'Tarren Mill')
    assert.equal(res.body.lastUpdated, '2026-04-16T19:40:23Z')
    assert.equal(res.body.expansionId, 'midnight')
    assert.equal(res.body.expansionName, 'Midnight')
    assert.equal(res.body.difficulty, 'heroic')
    assert.equal(res.body.progressedBossCount, 6)
    assert.equal(res.body.bossCount, 8)
    assert.equal(res.body.raids.length, 2)
    assert.deepEqual(res.body.raids[0], {
      id: 'the-voidspire',
      name: 'The Voidspire',
      progressedBossCount: 6,
      bossCount: 6,
      progress: 'completed',
      bosses: [
        { name: 'Imperator Averzian', killCount: 3, lastTimestamp: 1776363127000, progressed: true },
        { name: 'Vorasius', killCount: 3, lastTimestamp: 1776363654000, progressed: true },
        { name: 'Fallen-King Salhadaar', killCount: 3, lastTimestamp: 1776364351000, progressed: true },
        { name: 'Vaelgor & Ezzorak', killCount: 3, lastTimestamp: 1776365885000, progressed: true },
        { name: 'Lightblinded Vanguard', killCount: 3, lastTimestamp: 1776366950000, progressed: true },
        { name: 'Crown of the Cosmos', killCount: 2, lastTimestamp: 1776368039000, progressed: true },
      ],
    })
    assert.deepEqual(res.body.raids[1], {
      id: 'march-on-queldanas',
      name: "March on Quel'Danas",
      progressedBossCount: 0,
      bossCount: 2,
      progress: 'not-started',
      bosses: [
        { name: "Belo'ren, Child of Al'ar", killCount: 0, lastTimestamp: null, progressed: false },
        { name: 'Midnight Falls', killCount: 0, lastTimestamp: null, progressed: false },
      ],
    })
  } finally {
    global.fetch = originalFetch

    if (originalClientId == null) delete process.env.BLIZZARD_CLIENT_ID
    else process.env.BLIZZARD_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.BLIZZARD_CLIENT_SECRET
    else process.env.BLIZZARD_CLIENT_SECRET = originalClientSecret
  }
})

test('raids response returns an empty Midnight heroic summary when encounters data is missing', async () => {
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

    if (String(url).includes('/encounters/raids?')) {
      return {
        ok: true,
        json: async () => ({
          character: {
            name: 'Whooplol',
            realm: { name: 'Tarren Mill' },
          },
          raids: {
            expansions: [],
          },
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      action: 'raids',
      region: 'eu',
      realm: 'tarren-mill',
      name: 'whooplol',
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.expansionId, 'midnight')
    assert.equal(res.body.expansionName, 'Midnight')
    assert.equal(res.body.difficulty, 'heroic')
    assert.equal(res.body.progressedBossCount, 0)
    assert.equal(res.body.bossCount, 0)
    assert.deepEqual(res.body.raids, [])
  } finally {
    global.fetch = originalFetch

    if (originalClientId == null) delete process.env.BLIZZARD_CLIENT_ID
    else process.env.BLIZZARD_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.BLIZZARD_CLIENT_SECRET
    else process.env.BLIZZARD_CLIENT_SECRET = originalClientSecret
  }
})
