import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGuildDashboardPayload,
  buildWclWarehouseDocument,
  normalizeWclActorKey,
  normalizeWclReportCode,
} from '../api/_wclWarehouse.js'

test('normalizeWclReportCode extracts report codes from URLs and raw codes', () => {
  assert.equal(
    normalizeWclReportCode('https://www.warcraftlogs.com/reports/TmpXzvrL41waPjWd'),
    'TmpXzvrL41waPjWd',
  )
  assert.equal(normalizeWclReportCode('TmpXzvrL41waPjWd'), 'TmpXzvrL41waPjWd')
  assert.equal(normalizeWclReportCode('   '), null)
})

test('normalizeWclActorKey keeps cross-roster identities stable', () => {
  assert.equal(normalizeWclActorKey({ name: 'Whooplol', realm: 'Tarren Mill', region: 'EU' }), 'eu:tarren-mill:whooplol')
  assert.equal(normalizeWclActorKey({ name: 'Mufuzu', realm: "Quel'Thalas", region: 'EU' }), 'eu:quelthalas:mufuzu')
})

test('buildWclWarehouseDocument normalizes fights, players, and loot into warehouse rows', () => {
  const document = buildWclWarehouseDocument('TmpXzvrL41waPjWd', {
    code: 'TmpXzvrL41waPjWd',
    title: 'Sample raid',
    visibility: 'public',
    startTime: 1710000000000,
    endTime: 1710003600000,
    revision: 3,
    segments: 2,
    region: { code: 'eu', name: 'EU' },
    zone: { id: 48, name: 'Midnight' },
    guild: { id: 7, name: 'CAMFTW' },
    owner: { id: 11, name: 'Whooplol' },
    masterData: {
      actors: [
        { id: 1, name: 'Whooplol', type: 'Player', subType: 'Warrior', server: 'Tarren Mill', gameID: 1 },
        { id: 2, name: 'Mufuzu', type: 'Player', subType: 'Priest', server: 'Tarren Mill', gameID: 2 },
      ],
    },
    fights: [
      {
        id: 101,
        name: 'Boss One',
        encounterID: 9001,
        difficulty: 5,
        startTime: 1710000100000,
        endTime: 1710000200000,
        kill: false,
        size: 20,
        averageItemLevel: 676.5,
        bossPercentage: 73.3,
        fightPercentage: 68.2,
        completeRaid: false,
        inProgress: false,
        wipeCalledTime: 1710000195000,
        friendlyPlayers: [1, 2],
        enemyPlayers: [99],
      },
      {
        id: 102,
        name: 'Boss One',
        encounterID: 9001,
        difficulty: 5,
        startTime: 1710000300000,
        endTime: 1710000400000,
        kill: true,
        size: 20,
        bossPercentage: 100,
        fightPercentage: 100,
        completeRaid: true,
        inProgress: false,
        friendlyPlayers: [1],
        enemyPlayers: [99],
      },
    ],
  }, {
    raidNightDate: '2026-04-10',
    fightRankingsByFightId: {
      101: [
        {
          actor: { id: 1, name: 'Whooplol', server: 'Tarren Mill', type: 'Player', subType: 'Warrior' },
          rankPercent: 73.2,
          dps: 12345,
          itemLevel: 712.1,
        },
        {
          actor: { id: 2, name: 'Mufuzu', server: 'Tarren Mill', type: 'Player', subType: 'Priest' },
          rankPercent: 80.1,
          dps: 13234,
          itemLevel: 710.9,
        },
      ],
      102: [
        {
          actor: { id: 1, name: 'Whooplol', server: 'Tarren Mill', type: 'Player', subType: 'Warrior' },
          rankPercent: 95.4,
          dps: 18001,
          itemLevel: 712.5,
        },
      ],
    },
    lootEvents: [
      {
        eventUid: 'loot-1',
        fightId: 102,
        actor: { id: 1, name: 'Whooplol', server: 'Tarren Mill' },
        itemId: 2001,
        itemName: "Champion's Crest",
        itemLevel: 720,
        quality: 4,
        encounterName: 'Boss One',
        occurredAt: '2026-04-10T20:30:00.000Z',
        isTier: true,
      },
    ],
  })

  assert.equal(document.report.report_code, 'TmpXzvrL41waPjWd')
  assert.equal(document.report.zone_name, 'Midnight')
  assert.equal(document.report.raid_night_date, '2026-04-10')
  assert.equal(document.fights.length, 2)
  assert.equal(document.fightPlayers.length, 3)
  assert.equal(document.fightPlayers[0].actor_key, 'eu:tarren-mill:whooplol')
  assert.equal(document.fightPlayers[0].parse_percent, 73.2)
  assert.equal(document.lootEvents.length, 1)
  assert.equal(document.lootEvents[0].item_name, "Champion's Crest")
})

