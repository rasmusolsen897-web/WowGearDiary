import assert from 'node:assert/strict'
import test from 'node:test'
import { RUN_STATUSES } from '../api/_droptimizer-automation.js'
import { isQueueRunEligible, summarizeAutomationQueue } from '../api/_droptimizer-status.js'

test('queue summary still exposes the first ready main character', () => {
  const summary = summarizeAutomationQueue({
    now: Date.parse('2026-04-03T20:30:00Z'),
    characters: [
      { name: 'Whooplol', is_main: true },
      { name: 'Hilfa', is_main: true },
      { name: 'Chenex', is_main: false },
    ],
    runs: [
      {
        id: 'run-whooplol',
        character_name: 'Whooplol',
        status: RUN_STATUSES.retryable,
        next_retry_at: '2026-04-03T21:00:00Z',
      },
      {
        id: 'run-hilfa',
        character_name: 'Hilfa',
        status: RUN_STATUSES.queued,
        next_retry_at: null,
      },
      {
        id: 'run-chenex',
        character_name: 'Chenex',
        status: RUN_STATUSES.queued,
        next_retry_at: null,
      },
    ],
  })

  assert.equal(summary.queueHeadRun.character_name, 'Hilfa')
  assert.equal(summary.nextRunnableRun.character_name, 'Hilfa')
  assert.deepEqual(
    summary.queuePreview.map((run) => run.character_name),
    ['Hilfa', 'Whooplol', 'Chenex'],
  )
})

test('queue summary counts statuses and infers the latest running run', () => {
  const summary = summarizeAutomationQueue({
    characters: [{ name: 'Mufuzu', is_main: true }],
    runs: [
      {
        id: 'failed-run',
        character_name: 'Mufuzu',
        status: RUN_STATUSES.failed,
        started_at: '2026-04-03T18:00:00Z',
      },
      {
        id: 'running-old',
        character_name: 'Mufuzu',
        status: RUN_STATUSES.running,
        started_at: '2026-04-03T19:00:00Z',
      },
      {
        id: 'running-new',
        character_name: 'Mufuzu',
        status: RUN_STATUSES.running,
        started_at: '2026-04-03T20:00:00Z',
      },
      {
        id: 'completed-run',
        character_name: 'Mufuzu',
        status: RUN_STATUSES.completed,
        started_at: '2026-04-03T17:00:00Z',
      },
    ],
  })

  assert.deepEqual(summary.counts, {
    queued: 0,
    retryable: 0,
    running: 2,
    completed: 1,
    failed: 1,
  })
  assert.equal(summary.inferredActiveRun.id, 'running-new')
})

test('isQueueRunEligible treats missing or past retry timestamps as ready', () => {
  const now = Date.parse('2026-04-03T20:30:00Z')

  assert.equal(isQueueRunEligible({ next_retry_at: null }, now), true)
  assert.equal(isQueueRunEligible({ next_retry_at: '2026-04-03T20:00:00Z' }, now), true)
  assert.equal(isQueueRunEligible({ next_retry_at: '2026-04-03T21:00:00Z' }, now), false)
})
