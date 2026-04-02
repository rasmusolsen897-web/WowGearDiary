/**
 * api/cron-droptimizer-submit.js
 *
 * Vercel Cron — runs daily at 03:00 UTC
 * Submits a Droptimizer job on Raidbots for every character in the guild.
 * Jobs are tracked in the `droptimizer_jobs` Supabase table.
 * The companion cron (cron-droptimizer-poll.js) checks job status every 5 min
 * and writes the completed report URL back to `characters.droptimizerUrl`.
 *
 * Required env vars:
 *   RAIDBOTS_EMAIL          Raidbots account e-mail
 *   RAIDBOTS_PASSWORD       Raidbots account password (paid account required)
 *   RAIDBOTS_DIFFICULTY     Optional override — default "raid-heroic"
 *   RAIDBOTS_INSTANCES      Optional comma-separated instance IDs override
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET             Vercel cron secret (auto-set by Vercel)
 */

import { createClient } from '@supabase/supabase-js'

const RAIDBOTS_BASE = 'https://www.raidbots.com'

// Current TWW / Midnight tier instance IDs.
// Update when a new raid tier releases — or override via RAIDBOTS_INSTANCES env var.
const DEFAULT_INSTANCES = [1307, 1308] // The Voidspire, March on Quel'Danas

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Login and return the raidsid session cookie value */
async function getRaidbotsSession(email, password) {
  const res = await fetch(`${RAIDBOTS_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Raidbots login failed (${res.status}): ${text}`)
  }

  // Cookie comes back as "raidsid=<value>; Path=/; ..."
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/raidsid=([^;]+)/)
  if (!match) throw new Error('No raidsid cookie in Raidbots login response')
  return match[1]
}

/**
 * Fetch Raidbots' own character snapshot (their Blizzard proxy).
 * Returns the full character object needed for the sim body.
 */
async function fetchRaidbotsCharacter(region, realm, name) {
  const realmSlug = realm.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
  const nameSlug  = name.toLowerCase()
  const url = `${RAIDBOTS_BASE}/wowapi/character/${region}/${realmSlug}/${nameSlug}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'WowGearDiary/1.0' },
  })

  if (!res.ok) throw new Error(`Raidbots character fetch failed (${res.status}) for ${name}-${realm}`)
  return res.json()
}

/** Submit a Droptimizer job and return the simId (report ID) */
async function submitDroptimizer({ raidsid, character, region, realm, name, difficulty, instances }) {
  const realmSlug = realm.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')

  // classId / specId may live in different shapes depending on Raidbots version
  const classId = character.class?.id ?? character.classs?.id ?? null
  const specId  = character.spec?.id  ?? character.talentLoadout?.spec?.id ?? null

  const body = {
    type:        'droptimizer',
    reportName:  `Auto-Droptimizer – ${name}`,
    armory: {
      region,
      realm:  realmSlug,
      name:   name.toLowerCase(),
    },
    character,
    simcVersion:        'nightly',
    iterations:         'smart',
    smartHighPrecision: false,
    fightStyle:         'Patchwerk',
    fightLength:        300,
    enemyCount:         1,
    enemyType:          'FluffyPillow',
    droptimizer: {
      equipped:   character.items ?? {},
      instances,
      difficulty,
      classId,
      specId,
      faction:    (character.faction ?? 'horde').toLowerCase(),
    },
    bloodlust:        true,
    arcaneIntellect:  true,
    fortitude:        true,
    battleShout:      true,
    mysticTouch:      true,
    chaosBrand:       true,
    bleeding:         true,
    reportDetails:    true,
    ptr:              false,
    frontendHost:     'www.raidbots.com',
  }

  const res = await fetch(`${RAIDBOTS_BASE}/sim`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie:         `raidsid=${raidsid}`,
      Referer:        `${RAIDBOTS_BASE}/simbot/droptimizer`,
      Origin:         RAIDBOTS_BASE,
      'User-Agent':   'WowGearDiary/1.0',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sim submit failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const simId = data.simId ?? data.jobId ?? null
  if (!simId) throw new Error('Raidbots response contained no simId')
  return simId
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel auto-sends Authorization: Bearer <CRON_SECRET> for cron invocations
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const email    = process.env.RAIDBOTS_EMAIL
  const password = process.env.RAIDBOTS_PASSWORD
  if (!email || !password) {
    return res.status(500).json({ error: 'RAIDBOTS_EMAIL and RAIDBOTS_PASSWORD must be set' })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not set' })
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const difficulty = process.env.RAIDBOTS_DIFFICULTY ?? 'raid-heroic'
  const instances  = process.env.RAIDBOTS_INSTANCES
    ? process.env.RAIDBOTS_INSTANCES.split(',').map(Number).filter(Boolean)
    : DEFAULT_INSTANCES

  // 1. Fetch all guild characters
  const { data: characters, error: charError } = await sb.from('characters').select('name, realm, region')
  if (charError) return res.status(500).json({ error: charError.message })
  if (!characters?.length) return res.status(200).json({ message: 'No characters found' })

  // 2. Login to Raidbots
  let raidsid
  try {
    raidsid = await getRaidbotsSession(email, password)
  } catch (err) {
    console.error('[cron-droptimizer-submit] Login failed:', err.message)
    return res.status(500).json({ error: `Raidbots login: ${err.message}` })
  }

  // 3. Submit a Droptimizer for each character (serial to avoid rate-limiting)
  const results = []

  for (const char of characters) {
    const region = char.region ?? 'eu'
    const realm  = char.realm  ?? 'tarren-mill'
    const name   = char.name

    try {
      // Fetch Raidbots' character snapshot
      const character = await fetchRaidbotsCharacter(region, realm, name)

      // Submit sim
      const simId = await submitDroptimizer({ raidsid, character, region, realm, name, difficulty, instances })

      // Record in droptimizer_jobs (ignore conflicts from duplicate runs)
      await sb.from('droptimizer_jobs').insert({
        character_name: name,
        realm,
        region,
        job_id:  simId,
        status:  'queued',
      })

      console.log(`[cron-droptimizer-submit] Submitted ${name}: ${simId}`)
      results.push({ name, simId, status: 'submitted' })

    } catch (err) {
      console.error(`[cron-droptimizer-submit] Failed for ${name}:`, err.message)

      // Record failed submission so we have visibility
      await sb.from('droptimizer_jobs').insert({
        character_name: name,
        realm,
        region,
        status:    'error',
        error_msg: err.message,
      }).catch(() => {})

      results.push({ name, status: 'error', error: err.message })
    }
  }

  return res.status(200).json({
    submitted: results.filter(r => r.status === 'submitted').length,
    errors:    results.filter(r => r.status === 'error').length,
    results,
  })
}
