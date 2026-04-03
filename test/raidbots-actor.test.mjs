import assert from 'node:assert/strict'
import test from 'node:test'
import { extractRaidbotsActorDetails } from '../api/_raidbots.js'

test('extractRaidbotsActorDetails supports nested v2.profile payloads', () => {
  const actor = {
    items: {
      head: { id: 1 },
    },
    v2: {
      profile: {
        character_class: { id: 8, name: 'Mage' },
        active_spec: { id: 64, name: 'Frost' },
        faction: { type: 'HORDE', name: 'Horde' },
      },
    },
  }

  const details = extractRaidbotsActorDetails(actor)

  assert.deepEqual(details.items, { head: { id: 1 } })
  assert.equal(details.classId, 8)
  assert.equal(details.specId, 64)
  assert.equal(details.specName, 'Frost')
  assert.equal(details.faction, 'HORDE')
})
