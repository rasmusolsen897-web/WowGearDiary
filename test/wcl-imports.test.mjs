import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeGuildDashboardResponse } from '../api/guild-dashboard.js'
import { listWclImportsFromRows } from '../api/_wclWarehouse.js'

test('listWclImportsFromRows returns the manual import API contract', () => {
  const rows = listWclImportsFromRows([
    {
      report_code: 'A1',
      source_url: 'https://www.warcraftlogs.com/reports/A1',
      title: 'Midnight heroic',
      raid_night_date: '2026-04-10',
      zone_name: 'Midnight',
      import_status: 'ready',
      last_error: null,
      updated_at: '2026-04-11T09:00:00.000Z',
      imported_at: '2026-04-11T08:00:00.000Z',
    },
  ])

  assert.deepEqual(rows, [
    {
      report_code: 'A1',
      source_url: 'https://www.warcraftlogs.com/reports/A1',
      title: 'Midnight heroic',
      raid_night_date: '2026-04-10',
      zone_name: 'Midnight',
      import_status: 'ready',
      last_error: null,
      updated_at: '2026-04-11T09:00:00.000Z',
      imported_at: '2026-04-11T08:00:00.000Z',
    },
  ])
})

test('serializeGuildDashboardResponse exposes the guild dashboard frontend contract', () => {
  const response = serializeGuildDashboardResponse({
    guild: { name: 'CAMFTW', realm: 'tarren-mill', region: 'eu' },
    charts: {
      parseTrend: [{ raid_night_date: '2026-04-10', avg_parse_pct: 92 }],
      ilvlTrend: [{ snapped_at: '2026-04-10', avg_ilvl: 711.5, member_count: 2 }],
    },
    progress: {
      zone_name: 'Midnight',
      progressed_boss_count: 1,
      boss_count: 8,
      delta_this_week: 1,
      bosses: [{ name: 'Boss Two', pulls: 3, kills: 1, best_percent: 73.3 }],
    },
    leaderboard: [{ name: 'Whooplol', role: 'dps', encounter_name: 'Boss Two', parse_pct: 91.8, wcl_url: 'https://www.warcraftlogs.com/reports/A1' }],
    attendance: [{ name: 'Whooplol', role: 'dps', nights: [false, false, false, false, true, true], attendance_pct: 33 }],
    loot: [{ actor_name: 'Whooplol', item_name: "Champion's Crest", encounter_name: 'Boss Two', occurred_at: '2026-04-10T20:30:00.000Z', is_tier: true }],
    roster: [{ name: 'Whooplol', class: 'Warrior', spec: 'Arms', role: 'dps', is_main: true, avg_ilvl: 712, last_raid_parse_pct: 91.8, parse_trend: [{ raid_night_date: '2026-04-10', parse_pct: 91.8 }] }],
  })

  assert.deepEqual(response, {
    guild: { name: 'CAMFTW', realm: 'tarren-mill', region: 'eu' },
    charts: {
      parseTrend: [{ raidDate: '2026-04-10', avgParsePct: 92 }],
      ilvlTrend: [{ snapped_at: '2026-04-10', avg_ilvl: 711.5, member_count: 2 }],
    },
    progress: {
      zoneName: 'Midnight',
      progressedBossCount: 1,
      bossCount: 8,
      deltaThisWeek: 1,
      bosses: [{ name: 'Boss Two', pulls: 3, kills: 1, bestPercent: 73.3 }],
    },
    leaderboard: [{
      name: 'Whooplol',
      role: 'dps',
      className: null,
      specName: null,
      encounterName: 'Boss Two',
      parsePct: 91.8,
      raidDate: null,
      wclUrl: 'https://www.warcraftlogs.com/reports/A1',
    }],
    attendance: [{ name: 'Whooplol', role: 'dps', nights: [false, false, false, false, true, true], attendancePct: 33 }],
    loot: [{
      playerName: 'Whooplol',
      itemName: "Champion's Crest",
      sourceName: 'Boss Two',
      occurredAt: '2026-04-10T20:30:00.000Z',
      isTier: true,
      itemLevel: null,
    }],
    roster: [{
      name: 'Whooplol',
      className: 'Warrior',
      specName: 'Arms',
      role: 'dps',
      isMain: true,
      avgIlvl: 712,
      lastRaidParsePct: 91.8,
      parseTrend: [{ raidDate: '2026-04-10', pct: 91.8 }],
    }],
    summary: null,
  })
})
