import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parseDroptimizerReport } from '../api/_droptimizer.js'

async function readFixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

test('heroic fixture produces boss-grouped upgrades', async () => {
  const csv = await readFixture('droptimizer-heroic.csv')
  const json = JSON.parse(await readFixture('droptimizer-heroic.json'))
  const report = parseDroptimizerReport(csv, json)

  assert.equal(report.type, 'droptimizer')
  assert.equal(report.difficulty, 'raid-heroic')
  assert.equal(report.upgrades[0].sourceType, 'raid_boss')
  assert.equal(report.upgrades[0].sourceName, 'Chimaerus the Undreamt God')
  assert.equal(report.upgrades[0].itemName, 'Ring of the Dreamer')
})

test('mythic plus fixture produces dungeon-grouped upgrades', async () => {
  const csv = await readFixture('droptimizer-mplus.csv')
  const json = JSON.parse(await readFixture('droptimizer-mplus.json'))
  const report = parseDroptimizerReport(csv, json)

  assert.equal(report.type, 'droptimizer')
  assert.equal(report.upgrades[0].sourceType, 'mythic_plus_dungeon')
  assert.equal(report.upgrades[0].sourceName, 'Pit of Saron')
  assert.equal(report.upgrades[0].itemName, 'Clasp of the Broken Path')
})

test('missing lookup fixture falls back without crashing', async () => {
  const csv = await readFixture('droptimizer-missing-lookup.csv')
  const json = JSON.parse(await readFixture('droptimizer-missing-lookup.json'))
  const report = parseDroptimizerReport(csv, json)

  assert.equal(report.upgrades.length, 1)
  assert.equal(report.upgrades[0].itemName, 'Mystery Helm')
  assert.equal(report.upgrades[0].sourceName, 'Boss #888')
})
