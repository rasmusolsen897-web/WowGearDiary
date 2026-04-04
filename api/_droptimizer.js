import { getSupabase, isConfigured } from './_supabase.js'

export const DROPTIMIZER_SCENARIOS = {
  raid_heroic: {
    key: 'raid_heroic',
    label: 'Heroic Raid',
    sourceType: 'raid_boss',
    sourceLabel: 'Boss',
    difficulty: 'raid-heroic',
    reportName: 'Droptimizer • Season 1 Raids • Heroic',
    envVar: 'RAIDBOTS_DROPTIMIZER_RAID_JSON',
    defaults: {
      difficulty: 'heroic',
      raidDifficulty: 'heroic',
      instances: [1307, 1308],
    },
  },
  mythic_plus_all: {
    key: 'mythic_plus_all',
    label: 'Mythic+',
    sourceType: 'mythic_plus_dungeon',
    sourceLabel: 'Dungeon',
    difficulty: 'mythic-plus',
    reportName: 'Droptimizer • Mythic+ Dungeons • Mythic 10',
    envVar: 'RAIDBOTS_DROPTIMIZER_MYTHIC_PLUS_JSON',
    defaults: {
      allDungeons: true,
      mythicPlusAll: true,
      keystoneLevel: 10,
    },
  },
}

const exactPayloadCache = new Map()
const jsonEnvCache = new Map()
const jsonEnvWarningCache = new Map()

function normalizeCharacterName(name) {
  return String(name ?? '').trim().toLowerCase()
}

function warnJsonEnv(name, sourceKey, message) {
  const signature = `${sourceKey}:${message}`
  if (jsonEnvWarningCache.get(name) === signature) return
  jsonEnvWarningCache.set(name, signature)
  console.warn(`[droptimizer env ${name}] ${message}`)
}

function readChunkedJsonEnv(name) {
  const prefix = `${name}_PART_`
  const parts = Object.entries(process.env)
    .filter(([key, value]) => key.startsWith(prefix) && value)
    .map(([key, value]) => ({
      value,
      index: Number.parseInt(key.slice(prefix.length), 10),
    }))
    .filter((part) => Number.isInteger(part.index) && part.index > 0)
    .sort((left, right) => left.index - right.index)

  if (!parts.length) return null

  const expectedIndexes = parts.map((_, index) => index + 1)
  const hasGap = parts.some((part, index) => part.index !== expectedIndexes[index])
  if (hasGap) {
    warnJsonEnv(
      name,
      'parts',
      `Ignoring chunked override because ${name}_PART_n entries must start at 1 and be contiguous.`,
    )
    return null
  }

  return {
    raw: parts.map((part) => part.value).join(''),
    sourceKey: `parts:${parts.length}`,
  }
}

function resolveJsonEnvSource(name) {
  const chunked = readChunkedJsonEnv(name)
  if (chunked) return chunked

  const raw = process.env[name]
  if (!raw) return null

  return {
    raw,
    sourceKey: 'single',
  }
}

function readJsonEnv(name) {
  const source = resolveJsonEnvSource(name)
  if (!source) {
    jsonEnvCache.delete(name)
    return null
  }

  const cached = jsonEnvCache.get(name)
  if (cached && cached.raw === source.raw && cached.sourceKey === source.sourceKey) {
    return cached.value
  }

  try {
    const value = JSON.parse(source.raw)
    jsonEnvCache.set(name, {
      raw: source.raw,
      sourceKey: source.sourceKey,
      value,
    })
    return value
  } catch (error) {
    const truncationHint = source.sourceKey === 'single' && source.raw.length >= 8192
      ? ` The value looks truncated near 8192 characters; split it across ${name}_PART_1, ${name}_PART_2, and so on instead of a single env var.`
      : ''
    warnJsonEnv(
      name,
      source.sourceKey,
      `Ignoring invalid optional JSON override: ${error.message}.${truncationHint}`,
    )
    jsonEnvCache.set(name, {
      raw: source.raw,
      sourceKey: source.sourceKey,
      value: null,
    })
    return null
  }
}

export function isExactDroptimizerPayload(payload) {
  return !!(
    payload
    && payload.droptimizer
    && typeof payload.droptimizer === 'object'
    && payload.character
    && Array.isArray(payload.droptimizerItems)
  )
}

