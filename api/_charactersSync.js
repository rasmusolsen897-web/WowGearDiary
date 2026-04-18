import { buildAuthoritativeCharacterSyncPlan } from '../src/utils/rosterSync.js'

export async function cleanupRemovedCharacterData(supabase, removedNames = []) {
  if (!Array.isArray(removedNames) || removedNames.length === 0) return

  const { data: runs, error: runsError } = await supabase
    .from('sim_runs')
    .select('id')
    .in('character_name', removedNames)

  if (runsError) throw runsError

  const runIds = (runs ?? []).map((run) => run.id).filter(Boolean)
  if (runIds.length > 0) {
    const { error } = await supabase
      .from('sim_run_items')
      .delete()
      .in('sim_run_id', runIds)

    if (error) throw error
  }

  const cleanupTargets = [
    ['droptimizer_payloads', 'character_name'],
    ['droptimizer_jobs', 'character_name'],
    ['ilvl_snapshots', 'character_name'],
    ['sim_snapshots', 'character_name'],
    ['sim_runs', 'character_name'],
    ['characters', 'name'],
  ]

  for (const [table, column] of cleanupTargets) {
    const { error } = await supabase
      .from(table)
      .delete()
      .in(column, removedNames)

    if (error) throw error
  }
}

export async function syncCharactersAuthoritatively(supabase, characters = [], toRow) {
  const { data: existingCharacters, error: existingError } = await supabase
    .from('characters')
    .select('name')

  if (existingError) throw existingError

  const plan = buildAuthoritativeCharacterSyncPlan(existingCharacters ?? [], characters)
  const rows = (Array.isArray(characters) ? characters : []).map(toRow)

  if (rows.length > 0) {
    const { error } = await supabase
      .from('characters')
      .upsert(rows, { onConflict: 'name' })

    if (error) throw error
  }

  await cleanupRemovedCharacterData(supabase, plan.removedNames)

  return {
    count: rows.length,
    removedNames: plan.removedNames,
  }
}
