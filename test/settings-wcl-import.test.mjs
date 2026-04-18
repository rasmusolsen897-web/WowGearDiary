import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const settingsSource = readFileSync(new URL('../src/components/Settings.jsx', import.meta.url), 'utf8')

test('settings exposes a WCL import admin surface alongside existing guild editing', () => {
  assert.match(settingsSource, /WCL Imports/i)
  assert.match(settingsSource, /\/api\/wcl-imports/)
  assert.match(settingsSource, /report URL\/code/i)
  assert.match(settingsSource, /Reimport/i)
  assert.match(settingsSource, /Characters/i)
  assert.match(settingsSource, /Identity/i)
  assert.match(settingsSource, /Guild/i)
})
