const RAIDBOTS_BASE = 'https://www.raidbots.com'

export const SIM_TYPE_MAP = {
  quick: '/api/job/quick',
  advanced: '/api/job/advanced',
  droptimizer: '/api/job/droptimizer',
}

function getRaidbotsAuth() {
  const session = process.env.RAIDBOTS_SESSION
  const csrf = process.env.RAIDBOTS_CSRF

  if (!session || !csrf) {
    throw new Error('RAIDBOTS_SESSION and RAIDBOTS_CSRF must be set')
  }

  return { session, csrf }
}

function authHeaders() {
  const { session, csrf } = getRaidbotsAuth()
  return {
    Cookie: `raidsid=${session}`,
    'x-csrf-token': csrf,
    'User-Agent': 'WowGearDiary/1.0',
  }
}

export function buildRaidbotsResultUrl(jobId) {
  return `${RAIDBOTS_BASE}/simbot/report/${jobId}`
}

export async function pollRaidbotsJob(jobId) {
  const pollRes = await fetch(`${RAIDBOTS_BASE}/api/job/${jobId}`, {
    headers: authHeaders(),
  })

  if (!pollRes.ok) {
    const text = await pollRes.text()
    throw new Error(`Raidbots poll failed (${pollRes.status}): ${text}`)
  }

  const job = await pollRes.json()
  const status = job.job?.status ?? 'unknown'

  return {
    status,
    progress: job.job?.progress ?? 0,
    resultUrl: status === 'complete' ? buildRaidbotsResultUrl(jobId) : null,
    raw: job,
  }
}

export async function submitRaidbotsJob({ simc, type = 'quick', advancedInput, droptimizer } = {}) {
  if (type !== 'droptimizer' && !simc && !advancedInput) {
    throw new Error('simc or advancedInput required')
  }

  const endpoint = SIM_TYPE_MAP[type] ?? SIM_TYPE_MAP.quick
  const payload = type === 'droptimizer'
    ? {
        region: droptimizer?.region ?? 'eu',
        realm: droptimizer?.realm ?? '',
        name: droptimizer?.name ?? '',
        simcVersion: 'nightly',
        ...droptimizer,
      }
    : type === 'advanced'
      ? { advancedInput }
      : { simc, simcVersion: 'nightly' }

  const submitRes = await fetch(`${RAIDBOTS_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      Referer: 'https://www.raidbots.com/simbot',
      Origin: 'https://www.raidbots.com',
    },
    body: JSON.stringify(payload),
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    throw new Error(`Raidbots submit failed (${submitRes.status}): ${text}`)
  }

  const data = await submitRes.json()
  const jobId = data.job?.id ?? data.id ?? null

  if (!jobId) {
    throw new Error('Raidbots did not return a job ID')
  }

  return { jobId, raw: data }
}
