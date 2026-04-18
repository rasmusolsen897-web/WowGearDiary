export const MIDNIGHT_TIER_ZONE_ID = 48
export const MIDNIGHT_TIER_ZONE_NAME = 'VS / DR / MQD (Beta)'

export const MIDNIGHT_RAIDS = [
  {
    name: 'The Voidspire',
    bosses: [
      'Imperator Averzian',
      'Vorasius',
      'Fallen-King Salhadaar',
      'Vaelgor & Ezzorak',
      'Lightblinded Vanguard',
      'Crown of the Cosmos',
    ],
  },
  {
    name: 'The Dreamrift',
    bosses: ['Chimaerus the Undreamt God'],
  },
  {
    name: "March on Quel'Danas",
    bosses: ["Belo'ren, Child of Al'ar", 'Midnight Falls'],
  },
]

function normalizeText(value) {
  return String(value ?? '').normalize('NFC').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function createRaidMap() {
  return MIDNIGHT_RAIDS.map((raid) => ({
    name: raid.name,
    bosses: raid.bosses.map((boss) => ({
      name: boss,
      killCount: 0,
      killers: [],
      progressed: false,
      requiredKills: 0,
    })),
    progressedBossCount: 0,
    missingBossCount: 0,
  }))
}

function getMemberRankings(memberResult) {
  if (Array.isArray(memberResult?.rankings)) return memberResult.rankings
  if (Array.isArray(memberResult?.rankingsHeroic?.rankings)) return memberResult.rankingsHeroic.rankings
  return []
}

export function summarizeMidnightHeroicProgress({
  memberResults = [],
  mainCount = 0,
  zoneId = MIDNIGHT_TIER_ZONE_ID,
  zoneName = MIDNIGHT_TIER_ZONE_NAME,
} = {}) {
  const killThreshold = mainCount > 0 ? Math.ceil(mainCount * 0.5) : 0
  const raids = createRaidMap()
  const bossByName = new Map()

  for (const raid of raids) {
    for (const boss of raid.bosses) {
      bossByName.set(normalizeKey(boss.name), { raidName: raid.name, boss })
    }
  }

  for (const memberResult of memberResults) {
    const memberName = normalizeText(memberResult?.name)
    if (!memberName) continue

    const seenBosses = new Set()

    for (const ranking of getMemberRankings(memberResult)) {
      if ((ranking?.totalKills ?? 0) <= 0) continue

      const bossName = normalizeText(ranking?.encounter?.name ?? ranking?.name)
      if (!bossName) continue

      const bossKey = normalizeKey(bossName)
      if (seenBosses.has(bossKey)) continue

      const match = bossByName.get(bossKey)
      if (!match) continue

      seenBosses.add(bossKey)
      match.boss.killCount += 1
      match.boss.killers.push(memberName)
    }
  }

  let progressedBossCount = 0
  let missingBossCount = 0

  for (const raid of raids) {
    let raidProgressed = 0

    for (const boss of raid.bosses) {
      boss.requiredKills = killThreshold
      boss.progressed = mainCount > 0 && boss.killCount >= killThreshold
      if (boss.progressed) {
        raidProgressed += 1
        progressedBossCount += 1
      } else {
        missingBossCount += 1
      }
    }

    raid.progressedBossCount = raidProgressed
    raid.missingBossCount = raid.bosses.length - raidProgressed
  }

  return {
    zoneId,
    zoneName,
    bossCount: raids.reduce((sum, raid) => sum + raid.bosses.length, 0),
    mainCount,
    killThreshold,
    progressedBossCount,
    missingBossCount,
    raids,
  }
}
