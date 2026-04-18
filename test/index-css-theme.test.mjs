import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('global styling switches to parchment and ink tokens', () => {
  assert.match(cssSource, /--parchment/)
  assert.match(cssSource, /--ink/)
  assert.match(cssSource, /--wax/)
  assert.match(cssSource, /background:\s*radial-gradient/i)
  assert.match(cssSource, /font-family:/i)
  assert.doesNotMatch(cssSource, /font-family:\s*'Inter'/i)
})
