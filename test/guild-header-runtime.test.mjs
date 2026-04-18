import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const headerSource = readFileSync(new URL('../src/components/GuildHeader.jsx', import.meta.url), 'utf8')

test('guild header stays a lightweight shell with settings access', () => {
  assert.match(headerSource, /Settings/)
  assert.match(headerSource, /Guild Dashboard/)
  assert.doesNotMatch(headerSource, /CharacterView/)
  assert.doesNotMatch(headerSource, /progression history graph/i)
})
