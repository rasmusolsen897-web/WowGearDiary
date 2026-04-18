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

async function loadDashboardRows(supabase, guild = null) {
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

  const rosterSource = (charactersRes.data ?? []).length
    ? (charactersRes.data ?? [])
    : Array.isArray(guild?.members)
      ? guild.members
      : []

  const roster = rosterSource.map((character) => {
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

export function serializeGuildDashboardResponse(payload = {}) {
  const charts = payload?.charts ?? {}
  const progress = payload?.progress ?? {}

  return {
    guild: payload?.guild
      ? {
        name: payload.guild.name ?? null,
        realm: payload.guild.realm ?? null,
        region: payload.guild.region ?? null,
      }
      : null,
    charts: {
      parseTrend: (Array.isArray(charts.parseTrend) ? charts.parseTrend : []).map((entry) => ({
        raidDate: entry.raid_night_date ?? entry.raidDate ?? null,
        avgParsePct: entry.avg_parse_pct ?? entry.avgParsePct ?? null,
      })),
      ilvlTrend: (Array.isArray(charts.ilvlTrend) ? charts.ilvlTrend : []).map((entry) => ({
        snapped_at: entry.snapped_at ?? entry.snappedAt ?? null,
        avg_ilvl: entry.avg_ilvl ?? entry.avgIlvl ?? null,
        member_count: entry.member_count ?? entry.memberCount ?? 0,
      })),
    },
    progress: {
      zoneName: progress.zone_name ?? progress.zoneName ?? null,
      progressedBossCount: progress.progressed_boss_count ?? progress.progressedBossCount ?? 0,
      bossCount: progress.boss_count ?? progress.bossCount ?? 0,
      deltaThisWeek: progress.delta_this_week ?? progress.deltaThisWeek ?? 0,
      bosses: (Array.isArray(progress.bosses) ? progress.bosses : []).map((entry) => ({
        name: entry.name ?? entry.encounter_name ?? null,
        pulls: entry.pulls ?? 0,
        kills: entry.kills ?? 0,
        bestPercent: entry.best_percent ?? entry.bestPercent ?? null,
      })),
    },
    leaderboard: (Array.isArray(payload?.leaderboard) ? payload.leaderboard : []).map((entry) => ({
      name: entry.name ?? null,
      role: entry.role ?? null,
      className: entry.class ?? entry.className ?? null,
      specName: entry.spec ?? entry.specName ?? null,
      encounterName: entry.encounter_name ?? entry.encounterName ?? null,
      parsePct: entry.parse_pct ?? entry.parsePct ?? null,
      raidDate: entry.raid_night_date ?? entry.raidDate ?? null,
      wclUrl: entry.wcl_url ?? entry.wclUrl ?? null,
    })),
    attendance: (Array.isArray(payload?.attendance) ? payload.attendance : []).map((entry) => ({
      name: entry.name ?? null,
      role: entry.role ?? null,
      nights: Array.isArray(entry.nights) ? entry.nights : [],
      attendancePct: entry.attendance_pct ?? entry.attendancePct ?? 0,
    })),
    loot: (Array.isArray(payload?.loot) ? payload.loot : []).map((entry) => ({
      playerName: entry.actor_name ?? entry.playerName ?? null,
      itemName: entry.item_name ?? entry.itemName ?? null,
      sourceName: entry.encounter_name ?? entry.sourceName ?? null,
      occurredAt: entry.occurred_at ?? entry.occurredAt ?? null,
      isTier: entry.is_tier ?? entry.isTier ?? false,
      itemLevel: entry.item_level ?? entry.itemLevel ?? null,
    })),
    roster: (Array.isArray(payload?.roster) ? payload.roster : []).map((entry) => ({
      name: entry.name ?? null,
      className: entry.class ?? entry.className ?? null,
      specName: entry.spec ?? entry.specName ?? null,
      role: entry.role ?? null,
      isMain: entry.is_main ?? entry.isMain ?? false,
      avgIlvl: entry.avg_ilvl ?? entry.avgIlvl ?? null,
      lastRaidParsePct: entry.last_raid_parse_pct ?? entry.lastRaidParsePct ?? null,
      parseTrend: (Array.isArray(entry.parse_trend) ? entry.parse_trend : Array.isArray(entry.parseTrend) ? entry.parseTrend : []).map((point) => ({
        raidDate: point.raid_night_date ?? point.raidDate ?? null,
        pct: point.parse_pct ?? point.pct ?? null,
      })),
    })),
    summary: payload?.summary ?? null,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const guild = await loadGuild()

  if (!isConfigured()) {
    return res.status(200).json(serializeGuildDashboardResponse(buildGuildDashboardPayload({ guild })))
  }

  try {
    const supabase = getSupabase()
    const rows = await loadDashboardRows(supabase, guild)
    const payload = serializeGuildDashboardResponse(buildGuildDashboardPayload({
      guild,
      ...rows,
    }))

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate')
    return res.status(200).json(payload)
  } catch (error) {
    console.error('[api/guild-dashboard]', error.message)
    return res.status(500).json({ error: error.message })
  }
}
