/**
 * api/characters.js — Vercel serverless: character roster backed by Supabase
 *
 * GET    /api/characters           → all characters (public)
 * POST   /api/characters           → bulk upsert (requires X-Write-Token)
 * DELETE /api/characters?name=X    → delete one character (requires X-Write-Token)
 *
 * Row shape (DB → client camelCase conversion):
 *   name, realName, class, spec, role, isMain, realm, altOf, reportUrl, droptimizerUrl
 */

import { getSupabase, isConfigured } from './_supabase.js'

function toRow(m) {
  return {
    name:            m.name,
    real_name:       m.realName      ?? m.real_name      ?? null,
    class:           m.class         ?? '',
    spec:            m.spec          ?? '',
    role:            m.role          ?? 'dps',
    is_main:         m.isMain        ?? m.is_main        ?? true,
    realm:           m.realm         ?? '',
    alt_of:          m.altOf         ?? m.alt_of         ?? null,
    report_url:      m.reportUrl     ?? m.report_url     ?? null,
    droptimizer_url: m.droptimizerUrl ?? m.droptimizer_url ?? null,
    updated_at:      new Date().toISOString(),
  }
}

function toMember(row) {
  return {
    name:           row.name,
    realName:       row.real_name       ?? '',
    class:          row.class           ?? '',
    spec:           row.spec            ?? '',
    role:           row.role            ?? 'dps',
    isMain:         row.is_main         ?? true,
    realm:          row.realm           ?? '',
    altOf:          row.alt_of          ?? null,
    reportUrl:      row.report_url      ?? null,
    droptimizerUrl: row.droptimizer_url ?? null,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isConfigured()) {
    // Supabase not set up — callers fall back to KV
    if (req.method === 'GET') return res.status(200).json(null)
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = getSupabase()

  // ── GET — fetch all characters ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .order('is_main', { ascending: false })
      .order('name')

    if (error) {
      console.error('[api/characters GET]', error.message)
      return res.status(500).json({ error: error.message })
    }

    // Return null (not []) when table is empty so App.jsx knows to fall back to KV
    return res.status(200).json(data?.length ? data.map(toMember) : null)
  }

  // Auth required for writes
  const provided = req.headers['x-write-token']
  const expected = process.env.GUILD_WRITE_TOKEN
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Invalid write token' })
  }

  // ── POST — bulk upsert characters ──────────────────────────────────────────
  if (req.method === 'POST') {
    const { characters } = req.body ?? {}
    if (!Array.isArray(characters) || !characters.length) {
      return res.status(400).json({ error: 'characters[] array required' })
    }

    const rows = characters.map(toRow)
    const { error } = await supabase
      .from('characters')
      .upsert(rows, { onConflict: 'name' })

    if (error) {
      console.error('[api/characters POST]', error.message)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true, count: rows.length })
  }

  // ── DELETE — remove one character ─────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { name } = req.query
    if (!name) return res.status(400).json({ error: 'name query param required' })

    const { error } = await supabase
      .from('characters')
      .delete()
      .eq('name', name)

    if (error) {
      console.error('[api/characters DELETE]', error.message)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
