import { useState, useEffect } from 'react'

const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

function cacheKey(region, realm, name) {
  return `blizzard:${region}:${realm}:${name}`.toLowerCase()
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
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

/**
 * useBlizzardAPI(name, realm, region)
 *
 * Fetches character gear from /api/blizzard (Vercel proxy).
 * Caches result in localStorage for 15 minutes.
 * Returns { data, loading, error, refresh }.
 * If the /api/ route returns 404 (standalone HTML mode), gracefully returns
 * { data: null, error: 'API not available' }.
 */
export function useBlizzardAPI(name, realm, region = 'eu') {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [tick, setTick]           = useState(0)  // increment to force refresh
  const [fetchedAt, setFetchedAt] = useState(null)

  useEffect(() => {
    if (!name || !realm) return

    const key = cacheKey(region, realm, name)
    const cached = readCache(key)
    if (cached) {
      setData(cached.data)
      setFetchedAt(cached.ts)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/blizzard?action=character&region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error('API not available')
        // Check content-type before attempting JSON parse — in local dev Vite may
        // serve the source file (text/javascript) instead of executing it.
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
  }, [name, realm, region, tick])

  const refresh = () => {
    try { localStorage.removeItem(cacheKey(region, realm, name)) } catch {}
    setTick((t) => t + 1)
  }

  return { data, loading, error, refresh, fetchedAt }
}

/**
 * useBlizzardMedia(name, realm, region)
 *
 * Fetches character avatar URL from /api/blizzard?action=media.
 * Returns { avatarUrl, loading }.
 */
export function useBlizzardMedia(name, realm, region = 'eu') {
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (!name || !realm) return

    const key = `blizzard-media:${region}:${realm}:${name}`.toLowerCase()
    const cached = readCache(key)
    if (cached) { setAvatarUrl(cached.data.avatarUrl); return }

    let cancelled = false
    setLoading(true)

    fetch(`/api/blizzard?action=media&region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}`)
      .then((res) => {
        const ct = res.headers.get('content-type') ?? ''
        if (!res.ok || !ct.includes('application/json')) return { avatarUrl: null }
        return res.json()
      })
      .then(({ avatarUrl: url }) => {
        if (cancelled) return
        if (url) writeCache(key, { avatarUrl: url })
        setAvatarUrl(url)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [name, realm, region])

  return { avatarUrl, loading }
}
