import assert from 'node:assert/strict'
import test from 'node:test'
import { getAverageWclParse, getBestWclParse, selectWclDifficulty } from '../src/utils/wclRankings.js'

function buildWclData({ mythic = [], heroic = [], normal = [], zoneName = 'Manaforge Omega' } = {}) {
  return {
    rankingsMythic: { zone: { name: zoneName }, rankings: mythic },
    rankingsHeroic: { zone: { name: zoneName }, rankings: heroic },
    rankingsNormal: { zone: { name: zoneName }, rankings: normal },
  }
}

function ranking(rankPercent, totalKills = 1, encounterName = 'Boss') {
  return {
    rankPercent,
    totalKills,
    encounter: { id: encounterName, name: encounterName },
  }
}

test('selectWclDifficulty prefers populated mythic rankings', () => {
  const data = buildWclData({
    mythic: [ranking(82, 2, 'Dimensius')],
    heroic: [ranking(95, 4, 'Loomithar')],
    normal: [ranking(99, 6, 'Plexus Sentinel')],
  })

  const selection = selectWclDifficulty(data)

  assert.equal(selection?.short, 'M')
  assert.equal(selection?.label, 'Mythic')
  assert.equal(selection?.rankings.length, 1)
  assert.equal(selection?.rankings[0].encounter.name, 'Dimensius')
})

test('getAverageWclParse falls back to heroic when mythic is empty', () => {
  const data = buildWclData({
    heroic: [ranking(70, 3, 'Boss One'), ranking(90, 2, 'Boss Two')],
    normal: [ranking(99, 5, 'Boss Three')],
  })

  const summary = getAverageWclParse(data)

  assert.deepEqual(summary, {
    pct: 80,
    diff: 'H',
    diffLabel: 'Heroic',
    bossCount: 2,
    zoneName: 'Manaforge Omega',
    rankings: data.rankingsHeroic.rankings,
  })
})

test('getAverageWclParse falls back to normal when heroic and mythic are empty', () => {
  const data = buildWclData({
    normal: [ranking(44, 1, 'Boss One'), ranking(56, 1, 'Boss Two')],
  })

  const summary = getAverageWclParse(data)

  assert.equal(summary?.pct, 50)
  assert.equal(summary?.diff, 'N')
  assert.equal(summary?.diffLabel, 'Normal')
  assert.equal(summary?.bossCount, 2)
})

test('WCL helpers ignore zero-kill rows and return null when no populated difficulties remain', () => {
  const data = buildWclData({
    mythic: [ranking(99, 0, 'Boss One')],
    heroic: [ranking(80, 0, 'Boss Two')],
    normal: [ranking(60, 0, 'Boss Three')],
  })

  assert.equal(selectWclDifficulty(data), null)
  assert.equal(getAverageWclParse(data), null)
  assert.equal(getBestWclParse(data), null)
})

test('whooplol regression: mythic-only logs still produce visible parse summaries', () => {
  const data = buildWclData({
    mythic: [ranking(68, 5, 'Plexus Sentinel'), ranking(74, 3, 'Loomithar')],
  })

  const average = getAverageWclParse(data)
  const best = getBestWclParse(data)

  assert.equal(average?.pct, 71)
  assert.equal(average?.diff, 'M')
  assert.equal(average?.diffLabel, 'Mythic')
  assert.equal(average?.bossCount, 2)
  assert.deepEqual(best, { pct: 74, diff: 'M' })
})
