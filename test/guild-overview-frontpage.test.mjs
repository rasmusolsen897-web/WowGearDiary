import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const guildOverviewSource = readFileSync(new URL('../src/components/GuildOverview.jsx', import.meta.url), 'utf8')

test('guild overview keeps the progression history graph on the front page', () => {
  assert.match(
    guildOverviewSource,
    /useHeroicProgress/,
  )
  assert.match(
    guildOverviewSource,
    /import ProgressionCharts from '\.\/ProgressionCharts\.jsx'/,
  )
  assert.match(
    guildOverviewSource,
    /<HeroicProgressPanel/,
  )
  assert.match(guildOverviewSource, /<ProgressionCharts characterName=\{[^}]+\} title="Progression" \/>/)
  assert.doesNotMatch(guildOverviewSource, /className="filter-select"/)
  assert.doesNotMatch(guildOverviewSource, /Main Character Snapshot/)
})
