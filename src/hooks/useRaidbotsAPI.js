import { useState, useEffect, useRef, useCallback } from 'react'

const POLL_INTERVAL = 5000 // 5 seconds

/**
 * useRaidbotsAPI()
 *
 * Returns { submitSim, jobId, status, progress, resultUrl, loading, error, reset }.
 *
 * Usage:
 *   const { submitSim, status, resultUrl, loading, error } = useRaidbotsAPI()
 *   submitSim({ simc: "...", type: "quick" })
 *
 * type can be: 'quick' | 'advanced' | 'droptimizer'
 * For droptimizer, pass droptimizer: { region, realm, name, ... }
 */
export function useRaidbotsAPI() {
  const [jobId, setJobId]       = useState(null)
  const [status, setStatus]     = useState(null)   // 'pending' | 'in_progress' | 'complete' | 'failed'
  const [progress, setProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const pollRef = useRef(null)

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Start polling a given jobId
  const startPolling = useCallback((id) => {
    stopPolling()

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/raidbots?jobId=${id}`)
        if (res.status === 404) {
          stopPolling()
          setError('API not available')
          setLoading(false)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }

        const { status: s, progress: p, resultUrl: url } = await res.json()
        setStatus(s)
        setProgress(p ?? 0)

        if (s === 'complete') {
          setResultUrl(url)
          setLoading(false)
          stopPolling()
        } else if (s === 'failed' || s === 'errored') {
          setError(`Sim job ${s}`)
          setLoading(false)
          stopPolling()
        }
      } catch (err) {
        setError(err.message)
        setLoading(false)
        stopPolling()
      }
    }, POLL_INTERVAL)
  }, [stopPolling])

  // Clean up on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  const submitSim = useCallback(async ({ simc, type = 'quick', advancedInput, droptimizer } = {}) => {
    stopPolling()
    setJobId(null)
    setStatus(null)
    setProgress(0)
    setResultUrl(null)
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/raidbots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simc, type, advancedInput, droptimizer }),
      })

      if (res.status === 404) throw new Error('API not available')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { jobId: id } = await res.json()
      if (!id) throw new Error('No job ID returned from Raidbots')

      setJobId(id)
      setStatus('pending')
      startPolling(id)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [startPolling, stopPolling])

  const reset = useCallback(() => {
    stopPolling()
    setJobId(null)
    setStatus(null)
    setProgress(0)
    setResultUrl(null)
    setError(null)
    setLoading(false)
  }, [stopPolling])

  return { submitSim, jobId, status, progress, resultUrl, loading, error, reset }
}
