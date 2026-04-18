import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const guildOverviewSource = readFileSync(new URL('../src/components/GuildOverview.jsx', import.meta.url), 'utf8')

test('guild overview is driven by the guild dashboard summary payload', () => {
  assert.match(guildOverviewSource, /\/api\/guild-dashboard/)
  assert.match(guildOverviewSource, /collapsible roster/i)
  assert.match(guildOverviewSource, /parseTrend/)
  assert.match(guildOverviewSource, /leaderboard/)
  assert.match(guildOverviewSource, /attendance/)
  assert.match(guildOverviewSource, /loot/)
  assert.match(guildOverviewSource, /roster/)
  assert.doesNotMatch(guildOverviewSource, /useBlizzardRaids/)
  assert.doesNotMatch(guildOverviewSource, /ProgressionCharts/)
  assert.doesNotMatch(guildOverviewSource, /onSelectMember/)
  assert.doesNotMatch(guildOverviewSource, /CharacterView/)
})
