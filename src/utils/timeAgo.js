export function timeAgo(ts) {
  if (!ts) return null
  const diff = Date.now() - ts
  if (diff < 60_000)      return 'just now'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)} min ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)} hr ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
