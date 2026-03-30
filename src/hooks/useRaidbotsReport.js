import { useState, useEffect } from 'react'

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
    return data
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
  const [dps, setDps]                   = useState(null)
  const [characterName, setCharacterName] = useState(null)
  const [spec, setSpec]                 = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)

  const reportId = reportIdFromUrl(reportUrl)

  useEffect(() => {
    if (!reportId) {
      setDps(null); setCharacterName(null); setSpec(null); setError(null)
      return
    }

    const key = cacheKey(reportId)
    const cached = readCache(key)
    if (cached) {
      setDps(cached.dps)
      setCharacterName(cached.characterName)
      setSpec(cached.spec)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`https://www.raidbots.com/simbot/report/${reportId}/data.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Report not found (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        const player = json?.sim?.players?.[0]
        const meanDps = Math.round(player?.collected_data?.dps?.mean ?? 0)
        const name    = player?.name ?? null
        const specStr = json?.simbot?.meta?.specName ?? null

        const result = { dps: meanDps, characterName: name, spec: specStr }
        writeCache(key, result)
        setDps(meanDps)
        setCharacterName(name)
        setSpec(specStr)
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

  return { dps, characterName, spec, reportId, loading, error }
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
