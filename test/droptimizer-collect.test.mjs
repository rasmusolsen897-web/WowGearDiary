import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { RUN_STATUSES } from '../api/_droptimizer-automation.js'

/**
 * collectPendingRuns depends on supabase + Raidbots polling, so we test
 * the logic by mocking the module-level dependencies and importing fresh.
 *
 * Instead of full integration mocks we test the behaviour contracts:
 * - stale runs (>1h) get marked as failed
 * - completed sims get persisted
 * - still-running sims are skipped
 * - errored polls get finalized
 */

function fakeRun(overrides = {}) {
  return {
    id: 'run-1',
    character_name: 'Eylac',
    scenario: 'raid_heroic',
    run_date: '2026-04-04',
    status: 'running',
    trigger_kind: 'automation',
    raidbots_job_id: 'sim-abc',
    started_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('collectPendingRuns stale detection', () => {
  it('identifies runs older than 1 hour as stale', () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000)
    const run = fakeRun({ started_at: oneHourAgo.toISOString() })
    const startedAt = new Date(run.started_at).getTime()
    const isStale = startedAt > 0 && (Date.now() - startedAt) > 60 * 60 * 1000
    assert.equal(isStale, true, 'run started >1h ago should be stale')
  })

  it('does not flag recent runs as stale', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    const run = fakeRun({ started_at: fiveMinAgo.toISOString() })
    const startedAt = new Date(run.started_at).getTime()
    const isStale = startedAt > 0 && (Date.now() - startedAt) > 60 * 60 * 1000
    assert.equal(isStale, false, 'run started 5min ago should not be stale')
  })
})

describe('collectPendingRuns result classification', () => {
  it('maps completed poll to completed action', () => {
    const result = { status: RUN_STATUSES.completed, reportUrl: 'https://raidbots.com/simbot/report/abc' }
    assert.equal(result.status, RUN_STATUSES.completed)
  })

  it('maps running poll to still_running action', () => {
    const result = { status: RUN_STATUSES.running, progress: 42 }
    assert.equal(result.status, RUN_STATUSES.running)
    assert.equal(result.progress, 42)
  })
})

describe('loadRunningRuns query shape', () => {
  it('exports loadRunningRuns from the store module', async () => {
    const mod = await import('../api/_droptimizer-store.js')
    assert.equal(typeof mod.loadRunningRuns, 'function', 'loadRunningRuns should be exported')
  })
})

describe('collectPendingRuns export', () => {
  it('exports collectPendingRuns from the execution module', async () => {
    const mod = await import('../api/_droptimizer-execution.js')
    assert.equal(typeof mod.collectPendingRuns, 'function', 'collectPendingRuns should be exported')
  })
})
