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

function sessionHeaders(session) {
  const csrf = process.env.RAIDBOTS_CSRF
  const headers = {
    Cookie: `raidsid=${session}`,
    'User-Agent': RAIDBOTS_USER_AGENT,
  }

  if (csrf) headers['x-csrf-token'] = csrf
  return headers
}

function authHeaders() {
  const { session } = getRaidbotsAuth()
  return sessionHeaders(session)
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

function getActorProfile(actor) {
  if (actor?.v2?.profile && typeof actor.v2.profile === 'object') {
    return actor.v2.profile
  }

  return actor ?? {}
}

export function extractRaidbotsActorDetails(actor) {
  const profile = getActorProfile(actor)
  const items = actor?.items
    ?? actor?.gear
    ?? profile?.items
    ?? profile?.gear
    ?? {}
  const classId = actor?.class?.id
    ?? actor?.classs?.id
    ?? actor?.class
    ?? profile?.character_class?.id
    ?? profile?.class?.id
    ?? null
  const specId = actor?.spec?.id
    ?? actor?.specId
    ?? actor?.talentLoadout?.spec?.id
    ?? profile?.active_spec?.id
    ?? profile?.spec?.id
    ?? null
  const specName = actor?.spec?.name
    ?? actor?.talentLoadout?.spec?.name
    ?? profile?.active_spec?.name
    ?? profile?.spec?.name
    ?? null
  const faction = actor?.faction
    ?? profile?.faction?.type
    ?? profile?.faction?.name
    ?? null

  return {
    items,
    classId,
    specId,
    specName,
    faction,
  }
}

function resolveActorName(actor, fallback = null) {
  return actor?.name
    ?? actor?.character?.name
    ?? fallback
}

function resolveActorRealm(actor, fallback = null) {
  return actor?.realm?.slug
    ?? actor?.realm?.name
    ?? fallback
}

function resolveActorRegion(actor, fallback = null) {
  return actor?.region?.slug
    ?? actor?.region?.name
    ?? actor?.region
    ?? fallback
}

function resolveActorClassId(actor, fallback = null) {
  return actor?.class?.id
    ?? actor?.classs?.id
    ?? actor?.class
    ?? fallback
}

function resolveActorSpecId(actor, fallback = null) {
  return actor?.spec?.id
    ?? actor?.specId
    ?? actor?.active_spec?.id
    ?? actor?.talentLoadout?.spec?.id
    ?? fallback
}

function resolveActorSpecName(actor, fallback = null) {
  return actor?.spec?.name
    ?? actor?.active_spec?.name
    ?? actor?.talentLoadout?.spec?.name
    ?? fallback
}

function resolveActorItems(actor, fallback = {}) {
  return actor?.items
    ?? actor?.equipped
    ?? fallback
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

export function buildDroptimizerPayload(droptimizer, character) {
  const actor = character ?? droptimizer?.character
  const region = resolveActorRegion(actor, droptimizer?.armory?.region ?? droptimizer?.region)
  const realm = resolveActorRealm(actor, droptimizer?.armory?.realm ?? droptimizer?.realm)
  const name = resolveActorName(actor, droptimizer?.armory?.name ?? droptimizer?.name ?? droptimizer?.baseActorName)

  if (!region || !realm || !name) {
    throw new Error('Droptimizer payload requires region, realm, and name')
  }

  if (!actor) {
    throw new Error('Droptimizer payload is missing a character actor')
  }

  const scenarioOptions = droptimizer?.droptimizer && typeof droptimizer.droptimizer === 'object'
    ? droptimizer.droptimizer
    : {}
  const classId = resolveActorClassId(actor, scenarioOptions.classId ?? null)
  const specId = resolveActorSpecId(actor, scenarioOptions.specId ?? null)

  const nestedDroptimizer = {
    ...scenarioOptions,
    equipped: resolveActorItems(actor, scenarioOptions.equipped ?? {}),
    difficulty: scenarioOptions.difficulty ?? droptimizer?.difficulty ?? 'raid-heroic',
    classId,
    specId,
    lootSpecId: scenarioOptions.lootSpecId ?? specId,
    faction: normalizeFaction(actor?.faction ?? scenarioOptions.faction),
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

  const droptimizerItems = Array.isArray(droptimizer?.droptimizerItems)
    ? droptimizer.droptimizerItems
    : []

  return {
    ...droptimizer,
    type: 'droptimizer',
    reportName: droptimizer?.reportName ?? `Droptimizer • ${name}`,
    baseActorName: name,
    armory: {
      region: String(region).trim().toLowerCase(),
      realm: slugifyRealm(realm),
      name,
    },
    region: String(region).trim().toLowerCase(),
    realm: slugifyRealm(realm),
    name,
    character: actor,
    spec: resolveActorSpecName(actor, droptimizer?.spec ?? null),
    gearsets: Array.isArray(droptimizer?.gearsets) ? droptimizer.gearsets : [],
    talents: Object.prototype.hasOwnProperty.call(droptimizer ?? {}, 'talents') ? droptimizer.talents : null,
    talentSets: Array.isArray(droptimizer?.talentSets) ? droptimizer.talentSets : [],
    simcVersion: droptimizer?.simcVersion ?? 'weekly',
    iterations: droptimizer?.iterations ?? 'smart',
    smartHighPrecision: droptimizer?.smartHighPrecision ?? false,
    smartAggressive: droptimizer?.smartAggressive ?? false,
    fightStyle: droptimizer?.fightStyle ?? 'Patchwerk',
    fightLength: droptimizer?.fightLength ?? 300,
    enemyCount: droptimizer?.enemyCount ?? 1,
    enemyType: droptimizer?.enemyType ?? 'FluffyPillow',
    droptimizer: nestedDroptimizer,
    droptimizerItems,
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

  if (!payload.character) {
    throw new Error('Droptimizer payload is missing a character actor')
  }
  if (!Array.isArray(payload.droptimizerItems) || payload.droptimizerItems.length === 0) {
    throw new Error('Droptimizer payload is missing droptimizerItems')
  }

  console.log('[raidbots droptimizer submit]', JSON.stringify({
    actor: payload.baseActorName ?? payload.armory?.name ?? null,
    region: payload.armory?.region ?? null,
    realm: payload.armory?.realm ?? null,
    itemCount: payload.droptimizerItems.length,
    difficulty: payload.droptimizer?.difficulty ?? null,
    instances: Array.isArray(payload.droptimizer?.instances) ? payload.droptimizer.instances : null,
    keystoneLevel: payload.droptimizer?.keystoneLevel ?? null,
  }))

  const body = JSON.stringify(payload)
  const submitHeaders = {
    ...sessionHeaders(activeSession),
    'Content-Type': 'application/json',
    Referer: `${RAIDBOTS_BASE}/simbot/droptimizer`,
    Origin: RAIDBOTS_BASE,
  }

  const submitRes = await fetch(`${RAIDBOTS_BASE}/sim`, {
    method: 'POST',
    headers: submitHeaders,
    body,
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    const shouldRetryViaJobApi = submitRes.status >= 500
      || /Seri did not properly handle an error/i.test(text)

    if (!shouldRetryViaJobApi) {
      throw new Error(`Raidbots Droptimizer submit failed (${submitRes.status}): ${text}`)
    }

    console.warn(`[raidbots droptimizer submit] /sim failed (${submitRes.status}); retrying /api/job/droptimizer`)

    const fallbackRes = await fetch(`${RAIDBOTS_BASE}${SIM_TYPE_MAP.droptimizer}`, {
      method: 'POST',
      headers: {
        ...sessionHeaders(activeSession),
        'Content-Type': 'application/json',
        Referer: `${RAIDBOTS_BASE}/simbot`,
        Origin: RAIDBOTS_BASE,
      },
      body,
    })

    if (!fallbackRes.ok) {
      const fallbackText = await fallbackRes.text()
      throw new Error(`Raidbots Droptimizer submit failed (${submitRes.status}): ${text}; fallback /api/job/droptimizer failed (${fallbackRes.status}): ${fallbackText}`)
    }

    const fallbackData = await fallbackRes.json()
    const fallbackSimId = fallbackData.job?.id ?? fallbackData.id ?? fallbackData.simId ?? null

    if (!fallbackSimId) {
      throw new Error('Raidbots Droptimizer fallback did not return a sim ID')
    }

    return {
      simId: fallbackSimId,
      jobId: fallbackData.job?.id ?? fallbackData.id ?? null,
      payload,
      raw: fallbackData,
    }
  }

  const data = await submitRes.json()
  const simId = data.simId ?? data.jobId ?? null
  if (!simId) {
    throw new Error('Raidbots Droptimizer did not return a sim ID')
  }

  return {
    simId,
    jobId: data.jobId ?? null,
    payload,
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
