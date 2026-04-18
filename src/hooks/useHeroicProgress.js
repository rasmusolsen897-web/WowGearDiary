import { useEffect, useState } from 'react'

export function useHeroicProgress(guild) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const members = guild?.members ?? []
    if (!guild?.realm || members.length === 0) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/heroic-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: guild.region,
        realm: guild.realm,
        members,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error ?? `HTTP ${response.status}`)
        }
        setData(payload)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setData(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [guild])

  return { data, loading, error }
}
