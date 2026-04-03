const RAIDBOTS_BASE = 'https://www.raidbots.com'
const RAIDBOTS_USER_AGENT = 'WowGearDiary/1.0'

export const SIM_TYPE_MAP = {
  quick: '/api/job/quick',
  advanced: '/api/job/advanced',
  droptimizer: '/api/job/droptimizer',
}

function getRaidbotsCookieSession() {
  return process.env.RAIDBOTS_SESSION?.trim() || null
}

function getRaidbotsAuth() {
  const session = getRaidbotsCookieSession()
  const csrf = process.env.RAIDBOTS_CSRF

  if (!session) {
    throw new Error('RAIDBOTS_SESSION must be set')
  }

  return { session, csrf }
}

function authHeaders() {
  const { session, csrf } = getRaidbotsAuth()
  const headers = {
    Cookie: `raidsid=${session}`,
    'User-Agent': RAIDBOTS_USER_AGENT,
  }

  if (csrf) headers['x-csrf-token'] = csrf
  return headers
}

export function buildRaidbotsResultUrl(jobId) {
  return `${RAIDBOTS_BASE}/simbot/report/${jobId}`
}

function slugifyRealm(realm) {
  return String(realm ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/'/g, '')
}

function slugifyName(name) {
  return String(name ?? '').trim().toLowerCase()
}

function normalizeFaction(value) {
  if (typeof value === 'string') return value.toLowerCase()
  if (value === 0) return 'alliance'
  if (value === 1) return 'horde'
  return 'horde'
}

async function loginRaidbotsSession(email, password) {
  const loginRes = await fetch(`${RAIDBOTS_BASE}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': RAIDBOTS_USER_AGENT,
    },
    body: JSON.stringify({ email, password }),
  })

  if (!loginRes.ok) {
    const text = await loginRes.text()
    throw new Error(`Raidbots login failed (${loginRes.status}): ${text}`)
  }

  const setCookie = loginRes.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/raidsid=([^;]+)/)
  if (!match) {
    throw new Error('Raidbots login succeeded but no raidsid cookie was returned')
  }

  return match[1]
}

export async function createRaidbotsSession() {
  const existingSession = getRaidbotsCookieSession()
  if (existingSession) return existingSession

  const email = process.env.RAIDBOTS_EMAIL?.trim()
  const password = process.env.RAIDBOTS_PASSWORD
  if (!email || !password) {
    throw new Error('Set RAIDBOTS_SESSION or RAIDBOTS_EMAIL and RAIDBOTS_PASSWORD')
  }

  return loginRaidbotsSession(email, password)
}

export async function fetchRaidbotsCharacter(region, realm, name) {
  const regionSlug = String(region ?? '').trim().toLowerCase()
  const realmSlug = slugifyRealm(realm)
  const nameSlug = slugifyName(name)

  if (!regionSlug || !realmSlug || !nameSlug) {
    throw new Error('Raidbots character lookup requires region, realm, and name')
  }

  const characterRes = await fetch(`${RAIDBOTS_BASE}/wowapi/character/${regionSlug}/${realmSlug}/${nameSlug}`, {
    headers: {
      'User-Agent': RAIDBOTS_USER_AGENT,
    },
  })

  if (!characterRes.ok) {
    const text = await characterRes.text()
    throw new Error(`Raidbots character fetch failed (${characterRes.status}): ${text}`)
  }

  return characterRes.json()
}

function buildDroptimizerPayload(droptimizer, character) {
  const region = droptimizer?.armory?.region ?? droptimizer?.region
  const realm = droptimizer?.armory?.realm ?? droptimizer?.realm
  const name = droptimizer?.armory?.name ?? droptimizer?.name ?? droptimizer?.baseActorName

  if (!region || !realm || !name) {
    throw new Error('Droptimizer payload requires region, realm, and name')
  }

  const scenarioOptions = droptimizer?.droptimizer && typeof droptimizer.droptimizer === 'object'
    ? droptimizer.droptimizer
    : {}
  const classId = character.class?.id ?? character.classs?.id ?? null
  const specId = character.spec?.id ?? character.talentLoadout?.spec?.id ?? null

  const nestedDroptimizer = {
    ...scenarioOptions,
    equipped: character.items ?? {},
    difficulty: scenarioOptions.difficulty ?? droptimizer?.difficulty ?? 'raid-heroic',
    classId,
    specId,
    faction: scenarioOptions.faction ?? normalizeFaction(character.faction),
  }

  if (Array.isArray(droptimizer?.instances) && !nestedDroptimizer.instances) {
    nestedDroptimizer.instances = droptimizer.instances
  }
  if (droptimizer?.raidDifficulty && !nestedDroptimizer.raidDifficulty) {
    nestedDroptimizer.raidDifficulty = droptimizer.raidDifficulty
  }
  if (typeof droptimizer?.allDungeons === 'boolean' && typeof nestedDroptimizer.allDungeons !== 'boolean') {
    nestedDroptimizer.allDungeons = droptimizer.allDungeons
  }
  if (typeof droptimizer?.mythicPlusAll === 'boolean' && typeof nestedDroptimizer.mythicPlusAll !== 'boolean') {
    nestedDroptimizer.mythicPlusAll = droptimizer.mythicPlusAll
  }
  if (typeof droptimizer?.keystoneLevel === 'number' && !nestedDroptimizer.keystoneLevel) {
    nestedDroptimizer.keystoneLevel = droptimizer.keystoneLevel
  }

  return {
    type: 'droptimizer',
    reportName: droptimizer?.reportName ?? `Droptimizer • ${name}`,
    baseActorName: droptimizer?.baseActorName ?? name,
    armory: {
      region: String(region).trim().toLowerCase(),
      realm: slugifyRealm(realm),
      name: slugifyName(name),
    },
    character,
    simcVersion: droptimizer?.simcVersion ?? 'weekly',
    iterations: droptimizer?.iterations ?? 'smart',
    smartHighPrecision: droptimizer?.smartHighPrecision ?? false,
    smartAggressive: droptimizer?.smartAggressive ?? false,
    fightStyle: droptimizer?.fightStyle ?? 'Patchwerk',
    fightLength: droptimizer?.fightLength ?? 300,
    enemyCount: droptimizer?.enemyCount ?? 1,
    enemyType: droptimizer?.enemyType ?? 'FluffyPillow',
    droptimizer: nestedDroptimizer,
    sendEmail: droptimizer?.sendEmail ?? false,
    bloodlust: droptimizer?.bloodlust ?? true,
    arcaneIntellect: droptimizer?.arcaneIntellect ?? true,
    fortitude: droptimizer?.fortitude ?? true,
    battleShout: droptimizer?.battleShout ?? true,
    mysticTouch: droptimizer?.mysticTouch ?? true,
    chaosBrand: droptimizer?.chaosBrand ?? true,
    bleeding: droptimizer?.bleeding ?? true,
    reportDetails: droptimizer?.reportDetails ?? false,
    ptr: droptimizer?.ptr ?? false,
    frontendHost: droptimizer?.frontendHost ?? 'www.raidbots.com',
  }
}

export async function submitRaidbotsDroptimizer({ session, droptimizer } = {}) {
  const activeSession = session ?? await createRaidbotsSession()
  const character = droptimizer?.character ?? await fetchRaidbotsCharacter(
    droptimizer?.armory?.region ?? droptimizer?.region,
    droptimizer?.armory?.realm ?? droptimizer?.realm,
    droptimizer?.armory?.name ?? droptimizer?.name ?? droptimizer?.baseActorName,
  )
  const payload = buildDroptimizerPayload(droptimizer, character)

  const submitRes = await fetch(`${RAIDBOTS_BASE}/sim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `raidsid=${activeSession}`,
      Referer: `${RAIDBOTS_BASE}/simbot/droptimizer`,
      Origin: RAIDBOTS_BASE,
      'User-Agent': RAIDBOTS_USER_AGENT,
    },
    body: JSON.stringify(payload),
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    throw new Error(`Raidbots Droptimizer submit failed (${submitRes.status}): ${text}`)
  }

  const data = await submitRes.json()
  const simId = data.simId ?? data.jobId ?? null
  if (!simId) {
    throw new Error('Raidbots Droptimizer did not return a sim ID')
  }

  return {
    simId,
    jobId: data.jobId ?? null,
    raw: data,
  }
}

export async function pollRaidbotsSim(simId) {
  const pollRes = await fetch(`${RAIDBOTS_BASE}/api/job/${simId}?noLog=1`, {
    headers: {
      'User-Agent': RAIDBOTS_USER_AGENT,
    },
  })

  if (!pollRes.ok) {
    const text = await pollRes.text()
    throw new Error(`Raidbots sim poll failed (${pollRes.status}): ${text}`)
  }

  const job = await pollRes.json()
  const rawStatus = job.job?.state ?? job.state ?? job.job?.status ?? 'unknown'
  const status = rawStatus === 'active' ? 'running' : rawStatus

  return {
    status,
    progress: job.job?.progress ?? 0,
    resultUrl: status === 'complete' ? buildRaidbotsResultUrl(simId) : null,
    raw: job,
  }
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
