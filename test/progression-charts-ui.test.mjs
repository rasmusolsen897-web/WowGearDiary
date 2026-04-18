import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const progressionChartsSource = readFileSync(new URL('../src/components/ProgressionCharts.jsx', import.meta.url), 'utf8')

test('progression charts uses a toggle-based metric switch with chart axes', () => {
  assert.match(progressionChartsSource, /role="tablist"/)
  assert.match(progressionChartsSource, /aria-label="Progression metric"/)
  assert.match(progressionChartsSource, /iLvl/)
  assert.match(progressionChartsSource, /Sim DPS/)
  assert.match(progressionChartsSource, /history-chart-shell/)
  assert.match(progressionChartsSource, /history-axis-label/)
  assert.match(progressionChartsSource, /history-empty-state/)
  assert.match(progressionChartsSource, /onePointMessage/)
  assert.doesNotMatch(progressionChartsSource, /wcl-expand-btn/)
  assert.doesNotMatch(progressionChartsSource, /setIlvlOpen|setSimOpen/)
})
