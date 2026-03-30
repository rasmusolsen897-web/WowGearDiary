import { useState, useEffect, useRef } from 'react'

const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

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
 * useWCLAPI(query, variables, cacheId)
 *
 * POSTs to /api/wcl with a GraphQL query + variables.
 * Caches result in localStorage keyed by cacheId for 30 minutes.
 * Returns { data, loading, error, refresh }.
 *
 * Pass null/undefined for query to skip the request entirely.
 */
export function useWCLAPI(query, variables = {}, cacheId = null) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [tick, setTick]       = useState(0)

  const variablesRef = useRef(variables)
  variablesRef.current = variables

  useEffect(() => {
    if (!query) return

    const key = cacheId ? `wcl:${cacheId}` : `wcl:${btoa(query).slice(0, 40)}`
    const cached = readCache(key)
    if (cached) {
      setData(cached)
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

  return { data, loading, error, refresh }
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
 * zoneID defaults to 41 (Liberation of Undermine — patch 12.0).
 * Returns { data: { character }, loading, error, refresh }.
 */
export function useCharacterParses(name, realm, region = 'eu', zoneID = 41) {
  const variables = { name, serverSlug: realm, serverRegion: region, zoneID }
  const cacheId   = `parses:${region}:${realm}:${name}:${zoneID}`.toLowerCase()

  const { data, loading, error, refresh } = useWCLAPI(
    name && realm ? CHARACTER_RANKINGS_QUERY : null,
    variables,
    cacheId,
  )

  return {
    data: data?.data?.characterData?.character ?? null,
    loading,
    error,
    refresh,
  }
}
