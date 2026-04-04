import crypto from 'node:crypto'

export const AUTOMATION_TIMEZONE = 'Europe/Copenhagen'

export const ENROLLMENT_STATUSES = {
  pending: 'pending',
  valid: 'valid',
  invalid: 'invalid',
}

export const TRIGGER_KINDS = {
  automation: 'automation',
  manual: 'manual',
  validation: 'validation',
}

function nowIso(date = new Date()) {
  return date.toISOString()
}

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizeScenario(value) {
  return String(firstQueryValue(value) ?? '').trim()
}

export function dateKeyInTimeZone(date = new Date(), timeZone = AUTOMATION_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}

export function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex')
}

export function roleFromSpec(spec) {
  const normalized = String(spec ?? '')
  const tanks = ['Protection', 'Blood', 'Brewmaster', 'Vengeance', 'Guardian']
  const healers = ['Holy', 'Discipline', 'Restoration', 'Mistweaver', 'Preservation']

  if (tanks.some((value) => normalized.includes(value))) return 'tank'
  if (healers.some((value) => normalized.includes(value))) return 'healer'
  return 'dps'
}

export function enrollmentStatusFromRow(row) {
  if (!row) return 'not_enrolled'
  if (row.enabled && row.validation_status === ENROLLMENT_STATUSES.valid) return ENROLLMENT_STATUSES.valid
  return row.validation_status ?? ENROLLMENT_STATUSES.pending
}

