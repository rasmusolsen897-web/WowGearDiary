import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('app renders the guild dashboard shell without character drill-down', () => {
  assert.match(appSource, /import GuildOverview from '\.\/components\/GuildOverview\.jsx'/)
  assert.match(appSource, /import GuildHeader from '\.\/components\/GuildHeader\.jsx'/)
  assert.match(appSource, /<GuildOverview/)
  assert.doesNotMatch(appSource, /CharacterView/)
  assert.doesNotMatch(appSource, /selectedMember/)
  assert.doesNotMatch(appSource, /onSelectMember/)
})
