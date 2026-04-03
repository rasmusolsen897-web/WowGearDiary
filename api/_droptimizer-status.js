import { compareQueuedCharacters, RUN_STATUSES } from './_droptimizer-automation.js'

function normalizedName(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function buildCharacterLookup(characters = []) {
  return new Map(
    (Array.isArray(characters) ? characters : [])
      .filter((character) => character?.name)
      .map((character) => [normalizedName(character.name), character]),
  )
}

export function enrichQueueRun(run, charactersByName = new Map()) {
  const member = charactersByName.get(normalizedName(run?.character_name)) ?? null
  return {
    ...run,
    is_main: member?.is_main ?? true,
    realm: member?.realm ?? '',
  }
}

export function isQueueRunEligible(run, now = Date.now()) {
  if (!run?.next_retry_at) return true
  const retryAt = Date.parse(run.next_retry_at)
  return Number.isNaN(retryAt) || retryAt <= now
}

function countStatuses(runs = []) {
  return {
    queued: runs.filter((run) => run.status === RUN_STATUSES.queued).length,
    retryable: runs.filter((run) => run.status === RUN_STATUSES.retryable).length,
    running: runs.filter((run) => run.status === RUN_STATUSES.running).length,
    completed: runs.filter((run) => run.status === RUN_STATUSES.completed).length,
    failed: runs.filter((run) => run.status === RUN_STATUSES.failed).length,
  }
}

export function summarizeAutomationQueue({
  runs = [],
  characters = [],
  now = Date.now(),
  queuePreviewLimit = 3,
} = {}) {
  const charactersByName = buildCharacterLookup(characters)
  const queueRuns = (Array.isArray(runs) ? runs : [])
    .filter((run) => run.status === RUN_STATUSES.queued || run.status === RUN_STATUSES.retryable)
    .map((run) => enrichQueueRun(run, charactersByName))
    .sort(compareQueuedCharacters)

  const runningRuns = (Array.isArray(runs) ? runs : [])
    .filter((run) => run.status === RUN_STATUSES.running)
    .map((run) => enrichQueueRun(run, charactersByName))
    .sort((left, right) => Date.parse(right.started_at ?? 0) - Date.parse(left.started_at ?? 0))

  return {
    counts: countStatuses(runs),
    inferredActiveRun: runningRuns[0] ?? null,
    queueHeadRun: queueRuns[0] ?? null,
    nextRunnableRun: queueRuns.find((run) => isQueueRunEligible(run, now)) ?? null,
    queuePreview: queueRuns.slice(0, queuePreviewLimit),
  }
}
