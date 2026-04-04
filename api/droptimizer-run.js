import {
  assertAutomationScenario,
  executeDirectScenario,
  listBatchCandidates,
} from './_droptimizer-execution.js'
import { TRIGGER_KINDS } from './_droptimizer-store.js'
import { getSupabase, isConfigured } from './_supabase.js'

function requireWriteToken(req, res) {
  const expected = process.env.GUILD_WRITE_TOKEN
  const provided = req.headers['x-write-token']

  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'Invalid write token' })
    return false
  }

  return true
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  if (!requireWriteToken(req, res)) {
    return undefined
  }

  try {
    const scenario = String(req.body?.scenario ?? '').trim()
    const characterName = String(req.body?.characterName ?? '').trim()
    const batch = req.body?.batch === true
    if (!scenario) {
      return res.status(400).json({ error: 'scenario is required' })
    }

    assertAutomationScenario(scenario)
    const supabase = getSupabase()

    if (batch) {
      const { rows } = await listBatchCandidates(supabase, scenario)
      const results = []

      for (const row of rows) {
        results.push(await executeDirectScenario({
          supabase,
          characterName: row.character.name,
          scenario,
          triggerKind: TRIGGER_KINDS.automation,
        }))
      }

      return res.status(200).json({
        ok: true,
        mode: 'batch',
        scenario,
        attempted: rows.length,
        results,
      })
    }

    if (!characterName) {
      return res.status(400).json({ error: 'characterName is required when batch=false' })
    }

    const result = await executeDirectScenario({
      supabase,
      characterName,
      scenario,
      triggerKind: TRIGGER_KINDS.manual,
    })

    return res.status(200).json({
      mode: 'single',
      scenario,
      character: characterName,
      ...result,
    })
  } catch (error) {
    console.error('[api/droptimizer-run]', error.message)
    return res.status(500).json({ error: error.message })
  }
}
