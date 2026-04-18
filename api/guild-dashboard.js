import { kv } from '@vercel/kv'
import { getSupabase, isConfigured } from './_supabase.js'
import { buildGuildDashboardPayload } from './_wclWarehouse.js'

const GUILD_KEY = 'wow-gear-diary:guild'

function normalizeMember(member = {}) {
  return {
    name: member.name ?? null,
    class: member.class ?? '',
    spec: member.spec ?? '',
    role: member.role ?? 'dps',
    is_main: member.isMain ?? member.is_main ?? true,
    realm: member.realm ?? '',
  }
}

function latestSnapshotsByCharacter(rows = []) {
  const byName = new Map()
  for (const row of rows) {
    const name = row.character_name ?? row.name
    if (!name) continue
    const existing = byName.get(name)
    const currentTime = Date.parse(row.snapped_at ?? row.snappedAt ?? '')
    const existingTime = existing ? Date.parse(existing.snapped_at ?? existing.snappedAt ?? '') : -Infinity
    if (!existing || currentTime >= existingTime) {
      byName.set(name, row)
    }
  }
  return byName
}

async function loadGuild() {
  if (!process.env.KV_REST_API_URL) return null
  try {
    const storedGuild = await kv.get(GUILD_KEY)
    if (!storedGuild || typeof storedGuild !== 'object') return storedGuild ?? null
    return storedGuild
  } catch (error) {
    console.error('[api/guild-dashboard] guild load failed', error.message)
    return null
  }
}

async function loadDashboardRows(supabase) {
  const [charactersRes, ilvlRes, reportsRes, fightsRes, fightPlayersRes, lootRes] = await Promise.all([
    supabase.from('characters').select('name, class, spec, role, is_main, realm'),
    supabase.from('ilvl_snapshots').select('character_name, avg_ilvl, snapped_at'),
    supabase.from('wcl_reports').select('report_code, source_url, title, guild_name, guild_server_slug, guild_server_region, zone_name, raid_night_date, import_status, last_error, imported_at, updated_at'),
    supabase.from('wcl_fights').select('report_code, fight_id, encounter_id, encounter_name, difficulty, kill, size, start_time, end_time, average_item_level, boss_percentage, fight_percentage, complete_raid, in_progress, wipe_called_time, raid_night_date'),
    supabase.from('wcl_fight_players').select('report_code, fight_id, actor_key, actor_id, actor_name, actor_realm, actor_region, class_name, spec_name, role, parse_percent, dps, item_level, kill, raid_night_date'),
    supabase.from('wcl_loot_events').select('event_uid, report_code, fight_id, actor_key, actor_name, item_id, item_name, item_level, quality, encounter_name, occurred_at, is_tier'),
  ])

  for (const result of [charactersRes, ilvlRes, reportsRes, fightsRes, fightPlayersRes, lootRes]) {
    if (result.error) throw result.error
  }

  const latestSnapshots = latestSnapshotsByCharacter(ilvlRes.data ?? [])

  const roster = (charactersRes.data ?? []).map((character) => {
    const latest = latestSnapshots.get(character.name)
    return {
      ...normalizeMember(character),
      avg_ilvl: latest?.avg_ilvl ?? null,
    }
  })

  return {
    roster,
    ilvlSnapshots: ilvlRes.data ?? [],
    reports: reportsRes.data ?? [],
    fights: fightsRes.data ?? [],
    fightPlayers: fightPlayersRes.data ?? [],
    lootEvents: lootRes.data ?? [],
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const guild = await loadGuild()

  if (!isConfigured()) {
    return res.status(200).json(buildGuildDashboardPayload({ guild }))
  }

  try {
    const supabase = getSupabase()
    const rows = await loadDashboardRows(supabase)
    const payload = buildGuildDashboardPayload({
      guild,
      ...rows,
    })

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate')
    return res.status(200).json(payload)
  } catch (error) {
    console.error('[api/guild-dashboard]', error.message)
    return res.status(500).json({ error: error.message })
  }
}
