import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/heroic-progress.js'

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

test('heroic progress aggregates mains only and applies ceil(50%) threshold', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.WCL_CLIENT_ID
  const originalClientSecret = process.env.WCL_CLIENT_SECRET

  process.env.WCL_CLIENT_ID = 'test-client'
  process.env.WCL_CLIENT_SECRET = 'test-secret'

  const rankingByName = new Map([
    ['Whooplol', [
      'Imperator Averzian',
      'Chimaerus the Undreamt God',
    ]],
    ['Hilfa', [
      'Imperator Averzian',
      'Vorasius',
      "Belo'ren, Child of Al'ar",
    ]],
    ['Mufuzu', [
      'Vorasius',
      'Midnight Falls',
    ]],
    ['Altson', [
      'Imperator Averzian',
      'Midnight Falls',
    ]],
  ])

  const calls = []
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options })

    if (String(url).includes('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'wcl-token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/api/v2/client')) {
      const payload = JSON.parse(options.body)
      const name = payload.variables.name
      const rankings = (rankingByName.get(name) ?? []).map((bossName) => ({
        encounter: { name: bossName },
        totalKills: 1,
      }))

      return {
        ok: true,
        json: async () => ({
          data: {
            characterData: {
              character: {
                name,
                rankingsHeroic: { rankings },
              },
            },
          },
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const req = createReq({
      region: 'eu',
      realm: 'argent-dawn',
      members: [
        { name: 'Whooplol', isMain: true },
        { name: 'Hilfa', isMain: true },
        { name: 'Mufuzu', isMain: true },
        { name: 'Altson', isMain: false },
      ],
    })
    const res = createRes()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.mainCount, 3)
    assert.equal(res.body.killThreshold, 2)
    assert.equal(res.body.progressedBossCount, 2)
    assert.equal(res.body.missingBossCount, 6)
    assert.deepEqual(
      res.body.raids.map((raid) => ({
        name: raid.name,
        progressedBossCount: raid.progressedBossCount,
        missingBossCount: raid.missingBossCount,
      })),
      [
        { name: 'The Voidspire', progressedBossCount: 2, missingBossCount: 3 },
        { name: 'The Dreamrift', progressedBossCount: 0, missingBossCount: 2 },
        { name: "March on Quel'Danas", progressedBossCount: 0, missingBossCount: 1 },
      ],
    )

    const voidspireBosses = res.body.raids[0].bosses
    assert.deepEqual(voidspireBosses[0], {
      name: 'Imperator Averzian',
      killCount: 2,
      killers: ['Whooplol', 'Hilfa'],
      progressed: true,
      requiredKills: 2,
    })
    assert.deepEqual(voidspireBosses[1], {
      name: 'Fallen-King Salhadaar',
      killCount: 0,
      killers: [],
      progressed: false,
      requiredKills: 2,
    })
    assert.deepEqual(voidspireBosses[3], {
      name: 'Vorasius',
      killCount: 2,
      killers: ['Hilfa', 'Mufuzu'],
      progressed: true,
      requiredKills: 2,
    })
    assert.deepEqual(voidspireBosses[4], {
      name: 'Vaelgor & Ezzorak',
      killCount: 0,
      killers: [],
      progressed: false,
      requiredKills: 2,
    })

    assert.equal(calls.filter((call) => String(call.url).includes('/api/v2/client')).length, 3)
  } finally {
    global.fetch = originalFetch

    if (originalClientId == null) delete process.env.WCL_CLIENT_ID
    else process.env.WCL_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.WCL_CLIENT_SECRET
    else process.env.WCL_CLIENT_SECRET = originalClientSecret
  }
})

