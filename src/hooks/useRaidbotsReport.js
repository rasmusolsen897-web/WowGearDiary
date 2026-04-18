import { useState, useEffect } from 'react'
import { buildCharacterStorageKey } from '../utils/characterIdentity.js'

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function reportIdFromUrl(input) {
  if (!input) return null
  // Accept full URL or bare ID
  const match = input.match(/report\/([A-Za-z0-9]+)/)
  return match ? match[1] : input.trim()
}

function cacheKey(reportId) {
  return `raidbots-report:${reportId}`
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return { data, ts }
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

/**
 * useRaidbotsReport(reportUrl)
 *
 * Fetches DPS and metadata from a public Raidbots report.
 * Report URL format: https://www.raidbots.com/simbot/report/{id}
 * Data fetched from:  https://www.raidbots.com/simbot/report/{id}/data.json
 *
 * Returns { dps, characterName, spec, reportId, loading, error }
 */
export function useRaidbotsReport(reportUrl) {
  const [result, setResult]       = useState({ dps: null, characterName: null, spec: null })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const reportId = reportIdFromUrl(reportUrl)

  useEffect(() => {
    if (!reportId) {
      setResult({ dps: null, characterName: null, spec: null })
      setError(null)
      return
    }

    const key = cacheKey(reportId)
    const cached = readCache(key)
    if (cached) {
      setResult(cached.data)
      setFetchedAt(cached.ts)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/raidbots-report?id=${reportId}`)
      .then(async (res) => {
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) throw new Error('API not available')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Report not found (${res.status})`)
        }
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        const player = json?.sim?.players?.[0]
        const meanDps = Math.round(player?.collected_data?.dps?.mean ?? 0)
        const name    = player?.name ?? null
        // simbot wrapper removed from Raidbots data.json ~2025; spec no longer available
        const specStr = null

        const data = { dps: meanDps, characterName: name, spec: specStr }
        writeCache(key, data)
        setResult(data)
        setFetchedAt(Date.now())
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [reportId])

  return { ...result, reportId, loading, error, fetchedAt }
}

/**
 * Helpers for persisting report URLs per member in localStorage.
 */
export function getStoredReportUrl(memberKey) {
  try { return localStorage.getItem(`raidbots-url:${memberKey}`) ?? '' } catch { return '' }
}

export function setStoredReportUrl(memberKey, url) {
  try {
    if (url) localStorage.setItem(`raidbots-url:${memberKey}`, url)
    else localStorage.removeItem(`raidbots-url:${memberKey}`)
  } catch {}
}

export function buildRaidbotsMemberKey(region, realm, name) {
  return buildCharacterStorageKey(region, realm, name)
}
