import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScenarioPayload, DROPTIMIZER_SCENARIOS } from '../api/_droptimizer.js'

const RAID_ENV = 'RAIDBOTS_DROPTIMIZER_RAID_JSON'
const RAID_PART_1 = `${RAID_ENV}_PART_1`
const RAID_PART_2 = `${RAID_ENV}_PART_2`

function withEnv(overrides, run) {
  const previous = new Map()
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key])
    const value = overrides[key]
    if (value == null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value == null) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

function createExactPayload() {
  return {
    type: 'droptimizer',
    reportName: 'Captured Whooplol Payload',
    baseActorName: 'Whooplol',
    armory: {
      region: 'eu',
      realm: 'tarren-mill',
      name: 'whooplol',
    },
    character: {
      class: { id: 8 },
      spec: { id: 64, name: 'Frost' },
      items: { head: { id: 1 } },
      faction: 'horde',
    },
    simcVersion: 'nightly',
    iterations: 'smart',
    fightStyle: 'Patchwerk',
    reportDetails: true,
    droptimizer: {
      equipped: { head: { id: 1 } },
      instances: [1307, 1308],
      difficulty: 'raid-heroic',
      classId: 8,
      specId: 64,
      lootSpecId: 64,
      faction: 'horde',
    },
    droptimizerItems: [{ itemId: 1 }],
  }
}

test('invalid optional JSON override falls back to defaults and warns once', async () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  try {
    await withEnv({
      [RAID_ENV]: '{"fightStyle":"Patchwerk"',
      [RAID_PART_1]: null,
      [RAID_PART_2]: null,
    }, async () => {
      const firstPayload = await buildScenarioPayload('raid_heroic', {
        name: 'Altmage',
        realm: 'Tarren Mill',
        region: 'eu',
      })
      const secondPayload = await buildScenarioPayload('raid_heroic', {
        name: 'Altmage',
        realm: 'Tarren Mill',
        region: 'eu',
      })

      assert.equal(firstPayload.reportName, DROPTIMIZER_SCENARIOS.raid_heroic.reportName)
      assert.equal(firstPayload.baseActorName, 'Altmage')
      assert.deepEqual(firstPayload.instances, [1307, 1308])
      assert.equal(secondPayload.reportName, DROPTIMIZER_SCENARIOS.raid_heroic.reportName)
    })
  } finally {
    console.warn = originalWarn
  }

  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Ignoring invalid optional JSON override/)
})

test('chunked env override is preferred over a broken single-value env var', async () => {
  await withEnv({
    [RAID_ENV]: '{"ignored":"because single env is broken"',
    [RAID_PART_1]: '{"fightStyle":"DungeonSlice","droptimizer":{"instances":[77,88]},',
    [RAID_PART_2]: '"reportDetails":true}',
  }, async () => {
    const payload = await buildScenarioPayload('raid_heroic', {
      name: 'Altmage',
      realm: 'Tarren Mill',
      region: 'eu',
    })

    assert.equal(payload.fightStyle, 'DungeonSlice')
    assert.equal(payload.reportDetails, true)
    assert.deepEqual(payload.droptimizer.instances, [77, 88])
    assert.equal(payload.armory.name, 'Altmage')
  })
})

test('exact payload envs are sanitized before being reused for non-exact characters', async () => {
  await withEnv({
    [RAID_ENV]: JSON.stringify(createExactPayload()),
    [RAID_PART_1]: null,
    [RAID_PART_2]: null,
  }, async () => {
    const payload = await buildScenarioPayload('raid_heroic', {
      name: 'Altmage',
      realm: 'Tarren Mill',
      region: 'eu',
    })

    assert.equal(payload.reportName, DROPTIMIZER_SCENARIOS.raid_heroic.reportName)
    assert.equal(payload.baseActorName, 'Altmage')
    assert.equal(payload.armory.name, 'Altmage')
    assert.equal(payload.armory.realm, 'Tarren Mill')
    assert.equal(payload.character, undefined)
    assert.equal(payload.droptimizerItems, undefined)
    assert.deepEqual(payload.droptimizer.instances, [1307, 1308])
    assert.equal(payload.droptimizer.classId, undefined)
    assert.equal(payload.droptimizer.specId, undefined)
    assert.equal(payload.droptimizer.lootSpecId, undefined)
    assert.equal(payload.droptimizer.faction, undefined)
    assert.equal(payload.reportDetails, true)
  })
})
