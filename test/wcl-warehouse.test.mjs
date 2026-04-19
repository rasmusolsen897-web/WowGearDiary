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
  assert.equal(normalizeWclActorKey({ name: 'Whooplol', realm: 'Tarren Mill', region: 'Europe' }), 'eu:tarren-mill:whooplol')
  assert.equal(normalizeWclActorKey({ name: 'Mufuzu', realm: "Quel'Thalas", region: 'EU' }), 'eu:quelthalas:mufuzu')
  assert.equal(normalizeWclActorKey({ name: ' Okr\u0061\u0300m ', realm: 'Tarren Mill', region: 'Europe' }), 'eu:tarren-mill:okràm')
})

test('buildWclWarehouseDocument flattens nested WCL role rankings into fight-player warehouse rows', () => {
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
      101: {
        data: [
          {
            bracketData: 712.1,
            roles: {
              tanks: {
                characters: [],
              },
              healers: {
                characters: [
                  {
                    id: 2,
                    name: 'Mufuzu',
                    class: 'Priest',
                    spec: 'Holy',
                    server: {
                      name: 'Tarren Mill',
                      region: { name: 'Europe' },
                    },
                    rankPercent: 80.1,
                    amount: 13234,
                    bracketData: 710.9,
                  },
                ],
              },
              dps: {
                characters: [
                  {
                    id: 1,
                    name: 'Whooplol',
                    class: 'Warrior',
                    spec: 'Arms',
                    server: {
                      name: 'Tarren Mill',
                      region: { code: 'EU' },
                    },
                    rankPercent: 73.2,
                    amount: 12345,
                  },
                ],
              },
            },
          },
        ],
      },
      102: {
        data: [
          {
            bracketData: 712.5,
            roles: {
              tanks: { characters: [] },
              healers: { characters: [] },
              dps: {
                characters: [
                  {
                    id: 1,
                    name: 'Whooplol',
                    class: 'Warrior',
                    spec: 'Arms',
                    server: {
                      name: 'Tarren Mill',
                      region: { code: 'EU' },
                    },
                    rankPercent: 95.4,
                    amount: 18001,
                  },
                ],
              },
            },
          },
        ],
      },
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
  const whooplol = document.fightPlayers.find((row) => row.actor_name === 'Whooplol')
  const mufuzu = document.fightPlayers.find((row) => row.actor_name === 'Mufuzu')
  assert.equal(whooplol?.actor_key, 'eu:tarren-mill:whooplol')
  assert.equal(whooplol?.parse_percent, 73.2)
  assert.equal(whooplol?.role, 'dps')
  assert.equal(whooplol?.dps, 12345)
  assert.equal(whooplol?.item_level, 712.1)
  assert.equal(mufuzu?.role, 'healer')
  assert.equal(mufuzu?.item_level, 710.9)
  assert.equal(document.lootEvents.length, 1)
  assert.equal(document.lootEvents[0].item_name, "Champion's Crest")
})

