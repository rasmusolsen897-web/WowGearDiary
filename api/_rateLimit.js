const buckets = new Map()

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]
  }

  return req.socket?.remoteAddress ?? 'unknown'
}

export function applyRateLimit(req, res, { key, limit, windowMs }) {
  const now = Date.now()
  const bucketKey = `${key}:${getClientIp(req)}`
  const bucket = buckets.get(bucketKey)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', String(limit - 1))
    return { ok: true }
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', '0')
    res.setHeader('Retry-After', String(retryAfter))
    return { ok: false, retryAfter }
  }

  bucket.count += 1
  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)))
  return { ok: true }
}
