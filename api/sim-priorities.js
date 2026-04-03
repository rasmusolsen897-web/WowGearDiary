import { buildScenarioResponse, DROPTIMIZER_SCENARIOS } from './_droptimizer.js'
import { getSupabase, isConfigured } from './_supabase.js'

function pickLatest(rows, scenario, predicate = () => true) {
  return rows.find((row) => row.scenario === scenario && predicate(row)) ?? null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { character } = req.query
  if (!character) {
    return res.status(400).json({ error: 'character query param required' })
  }

  if (!isConfigured()) {
    return res.status(200).json({ character, scenarios: {} })
  }

  const supabase = getSupabase()
  const { data: runs, error } = await supabase
    .from('sim_runs')
    .select('id, scenario, status, run_date, started_at, completed_at, error_message, report_url, base_dps, difficulty, attempt_count, next_retry_at')
    .eq('character_name', character)
    .in('scenario', Object.keys(DROPTIMIZER_SCENARIOS))
    .order('run_date', { ascending: false })
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[api/sim-priorities]', error.message)
    return res.status(500).json({ error: error.message })
  }

  const scenarios = {}

  for (const scenarioKey of Object.keys(DROPTIMIZER_SCENARIOS)) {
    const latestRun = pickLatest(runs ?? [], scenarioKey)
    const latestCompletedRun = pickLatest(runs ?? [], scenarioKey, (row) => row.status === 'completed')
    let items = []

    if (latestCompletedRun?.id) {
      const { data: itemRows, error: itemError } = await supabase
        .from('sim_run_items')
        .select('item_id, item_name, slot, item_level, dps_delta, dps_pct, source_type, source_id, source_name')
        .eq('sim_run_id', latestCompletedRun.id)
        .order('dps_delta', { ascending: false })

      if (itemError) {
        console.error('[api/sim-priorities items]', itemError.message)
      } else {
        items = itemRows ?? []
      }
    }

    scenarios[scenarioKey] = buildScenarioResponse(scenarioKey, latestRun, latestCompletedRun, items)
  }

  return res.status(200).json({ character, scenarios })
}