function stripActorSpecificFields(payload) {
  if (!payload || typeof payload !== 'object') return {}

  const {
    armory: _armory,
    character: _character,
    type: _type,
    reportName: _reportName,
    baseActorName: _baseActorName,
    spec: _spec,
    gearsets: _gearsets,
    talents: _talents,
    talentSets: _talentSets,
    ...rest
  } = payload

  if (rest.droptimizer && typeof rest.droptimizer === 'object') {
    const nestedDroptimizer = { ...rest.droptimizer }
    delete nestedDroptimizer.equipped
    delete nestedDroptimizer.classId
    delete nestedDroptimizer.specId
    delete nestedDroptimizer.lootSpecId
    delete nestedDroptimizer.faction
    rest.droptimizer = nestedDroptimizer
  }

  return rest
}

function exactPayloadCacheKey(scenarioKey, name) {
  return `${scenarioKey}:${normalizeCharacterName(name)}`
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function readStoredExactPayload(scenarioKey, name) {
  const cacheKey = exactPayloadCacheKey(scenarioKey, name)
  if (exactPayloadCache.has(cacheKey)) return exactPayloadCache.get(cacheKey)
  if (!isConfigured()) {
    exactPayloadCache.set(cacheKey, null)
    return null
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('droptimizer_payloads')
      .select('payload')
      .eq('character_name', name)
      .eq('scenario', scenarioKey)
      .maybeSingle()

    if (error) {
      console.error(`[droptimizer payload ${scenarioKey}/${name}]`, error.message)
      exactPayloadCache.set(cacheKey, null)
      return null
    }

    const payload = isExactDroptimizerPayload(data?.payload) ? data.payload : null
    exactPayloadCache.set(cacheKey, payload)
    return payload
  } catch (error) {
    console.error(`[droptimizer payload ${scenarioKey}/${name}]`, error.message)
    exactPayloadCache.set(cacheKey, null)
    return null
  }
}

async function readReusableExactPayload(scenarioKey, scenario) {
  const candidates = Array.isArray(scenario?.exactPayloadCharacters)
    ? scenario.exactPayloadCharacters
    : []

  for (const candidate of candidates) {
    const payload = await readStoredExactPayload(scenarioKey, candidate)
    if (payload) return payload
  }

  return null
}

export function mergeScenarioPayloadTemplate(templatePayload, overridePayload) {
  const merged = {
    ...(templatePayload ?? {}),
    ...(overridePayload ?? {}),
  }

  if (isPlainObject(templatePayload?.armory) || isPlainObject(overridePayload?.armory)) {
    merged.armory = {
      ...(isPlainObject(templatePayload?.armory) ? templatePayload.armory : {}),
      ...(isPlainObject(overridePayload?.armory) ? overridePayload.armory : {}),
    }
  }

  if (isPlainObject(templatePayload?.droptimizer) || isPlainObject(overridePayload?.droptimizer)) {
    merged.droptimizer = {
      ...(isPlainObject(templatePayload?.droptimizer) ? templatePayload.droptimizer : {}),
      ...(isPlainObject(overridePayload?.droptimizer) ? overridePayload.droptimizer : {}),
    }
  }

  return merged
}

function toTitleCase(input) {
  return String(input ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function normalizeSlot(slot) {
  const raw = String(slot ?? '').toLowerCase()
  const map = {
    head: 'Head',
    neck: 'Neck',
    shoulder: 'Shoulder',
    back: 'Back',
    chest: 'Chest',
    wrist: 'Wrist',
    hands: 'Hands',
    waist: 'Waist',
    legs: 'Legs',
    feet: 'Feet',
    finger1: 'Ring 1',
    finger2: 'Ring 2',
    trinket1: 'Trinket 1',
    trinket2: 'Trinket 2',
    mainhand: 'Weapon',
    main_hand: 'Weapon',
    offhand: 'Off-Hand',
    off_hand: 'Off-Hand',
    ranged: 'Ranged',
  }

  return map[raw] ?? toTitleCase(raw)
}

function parseCSVLine(line) {
  return line.split(',').map((cell) => cell.trim())
}

function parseCSV(text) {
  return text.trim().split('\n').map(parseCSVLine)
}

function extractNameMap(node, state = { itemNames: new Map(), sourceNames: new Map() }) {
  if (!node || typeof node !== 'object') return state

  if (Array.isArray(node)) {
    for (const item of node) extractNameMap(item, state)
    return state
  }

  const itemId = node.itemId ?? node.item_id ?? node.id
  const itemName = node.itemName ?? node.item_name ?? node.name
  if (itemId && itemName && (node.slot || node.itemLevel || node.item_level || node.bonusId)) {
    state.itemNames.set(String(itemId), itemName)
  }

  const raidBossId = node.encounterNpcId ?? node.encounter_npc_id ?? node.bossId
  const raidBossName = node.encounterName ?? node.encounter_name ?? node.bossName
  if (raidBossId && raidBossName) {
    state.sourceNames.set(`raid_boss:${raidBossId}`, raidBossName)
  }

  const dungeonId = node.dungeonId ?? node.dungeon_id ?? node.mapId ?? node.instanceId
  const dungeonName = node.dungeonName ?? node.dungeon_name ?? node.instanceName ?? node.mapName
  if (dungeonId && dungeonName) {
    state.sourceNames.set(`mythic_plus_dungeon:${dungeonId}`, dungeonName)
  }

  const sourceId = node.sourceId ?? node.source_id
  const sourceName = node.sourceName ?? node.source_name
  const sourceType = node.sourceType ?? node.source_type
  if (sourceId && sourceName && sourceType) {
    state.sourceNames.set(`${sourceType}:${sourceId}`, sourceName)
  }

  for (const value of Object.values(node)) {
    extractNameMap(value, state)
  }

  return state
}

function buildEnvLookupMaps() {
  const itemLookup = readJsonEnv('RAIDBOTS_ITEM_LOOKUP_JSON') ?? {}
  const sourceLookup = readJsonEnv('RAIDBOTS_SOURCE_LOOKUP_JSON') ?? {}
  const itemNames = new Map(Object.entries(itemLookup).map(([key, value]) => [String(key), value]))
  const sourceNames = new Map()

  for (const [sourceType, values] of Object.entries(sourceLookup)) {
    if (!values || typeof values !== 'object') continue
    for (const [key, value] of Object.entries(values)) {
      sourceNames.set(`${sourceType}:${key}`, value)
    }
  }

  return { itemNames, sourceNames }
}

function buildCombinedMaps(reportJson) {
  const envMaps = buildEnvLookupMaps()
  const reportMaps = extractNameMap(reportJson)

  for (const [key, value] of reportMaps.itemNames.entries()) {
    if (!envMaps.itemNames.has(key)) envMaps.itemNames.set(key, value)
  }
  for (const [key, value] of reportMaps.sourceNames.entries()) {
    if (!envMaps.sourceNames.has(key)) envMaps.sourceNames.set(key, value)
  }

  return envMaps
}

function inferSourceType(difficulty) {
  if (difficulty.startsWith('raid-')) return 'raid_boss'
  if (difficulty.startsWith('mythic-plus')) return 'mythic_plus_dungeon'
  return 'source'
}

function fallbackSourceName(sourceType, sourceId) {
  if (sourceType === 'raid_boss') return sourceId ? `Boss #${sourceId}` : 'Unknown Boss'
  if (sourceType === 'mythic_plus_dungeon') return sourceId ? `Dungeon #${sourceId}` : 'Unknown Dungeon'
  return sourceId ? `Source #${sourceId}` : 'Unknown Source'
}

function parseSimToken(token) {
  const parts = String(token ?? '').split('/')
  const difficultyIndex = parts.findIndex((part) => /^(raid-|mythic-plus|world-boss|pvp|vault)/i.test(part))
  const difficulty = difficultyIndex >= 0 ? parts[difficultyIndex] : ''
  const sourceType = inferSourceType(difficulty)

  const containerId = difficultyIndex > 0 ? parts[0] : ''
  const encounterId = difficultyIndex > 1 ? parts[1] : ''
  const itemId = difficultyIndex >= 0 ? parseInt(parts[difficultyIndex + 1], 10) || 0 : 0
  const itemLevel = difficultyIndex >= 0 ? parseInt(parts[difficultyIndex + 2], 10) || 0 : 0
  const bonusId = difficultyIndex >= 0 ? parts[difficultyIndex + 3] ?? '' : ''
  const slot = parts.find((part) => /^[a-z_0-9]+$/i.test(part) && /head|neck|shoulder|back|chest|wrist|hands|waist|legs|feet|finger|trinket|main|off|ranged/i.test(part)) ?? ''

  const sourceId = sourceType === 'raid_boss'
    ? (encounterId || containerId || '')
    : (containerId || encounterId || '')

  return {
    rawToken: token,
    difficulty,
    sourceType,
    sourceId: String(sourceId || ''),
    containerId: String(containerId || ''),
    encounterId: String(encounterId || ''),
    itemId,
    itemLevel,
    bonusId,
    slot: normalizeSlot(slot),
  }
}

export function parseDroptimizerReport(csvText, reportJson = null) {
  const [_header, ...dataRows] = parseCSV(csvText)
  const baselineRow = dataRows.find((row) => !row[0]?.includes('/'))
  const itemRows = dataRows.filter((row) => row[0]?.includes('/'))
  const maps = buildCombinedMaps(reportJson)

  const characterName = baselineRow?.[0] ?? null
  const baseDps = Math.round(parseFloat(baselineRow?.[1] ?? '0') || 0)
  const difficulty = itemRows[0]?.[0]?.split('/').find((part) => /^(raid-|mythic-plus|world-boss|pvp|vault)/i.test(part)) ?? null

  const upgrades = itemRows
    .map((row) => {
      const parsed = parseSimToken(row[0])
      const dps = parseFloat(row[1]) || 0
      const dpsDelta = Math.round(dps - baseDps)
      const dpsPct = baseDps > 0 ? Math.round((dpsDelta / baseDps) * 10000) / 100 : 0
      const itemName = maps.itemNames.get(String(parsed.itemId)) ?? `Item ${parsed.itemId}`
      const sourceKey = `${parsed.sourceType}:${parsed.sourceId}`
      const sourceName = maps.sourceNames.get(sourceKey) ?? fallbackSourceName(parsed.sourceType, parsed.sourceId)

      return {
        itemId: parsed.itemId,
        itemName,
        name: itemName,
        slot: parsed.slot,
        itemLevel: parsed.itemLevel,
        dpsDelta,
        dpsPct,
        source: sourceName,
        sourceType: parsed.sourceType,
        sourceId: parsed.sourceId || null,
        sourceName,
        rawSourceToken: parsed.rawToken,
        rawContainerId: parsed.containerId || null,
        rawEncounterId: parsed.encounterId || null,
        difficulty: parsed.difficulty || difficulty,
        bonusId: parsed.bonusId || null,
      }
    })
    .sort((a, b) => b.dpsDelta - a.dpsDelta)

  return {
    type: 'droptimizer',
    characterName,
    spec: null,
    baseDps,
    difficulty,
    upgrades,
  }
}

export function buildPriorityGroups(upgrades, scenarioKey) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  if (!scenario || !Array.isArray(upgrades)) return []

  const groups = new Map()

  for (const item of upgrades) {
    const sourceId = item.sourceId ?? item.source_id ?? ''
    const sourceName = item.sourceName ?? item.source_name ?? item.source ?? fallbackSourceName(scenario.sourceType, sourceId)
    const key = `${item.sourceType ?? scenario.sourceType}:${sourceId || sourceName}`
    const normalized = {
      itemId: item.itemId ?? item.item_id ?? null,
      itemName: item.itemName ?? item.item_name ?? item.name ?? 'Unknown Item',
      slot: normalizeSlot(item.slot),
      itemLevel: item.itemLevel ?? item.item_level ?? null,
      dpsDelta: item.dpsDelta ?? item.dps_delta ?? 0,
      dpsPct: item.dpsPct ?? item.dps_pct ?? 0,
    }

    if (!groups.has(key)) {
      groups.set(key, {
        sourceType: item.sourceType ?? item.source_type ?? scenario.sourceType,
        sourceId: sourceId || null,
        sourceName,
        bestDrop: normalized.dpsDelta,
        averageGain: normalized.dpsDelta,
        topItems: [normalized],
      })
      continue
    }

    const existing = groups.get(key)
    existing.topItems.push(normalized)
    existing.bestDrop = Math.max(existing.bestDrop, normalized.dpsDelta)
    existing.averageGain = existing.topItems.reduce((sum, row) => sum + Math.max(row.dpsDelta, 0), 0) / existing.topItems.length
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      topItems: group.topItems
        .sort((a, b) => b.dpsDelta - a.dpsDelta)
        .slice(0, 3),
      averageGain: Math.round(group.averageGain),
    }))
    .sort((a, b) => {
      if (b.bestDrop !== a.bestDrop) return b.bestDrop - a.bestDrop
      return b.averageGain - a.averageGain
    })
}

