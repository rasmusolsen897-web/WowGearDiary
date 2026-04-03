/**
 * api/snapshots.js — Vercel serverless: iLvl + sim DPS history
 *
 * GET  /api/snapshots?character=NAME     → { ilvl: [...], sim: [...] }
 * POST /api/snapshots?type=ilvl          → upsert today's iLvl record (no auth — Blizzard data is public)
 * POST /api/snapshots?type=sim           → insert sim DPS record (requires X-Write-Token)
 */

import { getSupabase, isConfigured } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isConfigured()) {
    if (req.method === 'GET') return res.status(200).json({ ilvl: [], sim: [] })
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = getSupabase()

  // ── GET — fetch snapshot history for one character ─────────────────────────
  if (req.method === 'GET') {
    const { character } = req.query
    if (!character) return res.status(400).json({ error: 'character param required' })

    const [ilvlRes, simRes] = await Promise.all([
      supabase
        .from('ilvl_snapshots')
        .select('avg_ilvl, snapped_at')
        .eq('character_name', character)
        .order('snapped_at', { ascending: true })
        .limit(180), // ~6 months of daily data
      supabase
        .from('sim_snapshots')
        .select('dps, report_type, spec, simmed_at')
        .eq('character_name', character)
        .order('simmed_at', { ascending: true })
        .limit(100),
    ])

    if (ilvlRes.error) console.error('[api/snapshots GET ilvl]', ilvlRes.error.message)
    if (simRes.error)  console.error('[api/snapshots GET sim]',  simRes.error.message)

    return res.status(200).json({
      ilvl: ilvlRes.data ?? [],
      sim:  simRes.data  ?? [],
    })
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { type } = req.query
    const provided = req.headers['x-write-token']
    const expected = process.env.GUILD_WRITE_TOKEN

    if (!expected || provided !== expected) {
      return res.status(401).json({ error: 'Invalid write token' })
    }

    // iLvl snapshot — no write token required (Blizzard data is public knowledge)
    if (type === 'ilvl') {
      const { character_name, avg_ilvl } = req.body ?? {}
      if (!character_name || avg_ilvl == null) {
        return res.status(400).json({ error: 'character_name and avg_ilvl required' })
      }

      // Upsert: one record per character per day, update only if iLvl changed
      const { error } = await supabase.from('ilvl_snapshots').upsert(
        { character_name, avg_ilvl, snapped_at: new Date().toISOString().slice(0, 10) },
        { onConflict: 'character_name,snapped_at' },
      )

      if (error) {
        console.error('[api/snapshots POST ilvl]', error.message)
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ ok: true })
    }

    // Sim snapshot — requires write token
    if (type === 'sim') {
      const { character_name, dps, report_url, report_type, spec } = req.body ?? {}
      if (!character_name || !dps) {
        return res.status(400).json({ error: 'character_name and dps required' })
      }

      const { error } = await supabase.from('sim_snapshots').insert({
        character_name, dps, report_url, report_type, spec,
      })

      if (error) {
        console.error('[api/snapshots POST sim]', error.message)
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'type must be ilvl or sim' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
