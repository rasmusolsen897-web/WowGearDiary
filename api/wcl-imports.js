import { getSupabase, isConfigured } from './_supabase.js'
import { importWclWarehouseReport, listWclImportsFromRows } from './_wclWarehouse.js'

function requireWriteToken(req, res) {
  const expected = process.env.GUILD_WRITE_TOKEN
  if (!expected) {
    res.status(503).json({ error: 'GUILD_WRITE_TOKEN not set in Vercel env vars' })
    return false
  }

  const provided = req.headers['x-write-token']
  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'Invalid write token' })
    return false
  }

  return true
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isConfigured()) {
    if (req.method === 'GET') return res.status(200).json([])
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = getSupabase()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('wcl_reports')
      .select('report_code, source_url, title, raid_night_date, zone_name, import_status, last_error, updated_at, imported_at')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[api/wcl-imports GET]', error.message)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json(listWclImportsFromRows(data ?? []))
  }

  if (req.method === 'POST') {
    if (!requireWriteToken(req, res)) return

    const reports = Array.isArray(req.body?.reports)
      ? req.body.reports
      : req.body?.report
        ? [req.body.report]
        : []

    if (!reports.length) {
      return res.status(400).json({ error: 'reports[] array required' })
    }

    const imported = []
    const failed = []

    for (const reportInput of reports) {
      try {
        imported.push(await importWclWarehouseReport({ supabase, reportInput }))
      } catch (error) {
        failed.push({
          reportInput,
          error: error.message,
        })
      }
    }

    return res.status(200).json({ ok: true, imported, failed })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
