import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cleanupRemovedCharacterData,
  syncCharactersAuthoritatively,
} from '../api/_charactersSync.js'

function createFakeSupabase({ runIds = [] } = {}) {
  const operations = []

  return {
    operations,
    from(table) {
      return {
        select(columns) {
          operations.push({ table, action: 'select', columns })
          return this
        },
        in(column, values) {
          operations.push({ table, action: 'in', column, values })

          if (table === 'sim_runs' && column === 'character_name') {
            return Promise.resolve({
              data: runIds.map((id) => ({ id })),
              error: null,
            })
          }

          return Promise.resolve({ error: null, data: [] })
        },
        delete() {
          operations.push({ table, action: 'delete' })
          return this
        },
        upsert(rows, options) {
          operations.push({ table, action: 'upsert', rows, options })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

test('cleanupRemovedCharacterData removes stale rows from dependent tables', async () => {
  const supabase = createFakeSupabase({ runIds: [10, 11] })

  await cleanupRemovedCharacterData(supabase, ['Krypts'])

  assert.deepEqual(
    supabase.operations.filter((entry) => entry.action === 'delete').map((entry) => entry.table),
    [
      'sim_run_items',
      'droptimizer_payloads',
      'droptimizer_jobs',
      'ilvl_snapshots',
      'sim_snapshots',
      'sim_runs',
      'characters',
    ],
  )
})

test('syncCharactersAuthoritatively reports stale names for cleanup', async () => {
  const supabase = createFakeSupabase()
  supabase.from = (table) => {
    if (table === 'characters') {
      return {
        select() {
          return Promise.resolve({
            data: [{ name: 'Whooplol' }, { name: 'Krypts' }],
            error: null,
          })
        },
        upsert(rows, options) {
          supabase.operations.push({ table, action: 'upsert', rows, options })
          return Promise.resolve({ error: null })
        },
        delete() {
          supabase.operations.push({ table, action: 'delete' })
          return this
        },
        in(column, values) {
          supabase.operations.push({ table, action: 'in', column, values })
          return Promise.resolve({ error: null, data: [] })
        },
      }
    }

    return createFakeSupabase().from(table)
  }

  const result = await syncCharactersAuthoritatively(
    supabase,
    [{ name: 'Whooplol' }, { name: 'Okràm' }],
    (member) => member,
  )

  assert.deepEqual(result.removedNames, ['Krypts'])
})
