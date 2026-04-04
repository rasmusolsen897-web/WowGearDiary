import assert from 'node:assert/strict'
import test from 'node:test'
import { submitRaidbotsDroptimizer } from '../api/_raidbots.js'

function createPayload() {
  return {
    type: 'droptimizer',
    reportName: 'Captured Payload',
    baseActorName: 'Eylac',
    armory: {
      region: 'eu',
      realm: 'argent-dawn',
      name: 'Eylac',
    },
    character: {
      name: 'Eylac',
      class: { id: 4, name: 'Rogue' },
      spec: { id: 261, name: 'Subtlety' },
      items: { head: { id: 101 } },
      faction: 'alliance',
      realm: { name: 'Argent Dawn', slug: 'argent-dawn' },
    },
    droptimizer: {
      difficulty: 'raid-heroic',
      equipped: { head: { id: 101 } },
      classId: 4,
      specId: 261,
      lootSpecId: 261,
      faction: 'alliance',
    },
    droptimizerItems: [{ itemId: 1 }],
  }
}

test('submitRaidbotsDroptimizer falls back to /api/job/droptimizer when /sim returns a 500', async () => {
  const originalFetch = global.fetch
  const originalSession = process.env.RAIDBOTS_SESSION
  process.env.RAIDBOTS_SESSION = 'test-session'

  const calls = []
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options })

    if (String(url).endsWith('/sim')) {
      return {
        ok: false,
        status: 500,
        text: async () => '{"message":"500: Seri did not properly handle an error..."}',
      }
    }

    if (String(url).endsWith('/api/job/droptimizer')) {
      return {
        ok: true,
        json: async () => ({ job: { id: 'fallback-job-id' } }),
      }
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }

  try {
    const result = await submitRaidbotsDroptimizer({ droptimizer: createPayload() })

    assert.equal(result.simId, 'fallback-job-id')
    assert.equal(result.jobId, 'fallback-job-id')
    assert.equal(calls.length, 2)
    assert.match(String(calls[0].url), /\/sim$/)
    assert.match(String(calls[1].url), /\/api\/job\/droptimizer$/)
  } finally {
    global.fetch = originalFetch
    process.env.RAIDBOTS_SESSION = originalSession
  }
})