export async function loadSchedulerState(supabase, scenario) {
  const { data, error } = await supabase
    .from('droptimizer_scheduler_state')
    .select('*')
    .eq('scenario', scenario)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function ensureSchedulerState(supabase, scenario) {
  const { error } = await supabase
    .from('droptimizer_scheduler_state')
    .upsert({ scenario, updated_at: nowIso() }, { onConflict: 'scenario' })

  if (error) throw error
  return loadSchedulerState(supabase, scenario)
}

export async function updateSchedulerState(supabase, scenario, patch) {
  const { data, error } = await supabase
    .from('droptimizer_scheduler_state')
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq('scenario', scenario)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function loadCharacters(supabase) {
  const { data, error } = await supabase
    .from('characters')
    .select('name, class, spec, role, is_main, realm, alt_of, report_url, droptimizer_url')
    .order('is_main', { ascending: false })
    .order('name')

  if (error) throw error
  return data ?? []
}

export function charactersByName(characters = []) {
  return new Map(
    characters
      .filter((character) => character?.name)
      .map((character) => [normalizeName(character.name), character]),
  )
}

export async function loadEnrollment(supabase, characterName, scenario) {
  const { data, error } = await supabase
    .from('droptimizer_payloads')
    .select('character_name, scenario, payload, enabled, validation_status, validation_error, validated_at, payload_hash, payload_source, updated_at')
    .eq('character_name', characterName)
    .eq('scenario', scenario)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function listEnrollments(supabase, scenario) {
  const { data, error } = await supabase
    .from('droptimizer_payloads')
    .select('character_name, scenario, payload, enabled, validation_status, validation_error, validated_at, payload_hash, payload_source, updated_at')
    .eq('scenario', scenario)
    .order('character_name')

  if (error) throw error
  return data ?? []
}

export async function listValidEnrollments(supabase, scenario, characterNames = null) {
  let query = supabase
    .from('droptimizer_payloads')
    .select('character_name, scenario, payload, enabled, validation_status, validation_error, validated_at, payload_hash, payload_source, updated_at')
    .eq('scenario', scenario)
    .eq('enabled', true)
    .eq('validation_status', ENROLLMENT_STATUSES.valid)

  if (Array.isArray(characterNames) && characterNames.length > 0) {
    query = query.in('character_name', characterNames)
  }

  const { data, error } = await query.order('character_name')
  if (error) throw error
  return data ?? []
}

export async function upsertEnrollment(supabase, {
  characterName,
  scenario,
  payload,
  enabled = false,
  validationStatus = ENROLLMENT_STATUSES.pending,
  validationError = null,
  validatedAt = null,
  payloadSource = 'ui_capture',
}) {
  const row = {
    character_name: characterName,
    scenario,
    payload,
    enabled,
    validation_status: validationStatus,
    validation_error: validationError,
    validated_at: validatedAt,
    payload_hash: payloadHash(payload),
    payload_source: payloadSource,
    updated_at: nowIso(),
  }

  const { data, error } = await supabase
    .from('droptimizer_payloads')
    .upsert(row, { onConflict: 'character_name,scenario' })
    .select('character_name, scenario, payload, enabled, validation_status, validation_error, validated_at, payload_hash, payload_source, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateEnrollmentValidation(supabase, characterName, scenario, patch) {
  const { data, error } = await supabase
    .from('droptimizer_payloads')
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq('character_name', characterName)
    .eq('scenario', scenario)
    .select('character_name, scenario, payload, enabled, validation_status, validation_error, validated_at, payload_hash, payload_source, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function syncCharacterDroptimizerUrl(supabase, characterName, reportUrl) {
  const { error } = await supabase
    .from('characters')
    .update({
      droptimizer_url: reportUrl ?? null,
      updated_at: nowIso(),
    })
    .ilike('name', characterName)

  if (error) throw error
}

export async function syncCharacterMetadataFromActor(supabase, characterName, actor, fallbackRealm = '') {
  const className = actor?.class?.name ?? actor?.character_class?.name ?? ''
  const specName = actor?.spec?.name ?? actor?.active_spec?.name ?? actor?.talentLoadout?.spec?.name ?? ''
  const realmName = actor?.realm?.name ?? fallbackRealm ?? ''
  const role = roleFromSpec(specName)

  const { error } = await supabase
    .from('characters')
    .update({
      class: className,
      spec: specName,
      role,
      realm: realmName,
      updated_at: nowIso(),
    })
    .ilike('name', characterName)

  if (error) throw error
}

export async function createOrResetRun(supabase, {
  characterName,
  scenario,
  runDate,
  status,
  source = TRIGGER_KINDS.automation,
  triggerKind = TRIGGER_KINDS.automation,
  difficulty = null,
  workflowRunId = null,
  attemptCount = 0,
}) {
  const row = {
    character_name: characterName,
    scenario,
    run_date: runDate,
    status,
    source,
    trigger_kind: triggerKind,
    workflow_run_id: workflowRunId,
    report_url: null,
    raidbots_job_id: null,
    base_dps: null,
    difficulty,
    error_message: null,
    started_at: nowIso(),
    completed_at: null,
    attempt_count: attemptCount,
    next_retry_at: null,
  }

  const { data, error } = await supabase
    .from('sim_runs')
    .upsert(row, { onConflict: 'character_name,scenario,run_date' })
    .select('*')
    .single()

  if (error) throw error

  await clearRunItems(supabase, data.id)
  return data
}

export async function updateRun(supabase, runId, patch) {
  const { data, error } = await supabase
    .from('sim_runs')
    .update(patch)
    .eq('id', runId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function clearRunItems(supabase, runId) {
  const { error } = await supabase.from('sim_run_items').delete().eq('sim_run_id', runId)
  if (error) throw error
}

export async function replaceRunItems(supabase, runId, upgrades = []) {
  await clearRunItems(supabase, runId)

  if (!upgrades.length) return

  const rows = upgrades.map((item) => ({
    sim_run_id: runId,
    item_id: item.itemId ?? item.item_id ?? null,
    item_name: item.itemName ?? item.item_name ?? item.name ?? 'Unknown Item',
    slot: item.slot ?? '',
    item_level: item.itemLevel ?? item.item_level ?? null,
    dps_delta: item.dpsDelta ?? item.dps_delta ?? 0,
    dps_pct: item.dpsPct ?? item.dps_pct ?? 0,
    source_type: item.sourceType ?? item.source_type ?? null,
    source_id: item.sourceId ?? item.source_id ?? null,
    source_name: item.sourceName ?? item.source_name ?? item.source ?? null,
    difficulty: item.difficulty ?? null,
  }))

  const { error } = await supabase.from('sim_run_items').insert(rows)
  if (error) throw error
}

export async function loadLatestRunsForScenario(supabase, scenario, runDate = null) {
  let query = supabase
    .from('sim_runs')
    .select('id, character_name, scenario, run_date, status, trigger_kind, workflow_run_id, attempt_count, next_retry_at, started_at, completed_at, error_message, report_url, base_dps, difficulty')
    .eq('scenario', scenario)
    .order('run_date', { ascending: false })
    .order('started_at', { ascending: false })

  if (runDate) query = query.eq('run_date', runDate)

  const { data, error } = await query.limit(200)
  if (error) throw error
  return data ?? []
}

export async function loadLatestRunsForCharacters(supabase, scenario, characterNames = []) {
  let query = supabase
    .from('sim_runs')
    .select('id, character_name, scenario, run_date, status, trigger_kind, workflow_run_id, attempt_count, next_retry_at, started_at, completed_at, error_message, report_url, base_dps, difficulty')
    .eq('scenario', scenario)
    .order('run_date', { ascending: false })
    .order('started_at', { ascending: false })

  if (characterNames.length > 0) {
    query = query.in('character_name', characterNames)
  }

  const { data, error } = await query.limit(200)
  if (error) throw error
  return data ?? []
}

export function latestRunByCharacter(runs = []) {
  const lookup = new Map()

  for (const run of runs) {
    const key = normalizeName(run?.character_name)
    if (!key || lookup.has(key)) continue
    lookup.set(key, run)
  }

  return lookup
}
