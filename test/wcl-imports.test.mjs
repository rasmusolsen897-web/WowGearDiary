import assert from 'node:assert/strict'
import test from 'node:test'
import { resetWCLTokenCacheForTests } from '../api/_wcl.js'
import { importWclWarehouseReport, listWclImportsFromRows } from '../api/_wclWarehouse.js'

function createFakeSupabase() {
  const operations = []
  return {
    operations,
    from(table) {
      const bucket = {
        delete() {
          operations.push({ table, action: 'delete' })
          return {
            eq(column, value) {
              operations.push({ table, action: 'eq', column, value })
              return Promise.resolve({ error: null })
            },
          }
        },
        insert(rows) {
          operations.push({ table, action: 'insert', rows })
          return Promise.resolve({ error: null })
        },
        upsert(row, options) {
          operations.push({ table, action: 'upsert', row, options })
          return Promise.resolve({ error: null })
        },
      }
      return bucket
    },
  }
}

test('importWclWarehouseReport persists a normalized report, fights, players, and loot rows', async () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.WCL_CLIENT_ID
  const originalClientSecret = process.env.WCL_CLIENT_SECRET
  const supabase = createFakeSupabase()

  process.env.WCL_CLIENT_ID = 'test-client'
  process.env.WCL_CLIENT_SECRET = 'test-secret'
  resetWCLTokenCacheForTests()

  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      }
    }

    if (String(url).includes('/api/v2/client')) {
      const payload = JSON.parse(options.body)
      if (String(payload.query).includes('WclReportImport')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              reportData: {
                report: {
                  code: 'TmpXzvrL41waPjWd',
                  title: 'Sample raid',
                  visibility: 'public',
                  startTime: 1710000000000,
                  endTime: 1710003600000,
                  region: { code: 'eu', name: 'EU' },
                  zone: { id: 48, name: 'Midnight' },
                  guild: { id: 7, name: 'CAMFTW', server: 'Tarren Mill', region: 'eu' },
                  owner: { id: 11, name: 'Whooplol' },
                  masterData: {
                    actors: [
                      { id: 1, name: 'Whooplol', type: 'Player', subType: 'Warrior', server: 'Tarren Mill', gameID: 1 },
                    ],
                  },
                  fights: [
                    {
                      id: 101,
                      name: 'Boss One',
                      encounterID: 9001,
                      difficulty: 5,
                      startTime: 1710000100000,
                      endTime: 1710000200000,
                      kill: true,
                      size: 20,
                      averageItemLevel: 676.5,
                      bossPercentage: 100,
                      fightPercentage: 100,
                      completeRaid: true,
                      inProgress: false,
                      friendlyPlayers: [1],
                    },
                  ],
                },
              },
            },
          }),
        }
      }

      if (String(payload.query).includes('WclFightRankings')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              reportData: {
                report: {
                  rankings: [
                    {
                      actor: { id: 1, name: 'Whooplol', server: 'Tarren Mill' },
                      rankPercent: 94.2,
                      dps: 10000,
                      itemLevel: 712.4,
                    },
                  ],
                },
              },
            },
          }),
        }
      }

      if (String(payload.query).includes('WclFightEvents')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              reportData: {
                report: {
                  events: {
                    data: [
                      {
                        type: 'loot',
                        eventUid: 'loot-1',
                        actor: { name: 'Whooplol', server: 'Tarren Mill' },
                        itemId: 2001,
                        itemName: "Champion's Crest",
                        itemLevel: 720,
                        quality: 'Epic',
                        encounterName: 'Boss One',
                        occurredAt: '2024-03-10T20:30:00.000Z',
                        isTier: true,
                      },
                    ],
                  },
                },
              },
            },
          }),
        }
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const result = await importWclWarehouseReport({
      supabase,
      reportInput: 'https://www.warcraftlogs.com/reports/TmpXzvrL41waPjWd',
    })

    assert.equal(result.reportCode, 'TmpXzvrL41waPjWd')
    assert.equal(result.fights, 1)
    assert.equal(result.fightPlayers, 1)
    assert.equal(result.lootEvents, 1)
    const reportUpserts = supabase.operations.filter((entry) => entry.table === 'wcl_reports' && entry.action === 'upsert')

    assert.equal(reportUpserts.at(0).row.import_status, 'running')
    assert.equal(reportUpserts.at(-1).row.import_status, 'ready')
  } finally {
    global.fetch = originalFetch
    resetWCLTokenCacheForTests()

    if (originalClientId == null) delete process.env.WCL_CLIENT_ID
    else process.env.WCL_CLIENT_ID = originalClientId

    if (originalClientSecret == null) delete process.env.WCL_CLIENT_SECRET
    else process.env.WCL_CLIENT_SECRET = originalClientSecret
  }
})

test('listWclImportsFromRows sorts the newest import first', () => {
  assert.deepEqual(listWclImportsFromRows([
    { report_code: 'old', updated_at: '2024-03-09T00:00:00.000Z' },
    { report_code: 'new', updated_at: '2024-03-10T00:00:00.000Z' },
  ]).map((row) => row.reportCode), ['new', 'old'])
})
