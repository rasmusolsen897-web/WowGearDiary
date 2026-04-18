import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAuthoritativeCharacterSyncPlan,
  pruneGuildMembers,
} from '../src/utils/rosterSync.js'

test('pruneGuildMembers removes Krypts and clears orphaned altOf references', () => {
  const members = [
    { name: 'Whooplol', isMain: true, altOf: null },
    { name: 'Krypts', isMain: true, altOf: null },
    { name: 'Dostoblast', isMain: false, altOf: 'Krypts' },
  ]

  const pruned = pruneGuildMembers(members, {
    removedNames: ['Krypts'],
  })

  assert.deepEqual(pruned, [
    { name: 'Whooplol', isMain: true, altOf: null },
    { name: 'Dostoblast', isMain: false, altOf: null },
  ])
})

test('buildAuthoritativeCharacterSyncPlan identifies stale characters to delete', () => {
  const existing = [
    { name: 'Whooplol' },
    { name: 'Krypts' },
  ]
  const incoming = [
    { name: 'Whooplol' },
    { name: 'Okràm' },
  ]

  assert.deepEqual(
    buildAuthoritativeCharacterSyncPlan(existing, incoming),
    {
      removedNames: ['Krypts'],
      upsertNames: ['Whooplol', 'Okràm'],
    },
  )
})
