import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyDroptimizerFailure,
  compareQueuedCharacters,
  getRetryDelayMs,
} from '../api/_droptimizer-automation.js'

test('queue ordering prefers mains, then alphabetical name', () => {
  const runs = [
    { character_name: 'Mufuzu', is_main: true },
    { character_name: 'chenex', is_main: false },
    { character_name: 'Whooplol', is_main: true },
    { character_name: 'Hilfa', is_main: true },
  ]

  const ordered = [...runs].sort(compareQueuedCharacters)

  assert.deepEqual(
    ordered.map((row) => row.character_name),
    ['Hilfa', 'Mufuzu', 'Whooplol', 'chenex'],
  )
})

test('classifyDroptimizerFailure treats 429 as transient and payload errors as permanent', () => {
  const transient = classifyDroptimizerFailure('Raidbots Droptimizer submit failed (429): Too Many Requests')
  const permanent = classifyDroptimizerFailure('Raidbots Droptimizer submit failed (400): {"error":"droptimizer_no_actors"}')
  const localPayloadIssue = classifyDroptimizerFailure('Droptimizer payload is missing droptimizerItems')

  assert.equal(transient.kind, 'transient')
  assert.equal(permanent.kind, 'permanent')
  assert.equal(permanent.errorCode, 'droptimizer_no_actors')
  assert.equal(localPayloadIssue.kind, 'permanent')
})

test('retry delay schedule is one hour, then two hours, then exhausted', () => {
  assert.equal(getRetryDelayMs(1), 60 * 60 * 1000)
  assert.equal(getRetryDelayMs(2), 2 * 60 * 60 * 1000)
  assert.equal(getRetryDelayMs(3), null)
})
