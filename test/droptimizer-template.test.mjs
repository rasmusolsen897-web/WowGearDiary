import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDroptimizerPayload } from '../api/_raidbots.js'
import { validateEnrollmentPayload } from '../api/_droptimizer-execution.js'

function createCapturedPayload() {
  return {
    type: 'droptimizer',
    reportName: 'Captured Payload',
    baseActorName: 'Whooplol',
    armory: {
      region: 'eu',
      realm: 'tarren-mill',
      name: 'Whooplol',
    },
    character: {
      name: 'Whooplol',
      class: { id: 8, name: 'Mage' },
      spec: { id: 64, name: 'Frost' },
      items: { head: { id: 101 } },
      faction: 'horde',
      realm: { name: 'Tarren Mill', slug: 'tarren-mill' },
    },
    droptimizer: {
      difficulty: 'raid-heroic',
      equipped: { head: { id: 101 } },
      classId: 8,
      specId: 64,
      lootSpecId: 64,
      faction: 'horde',
    },
    droptimizerItems: [{ itemId: 1 }, { itemId: 2 }],
  }
}

test('exact payload templates are refreshed with the latest actor-specific fields', () => {
  const payload = createCapturedPayload()
  const actor = {
    name: 'Eylac',
    region: 'eu',
    realm: { name: 'Silvermoon', slug: 'silvermoon' },
    class: { id: 8, name: 'Mage' },
    spec: { id: 62, name: 'Arcane' },
    items: { head: { id: 404 } },
    faction: 'alliance',
  }

  const hydrated = buildDroptimizerPayload(payload, actor)

  assert.equal(hydrated.baseActorName, 'Eylac')
  assert.equal(hydrated.armory.name, 'Eylac')
  assert.equal(hydrated.armory.realm, 'silvermoon')
  assert.equal(hydrated.region, 'eu')
  assert.equal(hydrated.realm, 'silvermoon')
  assert.equal(hydrated.name, 'Eylac')
  assert.equal(hydrated.spec, 'Arcane')
  assert.deepEqual(hydrated.character, actor)
  assert.deepEqual(hydrated.droptimizer.equipped, actor.items)
  assert.equal(hydrated.droptimizer.classId, 8)
  assert.equal(hydrated.droptimizer.specId, 62)
  assert.equal(hydrated.droptimizer.lootSpecId, 64)
  assert.equal(hydrated.droptimizer.faction, 'alliance')
  assert.deepEqual(hydrated.droptimizerItems, payload.droptimizerItems)
})

test('enrollment payload validation rejects actor mismatches', () => {
  assert.throws(
    () => validateEnrollmentPayload({
      characterName: 'Eylac',
      scenario: 'raid_heroic',
      payload: createCapturedPayload(),
    }),
    /does not match/i,
  )
})
