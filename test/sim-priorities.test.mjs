import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPriorityGroups, buildScenarioResponse } from '../api/_droptimizer.js'

test('priority groups sort by best drop per source', () => {
  const groups = buildPriorityGroups([
    { itemId: 1, itemName: 'A', slot: 'Head', dpsDelta: 500, dpsPct: 1.2, sourceType: 'raid_boss', sourceId: '1', sourceName: 'Boss One' },
    { itemId: 2, itemName: 'B', slot: 'Chest', dpsDelta: 200, dpsPct: 0.5, sourceType: 'raid_boss', sourceId: '2', sourceName: 'Boss Two' },
    { itemId: 3, itemName: 'C', slot: 'Hands', dpsDelta: 300, dpsPct: 0.8, sourceType: 'raid_boss', sourceId: '1', sourceName: 'Boss One' }
  ], 'raid_heroic')

  assert.equal(groups[0].sourceName, 'Boss One')
  assert.equal(groups[0].topItems.length, 2)
})

test('scenario response keeps latest completed data with failed latest status', () => {
  const response = buildScenarioResponse(
    'raid_heroic',
    { status: 'failed', error_message: 'Timed out' },
    { completed_at: '2026-04-03T04:00:00.000Z', base_dps: 123456, report_url: 'https://example.test/report', difficulty: 'raid-heroic' },
    [{ item_id: 1, item_name: 'Dream Helm', slot: 'head', item_level: 278, dps_delta: 500, dps_pct: 0.4, source_type: 'raid_boss', source_id: '2740', source_name: 'Boss One' }]
  )

  assert.equal(response.status, 'failed')
  assert.equal(response.lastError, 'Timed out')
  assert.equal(response.upgrades[0].itemName, 'Dream Helm')
  assert.equal(response.priorities[0].sourceName, 'Boss One')
})