test('buildWclWarehouseDocument keeps live heroic imports actor-key compatible when rankings are unavailable', () => {
  const document = buildWclWarehouseDocument('CywHV6b2ptL9WJrF', {
    code: 'CywHV6b2ptL9WJrF',
    title: 'week 4 - Camftw lets go',
    visibility: 'private',
    startTime: 1770000000000,
    endTime: 1770003600000,
    revision: 8,
    segments: 1,
    region: { code: 'eu', name: 'Europe' },
    zone: { id: 46, name: 'VS / DR / MQD' },
    guild: {
      id: 7,
      name: 'CAMFTW',
      server: {
        id: 11,
        name: 'Tarren Mill',
        slug: 'tarren-mill',
        region: { code: 'EU', name: 'Europe' },
      },
    },
    owner: { id: 12, name: 'Whooplol' },
    masterData: {
      actors: [
        { id: 1, name: 'Whooplol', type: 'Player', subType: 'Warrior', server: 'Tarren Mill', gameID: 1 },
        { id: 2, name: 'Mufuzu', type: 'Player', subType: 'Priest', server: 'Tarren Mill', gameID: 2 },
      ],
    },
    fights: [
      {
        id: 17,
        name: 'Vaelgor & Ezzorak',
        encounterID: 3178,
        difficulty: 4,
        startTime: 1770000100000,
        endTime: 1770000200000,
        kill: false,
        size: 20,
        fightPercentage: 43.27,
        bossPercentage: 43.27,
        completeRaid: false,
        inProgress: false,
        friendlyPlayers: [1, 2],
        enemyPlayers: [99],
      },
    ],
  }, {
    raidNightDate: '2026-04-16',
    fightRankingsByFightId: {},
    lootEvents: [],
  })

  assert.equal(document.report.zone_id, 46)
  assert.equal(document.report.zone_name, 'VS / DR / MQD')
  assert.equal(document.fightPlayers.length, 2)
  assert.deepEqual(document.fightPlayers.map((row) => row.actor_key), [
    'eu:tarren-mill:whooplol',
    'eu:tarren-mill:mufuzu',
  ])
  assert.equal(document.fightPlayers[0].parse_percent, null)
  assert.equal(document.fightPlayers[0].raid_night_date, '2026-04-16')
})

