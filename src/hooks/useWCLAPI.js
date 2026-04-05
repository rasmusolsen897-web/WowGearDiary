import { useState, useEffect, useRef } from 'react'
import { normalizeWclServerSlug } from '../utils/wclRankings.js'

const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

/**
 * Returns the Unix timestamp of the most recent EU weekly reset:
 * every Tuesday at 09:00 UTC.
 */
function lastEUResetTs() {
  const d = new Date()
  d.setUTCHours(9, 0, 0, 0)
  // getUTCDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  let daysSinceTue = (d.getUTCDay() - 2 + 7) % 7
  // If today IS Tuesday but we haven't hit 09:00 UTC yet, use last week's reset
  if (daysSinceTue === 0 && Date.now() < d.getTime()) daysSinceTue = 7
  d.setUTCDate(d.getUTCDate() - daysSinceTue)
  return d.getTime()
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    if (ts < lastEUResetTs()) return null   // stale from before weekly reset
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
 * useWCLAPI(query, variables, cacheId)
 *
 * POSTs to /api/wcl with a GraphQL query + variables.
 * Caches result in localStorage keyed by cacheId for 30 minutes.
 * Returns { data, loading, error, refresh }.
 *
 * Pass null/undefined for query to skip the request entirely.
 */
export function useWCLAPI(query, variables = {}, cacheId = null) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [tick, setTick]           = useState(0)
  const [fetchedAt, setFetchedAt] = useState(null)

  const variablesRef = useRef(variables)
  variablesRef.current = variables

  useEffect(() => {
    if (!query) return

    const key = cacheId ? `wcl:${cacheId}` : `wcl:${btoa(query).slice(0, 40)}`
    const cached = readCache(key)
    if (cached) {
      setData(cached.data)
      setFetchedAt(cached.ts)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/wcl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: variablesRef.current }),
    })
      .then(async (res) => {
        if (res.status === 404) throw new Error('API not available')
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) throw new Error('API not available')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        // WCL returns { data: { ... }, errors: [...] }
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join('; '))
        }
        writeCache(key, json)
        setData(json)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cacheId, tick])

  const refresh = () => {
    if (cacheId) {
      try { localStorage.removeItem(`wcl:${cacheId}`) } catch {}
    }
    setTick((t) => t + 1)
  }

  return { data, loading, error, refresh, fetchedAt }
}

// ── Convenience: character parses for recent tier ────────────────────────────

const CHARACTER_RANKINGS_QUERY = /* GraphQL */ `
  query CharacterRankings($name: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int) {
    characterData {
      character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
        name
        classID
        rankingsNormal: zoneRankings(zoneID: $zoneID, difficulty: 4)
        rankingsHeroic: zoneRankings(zoneID: $zoneID, difficulty: 5)
        rankingsMythic: zoneRankings(zoneID: $zoneID, difficulty: 6)
      }
    }
  }
`

/**
 * useCharacterParses(name, realm, region, zoneID)
 *
 * Convenience wrapper that fetches character rankings from WCL.
 * zoneID defaults to null — WCL auto-selects the character's most recent tier.
 * Returns { data: { character }, loading, error, refresh }.
 */
export function useCharacterParses(name, realm, region = 'eu', zoneID = null) {
  const normalizedRealm = normalizeWclServerSlug(realm)
  const normalizedRegion = String(region ?? 'eu').trim().toLowerCase()
  const variables = { name, serverSlug: normalizedRealm, serverRegion: normalizedRegion, zoneID }
  const cacheId   = `parses:${normalizedRegion}:${normalizedRealm}:${name}:${zoneID ?? 'auto'}`.toLowerCase()

  const { data, loading, error, refresh, fetchedAt } = useWCLAPI(
    name && normalizedRealm ? CHARACTER_RANKINGS_QUERY : null,
    variables,
    cacheId,
  )

  return {
    data: data?.data?.characterData?.character ?? null,
    loading,
    error,
    refresh,
    fetchedAt,
  }
}