export async function buildScenarioPayload(scenarioKey, { name, realm, region }) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  if (!scenario) throw new Error(`Unknown Droptimizer scenario: ${scenarioKey}`)

  const storedPayload = await readStoredExactPayload(scenarioKey, name)
  const envPayload = readJsonEnv(scenario.envVar) ?? {}
  if (storedPayload) {
    return storedPayload
  }

  if (exactPayloadAllowed && isExactDroptimizerPayload(envPayload)) {
    return envPayload
  }

  const reusableExactPayload = isExactDroptimizerPayload(envPayload)
    ? envPayload
    : await readReusableExactPayload(scenarioKey, scenario)
  const reusableTemplatePayload = isExactDroptimizerPayload(reusableExactPayload)
    ? stripActorSpecificFields(reusableExactPayload)
    : {}
  const envOverridePayload = isExactDroptimizerPayload(envPayload)
    ? stripActorSpecificFields(envPayload)
    : envPayload
  const mergedPayload = mergeScenarioPayloadTemplate(reusableTemplatePayload, envOverridePayload)
  const envArmory = mergedPayload.armory && typeof mergedPayload.armory === 'object'
    ? mergedPayload.armory
    : {}

  return {
    ...scenario.defaults,
    ...mergedPayload,
    reportName: mergedPayload.reportName ?? scenario.reportName,
    baseActorName: mergedPayload.baseActorName ?? name,
    armory: {
      ...envArmory,
      region,
      realm,
      name,
    },
    region,
    realm,
    name,
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function extractReportId(input) {
  if (!input) return null
  const match = String(input).match(/report\/([A-Za-z0-9]+)/)
  return match ? match[1] : String(input).trim() || null
}

export function buildScenarioResponse(scenarioKey, latestRun, latestCompletedRun, items) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  if (!scenario) return null

  const upgrades = Array.isArray(items)
    ? items
        .map((item) => ({
          itemId: item.item_id ?? item.itemId ?? null,
          itemName: item.item_name ?? item.itemName ?? item.name ?? 'Unknown Item',
          name: item.item_name ?? item.itemName ?? item.name ?? 'Unknown Item',
          slot: normalizeSlot(item.slot),
          itemLevel: item.item_level ?? item.itemLevel ?? null,
          dpsDelta: item.dps_delta ?? item.dpsDelta ?? 0,
          dpsPct: item.dps_pct ?? item.dpsPct ?? 0,
          sourceType: item.source_type ?? item.sourceType ?? scenario.sourceType,
          sourceId: item.source_id ?? item.sourceId ?? null,
          sourceName: item.source_name ?? item.sourceName ?? item.source ?? fallbackSourceName(scenario.sourceType, item.source_id ?? item.sourceId),
          source: item.source_name ?? item.sourceName ?? item.source ?? fallbackSourceName(scenario.sourceType, item.source_id ?? item.sourceId),
        }))
        .sort((a, b) => b.dpsDelta - a.dpsDelta)
    : []

  return {
    scenario: scenarioKey,
    label: scenario.label,
    sourceLabel: scenario.sourceLabel,
    status: latestRun?.status ?? 'idle',
    startedAt: latestRun?.started_at ?? latestRun?.startedAt ?? null,
    completedAt: latestCompletedRun?.completed_at ?? latestCompletedRun?.completedAt ?? null,
    lastError: latestRun?.error_message ?? latestRun?.errorMessage ?? null,
    attemptCount: latestRun?.attempt_count ?? latestRun?.attemptCount ?? 0,
    nextRetryAt: latestRun?.next_retry_at ?? latestRun?.nextRetryAt ?? null,
    baseDps: latestCompletedRun?.base_dps ?? latestCompletedRun?.baseDps ?? 0,
    reportUrl: latestCompletedRun?.report_url ?? latestCompletedRun?.reportUrl ?? null,
    difficulty: latestCompletedRun?.difficulty ?? scenario.difficulty,
    upgrades,
    priorities: buildPriorityGroups(upgrades, scenarioKey),
  }
}
