import { dateKeyInTimeZone } from './_droptimizer-store.js'

export const AUTOMATED_DROPTIMIZER_SCENARIO = 'raid_heroic'

export const RUN_STATUSES = {
  queued: 'queued',
  retryable: 'retryable',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
}

export const LOCK_TTL_MS = 10 * 60 * 1000
export const RUN_STALE_MS = 2 * 60 * 60 * 1000
export const RETRY_DELAYS_MS = [60 * 60 * 1000, 2 * 60 * 60 * 1000]

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const PERMANENT_RAIDBOTS_ERRORS = new Set([
  'droptimizer_no_actors',
  'droptimizer_no_instance_selected',
  'unsupported_spec',
])

export function todayDateString(date = new Date()) {
  return dateKeyInTimeZone(date)
}

export function isTerminalRunStatus(status) {
  return status === RUN_STATUSES.completed || status === RUN_STATUSES.failed
}

export function extractRaidbotsHttpStatus(message) {
  const match = String(message ?? '').match(/\((\d{3})\):/)
  return match ? Number.parseInt(match[1], 10) : null
}

export function extractRaidbotsErrorCode(message) {
  const match = String(message ?? '').match(/"error":"([^"]+)"/i)
  return match ? match[1] : null
}

export function classifyDroptimizerFailure(error) {
  const message = String(error?.message ?? error ?? '').trim() || 'Unknown Droptimizer error'
  const httpStatus = extractRaidbotsHttpStatus(message)
  const errorCode = extractRaidbotsErrorCode(message)

  if (/missing droptimizerItems|missing a character actor/i.test(message)) {
    return { kind: 'permanent', httpStatus, errorCode, message }
  }

  if (errorCode && PERMANENT_RAIDBOTS_ERRORS.has(errorCode)) {
    return { kind: 'permanent', httpStatus, errorCode, message }
  }

  if (httpStatus && TRANSIENT_HTTP_STATUSES.has(httpStatus)) {
    return { kind: 'transient', httpStatus, errorCode, message }
  }

  if (httpStatus && httpStatus >= 400) {
    return { kind: 'permanent', httpStatus, errorCode, message }
  }

  if (/report not found/i.test(message)) {
    return { kind: 'transient', httpStatus, errorCode, message }
  }

  if (/timed out|timeout|network|fetch failed|socket|econnreset|enotfound|temporar/i.test(message)) {
    return { kind: 'transient', httpStatus, errorCode, message }
  }

  return { kind: 'transient', httpStatus, errorCode, message }
}

export function getRetryDelayMs(attemptCount) {
  return RETRY_DELAYS_MS[attemptCount - 1] ?? null
}

export function compareQueuedCharacters(left, right) {
  const leftName = String(left?.character_name ?? left?.name ?? '').trim()
  const rightName = String(right?.character_name ?? right?.name ?? '').trim()

  const leftMain = left?.is_main === false ? 1 : 0
  const rightMain = right?.is_main === false ? 1 : 0
  if (leftMain !== rightMain) return leftMain - rightMain

  return leftName.localeCompare(rightName, 'en', { sensitivity: 'base' })
}
