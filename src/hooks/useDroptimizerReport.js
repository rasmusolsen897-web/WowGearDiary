/**
 * useDroptimizerReport.js
 *
 * React hook for ingesting Raidbots Droptimizer reports.
 * Mirrors the useRaidbotsReport pattern: proxy fetch -> localStorage cache -> return state.
 *
 * The /api/raidbots-report proxy detects droptimizer reports and returns the
 * compact normalized shape (type, upgrades[], baseDps, spec, difficulty) instead
 * of the raw 500-800 KB data.json.
 */

import { useState, useEffect } from 'react'

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function reportIdFromUrl(input) {
  if (!input) return null
  const match = input.match(/report\/([A-Za-z0-9]+)/)
  return match ? match[1] : input.trim() || null
}

function cacheKey(reportId) {
  return `droptimizer-report:${reportId}`
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(key)
      return null
    }
    return { data, ts }
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function useDroptimizerReport(reportUrl) {
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const reportId = reportIdFromUrl(reportUrl)

  useEffect(() => {
    if (!reportId) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    const key = cacheKey(reportId)
    const cached = readCache(key)
    if (cached) {
      setResult(cached.data)
      setFetchedAt(cached.ts)
      setLoading(false)
      setError(null)
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
        if (json?.type !== 'droptimizer') {
          throw new Error('This URL is not a Droptimizer report')
        }

        const data = {
          upgrades: json.upgrades ?? [],
          baseDps: json.baseDps ?? 0,
          characterName: json.characterName ?? null,
          spec: json.spec ?? null,
          difficulty: json.difficulty ?? null,
        }

        writeCache(key, data)
        setResult(data)
        setFetchedAt(Date.now())
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [reportId])

  return {
    upgrades: result?.upgrades ?? null,
    baseDps: result?.baseDps ?? 0,
    characterName: result?.characterName ?? null,
    spec: result?.spec ?? null,
    difficulty: result?.difficulty ?? null,
    reportId,
    loading,
    error,
    fetchedAt,
  }
}
