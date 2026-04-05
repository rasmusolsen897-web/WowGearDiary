const DIFFICULTY_ORDER = [
  { key: 'rankingsMythic', short: 'M', label: 'Mythic' },
  { key: 'rankingsHeroic', short: 'H', label: 'Heroic' },
  { key: 'rankingsNormal', short: 'N', label: 'Normal' },
]

export function normalizeWclServerSlug(realm = '') {
  return String(realm)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/'/g, '')
}

function populatedRankings(bucket) {
  return (bucket?.rankings ?? []).filter((row) => (row.totalKills ?? 0) > 0)
}

export function selectWclDifficulty(wclData) {
  if (!wclData) return null

  for (const difficulty of DIFFICULTY_ORDER) {
    const bucket = wclData[difficulty.key]
    const rankings = populatedRankings(bucket)
    if (rankings.length) {
      return {
        ...difficulty,
        zoneName: bucket?.zone?.name ?? null,
        rankings,
      }
    }
  }

  return null
}

export function getBestWclParse(wclData) {
  const selection = selectWclDifficulty(wclData)
  if (!selection) return null

  const best = selection.rankings.reduce((currentBest, row) => (
    (row.rankPercent ?? 0) > (currentBest.rankPercent ?? 0) ? row : currentBest
  ), selection.rankings[0])

  return {
    pct: Math.round(best.rankPercent ?? 0),
    diff: selection.short,
  }
}

export function getAverageWclParse(wclData) {
  const selection = selectWclDifficulty(wclData)
  if (!selection) return null

  const avg = selection.rankings.reduce((sum, row) => sum + (row.rankPercent ?? 0), 0) / selection.rankings.length

  return {
    pct: Math.round(avg),
    diff: selection.short,
    diffLabel: selection.label,
    bossCount: selection.rankings.length,
    zoneName: selection.zoneName,
    rankings: selection.rankings,
  }
}
