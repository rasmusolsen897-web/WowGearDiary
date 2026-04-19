import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const guildOverviewSource = readFileSync(new URL('../src/components/GuildOverview.jsx', import.meta.url), 'utf8')

test('guild overview is driven by the guild dashboard summary payload', () => {
  assert.match(guildOverviewSource, /\/api\/guild-dashboard/)
  assert.match(guildOverviewSource, /Heroic Midnight/i)
  assert.match(guildOverviewSource, /Log leaderboard/i)
  assert.match(guildOverviewSource, /Attendance/i)
  assert.match(guildOverviewSource, /Tweaks/i)
  assert.match(guildOverviewSource, /parseTrend/)
  assert.match(guildOverviewSource, /leaderboard/)
  assert.match(guildOverviewSource, /attendance/)
  assert.match(guildOverviewSource, /rolecolors/i)
  assert.match(guildOverviewSource, /density/i)
  assert.match(guildOverviewSource, /intensity|aesthetic/i)
  assert.doesNotMatch(guildOverviewSource, /collapsible roster/i)
  assert.doesNotMatch(guildOverviewSource, /Loot tracker/i)
  assert.doesNotMatch(guildOverviewSource, /useBlizzardRaids/)
  assert.doesNotMatch(guildOverviewSource, /ProgressionCharts/)
  assert.doesNotMatch(guildOverviewSource, /onSelectMember/)
  assert.doesNotMatch(guildOverviewSource, /CharacterView/)
})