test('buildGuildDashboardPayload stays heroic-only and returns the fixed eight-boss Midnight rail', () => {
  const payload = buildGuildDashboardPayload({
    guild: { name: 'CAMFTW', realm: 'Tarren Mill', region: 'Europe' },
    reports: [
      { report_code: 'A', raid_night_date: '2026-04-03', zone_name: 'Midnight', import_status: 'ready' },
      { report_code: 'B', raid_night_date: '2026-04-10', zone_name: 'Midnight', import_status: 'ready' },
      { report_code: 'C', raid_night_date: '2026-04-17', zone_name: 'Midnight', import_status: 'ready' },
    ],
    fights: [
      { report_code: 'A', fight_id: 1, encounter_id: 1101, encounter_name: 'Imperator Averzian', difficulty: 4, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-03' },
      { report_code: 'B', fight_id: 2, encounter_id: 0, encounter_name: 'Trash', difficulty: 5, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-10' },
      { report_code: 'B', fight_id: 3, encounter_id: 1101, encounter_name: 'Imperator Averzian', difficulty: 5, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-10' },
      { report_code: 'B', fight_id: 4, encounter_id: 1105, encounter_name: 'Vorasius', difficulty: 5, kill: false, boss_percentage: 18, fight_percentage: 82, raid_night_date: '2026-04-10' },
      { report_code: 'B', fight_id: 5, encounter_id: 1106, encounter_name: 'Vaelgor & Ezzorak', difficulty: 5, kill: false, boss_percentage: 42, fight_percentage: 58, raid_night_date: '2026-04-10' },
      { report_code: 'C', fight_id: 6, encounter_id: 1102, encounter_name: "Belo'ren, Child of Al'ar", difficulty: 5, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-17' },
      { report_code: 'C', fight_id: 7, encounter_id: 1103, encounter_name: 'Fallen-King Salhadaar', difficulty: 5, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-17' },
      { report_code: 'C', fight_id: 8, encounter_id: 1199, encounter_name: 'Training Dummy', difficulty: 5, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-17' },
    ],
    fightPlayers: [
      { report_code: 'A', fight_id: 1, raid_night_date: '2026-04-03', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 99.1 },
      { report_code: 'B', fight_id: 3, raid_night_date: '2026-04-10', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 92.4, role: 'dps', class_name: 'Warrior', spec_name: 'Arms' },
      { report_code: 'B', fight_id: 3, raid_night_date: '2026-04-10', kill: true, actor_key: 'eu:tarren-mill:mufuzu', actor_name: 'Mufuzu', parse_percent: 88.2, role: 'healer', class_name: 'Priest', spec_name: 'Holy' },
      { report_code: 'B', fight_id: 4, raid_night_date: '2026-04-10', kill: false, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 41.5 },
      { report_code: 'B', fight_id: 5, raid_night_date: '2026-04-10', kill: false, actor_key: 'eu:tarren-mill:mufuzu', actor_name: 'Mufuzu', parse_percent: 55.5 },
      { report_code: 'C', fight_id: 6, raid_night_date: '2026-04-17', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 96.1, role: 'dps', class_name: 'Warrior', spec_name: 'Arms' },
    ],
    roster: [
      { name: 'Whooplol', is_main: true, role: 'dps', class: 'Warrior', spec: 'Arms', avg_ilvl: 712, realm: 'Tarren Mill', region: 'Europe' },
      { name: 'Mufuzu', is_main: true, role: 'healer', class: 'Priest', spec: 'Holy', avg_ilvl: 710, realm: 'Tarren Mill', region: 'EU' },
      { name: 'Altson', is_main: false, role: 'dps', class: 'Rogue', spec: 'Assassination', avg_ilvl: 705, realm: 'Tarren Mill', region: 'EU' },
    ],
    ilvlSnapshots: [
      { character_name: 'Whooplol', snapped_at: '2026-04-10', avg_ilvl: 713 },
      { character_name: 'Mufuzu', snapped_at: '2026-04-10', avg_ilvl: 710 },
      { character_name: 'Whooplol', snapped_at: '2026-04-17', avg_ilvl: 715 },
      { character_name: 'Mufuzu', snapped_at: '2026-04-17', avg_ilvl: 712 },
    ],
  })

  assert.deepEqual(payload.charts.parseTrend, [
    { raid_night_date: '2026-04-10', avg_parse_pct: 90 },
    { raid_night_date: '2026-04-17', avg_parse_pct: 96 },
  ])
  assert.deepEqual(payload.charts.ilvlTrend, [
    { snapped_at: '2026-04-10', avg_ilvl: 711.5, member_count: 2 },
    { snapped_at: '2026-04-17', avg_ilvl: 713.5, member_count: 2 },
  ])
  assert.equal(payload.summary.raid_night_count, 2)
  assert.equal(payload.summary.latest_raid_night_date, '2026-04-17')
  assert.equal(payload.progress.progressed_boss_count, 3)
  assert.equal(payload.progress.boss_count, 8)
  assert.equal(payload.progress.delta_this_week, 2)
  assert.deepEqual(payload.progress.bosses.map((boss) => boss.name), [
    'Imperator Averzian',
    "Belo'ren, Child of Al'ar",
    'Fallen-King Salhadaar',
    'Crown of the Cosmos',
    'Vorasius',
    'Vaelgor & Ezzorak',
    'Midnight Falls',
    'Chimaerus the Undreamt God',
  ])
  assert.deepEqual(payload.progress.bosses[4], {
    name: 'Vorasius',
    pulls: 1,
    kills: 0,
    best_percent: 18,
  })
  assert.equal(payload.leaderboard[0].name, 'Whooplol')
  assert.equal(payload.leaderboard[0].parse_pct, 96.1)
  assert.equal(payload.roster.find((member) => member.name === 'Whooplol')?.last_raid_parse_pct, 96.1)
  assert.equal(payload.roster.find((member) => member.name === 'Whooplol')?.parse_trend.length, 2)
  assert.equal(payload.attendance.length, 2)
  assert.deepEqual(payload.attendance.find((member) => member.name === 'Whooplol')?.nights, [false, false, false, false, true, true])
  assert.deepEqual(payload.attendance.find((member) => member.name === 'Mufuzu')?.nights, [false, false, false, false, true, false])
})

test('buildGuildDashboardPayload accepts live heroic difficulty 4 and keeps progress or attendance visible without parses', () => {
  const payload = buildGuildDashboardPayload({
    guild: { name: 'CAMFTW', realm: 'Tarren Mill', region: 'EU' },
    reports: [
      { report_code: 'LIVE1', zone_id: 46, zone_name: 'VS / DR / MQD', raid_night_date: '2026-04-09', import_status: 'ready' },
      { report_code: 'LIVE2', zone_id: 46, zone_name: 'VS / DR / MQD', raid_night_date: '2026-04-16', import_status: 'ready' },
    ],
    fights: [
      { report_code: 'LIVE1', fight_id: 1, encounter_id: 3176, encounter_name: 'Imperator Averzian', difficulty: 4, kill: true, boss_percentage: 0.03, fight_percentage: 0.03, raid_night_date: '2026-04-09' },
      { report_code: 'LIVE1', fight_id: 2, encounter_id: 0, encounter_name: 'Darkspawn', difficulty: null, kill: false, boss_percentage: null, fight_percentage: null, raid_night_date: '2026-04-09' },
      { report_code: 'LIVE2', fight_id: 3, encounter_id: 3178, encounter_name: 'Vaelgor & Ezzorak', difficulty: 4, kill: false, boss_percentage: 43.27, fight_percentage: 43.27, raid_night_date: '2026-04-16' },
      { report_code: 'LIVE2', fight_id: 4, encounter_id: 1199, encounter_name: 'Training Dummy', difficulty: 10, kill: true, boss_percentage: 100, fight_percentage: 100, raid_night_date: '2026-04-16' },
    ],
    fightPlayers: [
      { report_code: 'LIVE1', fight_id: 1, raid_night_date: '2026-04-09', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: null, role: 'dps', class_name: 'Warrior', spec_name: 'Arms' },
      { report_code: 'LIVE1', fight_id: 1, raid_night_date: '2026-04-09', kill: true, actor_key: 'eu:tarren-mill:mufuzu', actor_name: 'Mufuzu', parse_percent: null, role: 'healer', class_name: 'Priest', spec_name: 'Holy' },
      { report_code: 'LIVE2', fight_id: 3, raid_night_date: '2026-04-16', kill: false, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: null, role: 'dps', class_name: 'Warrior', spec_name: 'Arms' },
      { report_code: 'LIVE2', fight_id: 3, raid_night_date: '2026-04-16', kill: false, actor_key: 'eu:tarren-mill:mufuzu', actor_name: 'Mufuzu', parse_percent: null, role: 'healer', class_name: 'Priest', spec_name: 'Holy' },
      { report_code: 'LIVE2', fight_id: 4, raid_night_date: '2026-04-16', kill: true, actor_key: 'eu:tarren-mill:whooplol', actor_name: 'Whooplol', parse_percent: 99.9, role: 'dps', class_name: 'Warrior', spec_name: 'Arms' },
    ],
    roster: [
      { name: 'Whooplol', is_main: true, role: 'dps', class: 'Warrior', spec: 'Arms', avg_ilvl: 712, realm: 'Tarren Mill', region: 'Europe' },
      { name: 'Mufuzu', is_main: true, role: 'healer', class: 'Priest', spec: 'Holy', avg_ilvl: 710, realm: 'Tarren Mill', region: 'EU' },
    ],
  })

  assert.equal(payload.summary.raid_night_count, 2)
  assert.equal(payload.summary.latest_raid_night_date, '2026-04-16')
  assert.equal(payload.progress.progressed_boss_count, 1)
  assert.equal(payload.progress.bosses.find((boss) => boss.name === 'Imperator Averzian')?.kills, 1)
  assert.equal(payload.progress.bosses.find((boss) => boss.name === 'Vaelgor & Ezzorak')?.pulls, 1)
  assert.deepEqual(payload.charts.parseTrend, [
    { raid_night_date: '2026-04-09', avg_parse_pct: null },
    { raid_night_date: '2026-04-16', avg_parse_pct: null },
  ])
  assert.equal(payload.leaderboard.length, 0)
  assert.deepEqual(payload.attendance.find((member) => member.name === 'Whooplol')?.nights, [false, false, false, false, true, true])
  assert.deepEqual(payload.attendance.find((member) => member.name === 'Mufuzu')?.nights, [false, false, false, false, true, true])
})