test('buildGuildDashboardPayload aggregates nightly parse trends and roster summaries', () => {
  const payload = buildGuildDashboardPayload({
    guild: { name: 'CAMFTW', realm: 'Tarren Mill', region: 'eu' },
    reports: [
      { report_code: 'A', raid_night_date: '2026-04-03', zone_name: 'Midnight', import_status: 'ready' },
      { report_code: 'B', raid_night_date: '2026-04-10', zone_name: 'Midnight', import_status: 'ready' },
    ],
    fights: [
      { report_code: 'A', fight_id: 1, encounter_name: 'Boss One', kill: false, boss_percentage: 73.3, fight_percentage: 68.2, raid_night_date: '2026-04-03' },
      { report_code: 'A', fight_id: 2, encounter_name: 'Boss One', kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-03' },
      { report_code: 'B', fight_id: 3, encounter_name: 'Boss Two', kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-10' },
    ],
    fightPlayers: [
      { report_code: 'A', fight_id: 1, raid_night_date: '2026-04-03', kill: false, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 73.2 },
      { report_code: 'A', fight_id: 1, raid_night_date: '2026-04-03', kill: false, actor_key: 'eu:tarren-mill:mufuzu', actor_name: 'Mufuzu', parse_percent: 80.1 },
      { report_code: 'A', fight_id: 2, raid_night_date: '2026-04-03', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 95.4 },
      { report_code: 'B', fight_id: 3, raid_night_date: '2026-04-10', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 91.8 },
    ],
    roster: [
      { name: 'Whooplol', is_main: true, role: 'dps', class: 'Warrior', spec: 'Arms', avg_ilvl: 712, actor_key: 'eu:tarren-mill:whooplol' },
      { name: 'Mufuzu', is_main: true, role: 'healer', class: 'Priest', spec: 'Holy', avg_ilvl: 710, actor_key: 'eu:tarren-mill:mufuzu' },
      { name: 'Altson', is_main: false, role: 'dps', class: 'Rogue', spec: 'Assassination', avg_ilvl: 705, actor_key: 'eu:tarren-mill:altson' },
    ],
    ilvlSnapshots: [
      { character_name: 'Whooplol', snapped_at: '2026-04-03', avg_ilvl: 711 },
      { character_name: 'Mufuzu', snapped_at: '2026-04-03', avg_ilvl: 709 },
      { character_name: 'Whooplol', snapped_at: '2026-04-10', avg_ilvl: 713 },
      { character_name: 'Mufuzu', snapped_at: '2026-04-10', avg_ilvl: 710 },
    ],
  })

  assert.deepEqual(payload.charts.parseTrend, [
    { raid_night_date: '2026-04-03', avg_parse_pct: 95 },
    { raid_night_date: '2026-04-10', avg_parse_pct: 92 },
  ])
  assert.deepEqual(payload.charts.ilvlTrend, [
    { snapped_at: '2026-04-03', avg_ilvl: 710, member_count: 2 },
    { snapped_at: '2026-04-10', avg_ilvl: 711.5, member_count: 2 },
  ])
  assert.equal(payload.leaderboard[0].name, 'Whooplol')
  assert.equal(payload.leaderboard[0].parse_pct, 92)
  assert.equal(payload.roster.find((member) => member.name === 'Whooplol')?.last_raid_parse_pct, 92)
  assert.equal(payload.roster.find((member) => member.name === 'Whooplol')?.parse_trend.length, 2)
  assert.equal(payload.attendance.length, 2)
  assert.equal(payload.attendance[0].nights.length, 2)
})
