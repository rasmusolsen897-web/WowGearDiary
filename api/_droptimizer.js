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

function readJsonEnv(name) {
  const raw = process.env[name]
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error(`[droptimizer env ${name}]`, error.message)
    return null
  }
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

export function buildScenarioPayload(scenarioKey, { name, realm, region }) {
  const scenario = DROPTIMIZER_SCENARIOS[scenarioKey]
  if (!scenario) throw new Error(`Unknown Droptimizer scenario: ${scenarioKey}`)

  const envPayload = readJsonEnv(scenario.envVar) ?? {}
  const hasExactDroptimizer = envPayload.droptimizer && typeof envPayload.droptimizer === 'object'
  const basePayload = hasExactDroptimizer
    ? envPayload
    : {
        ...scenario.defaults,
        ...envPayload,
      }
  const envArmory = envPayload.armory && typeof envPayload.armory === 'object'
    ? envPayload.armory
    : {}

  return {
    ...basePayload,
    reportName: envPayload.reportName ?? scenario.reportName,
    baseActorName: envPayload.baseActorName ?? name,
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
    completedAt: latestCompletedRun?.completed_at ?? latestCompletedRun?.completedAt ?? null,
    lastError: latestRun?.error_message ?? latestRun?.errorMessage ?? null,
    baseDps: latestCompletedRun?.base_dps ?? latestCompletedRun?.baseDps ?? 0,
    reportUrl: latestCompletedRun?.report_url ?? latestCompletedRun?.reportUrl ?? null,
    difficulty: latestCompletedRun?.difficulty ?? scenario.difficulty,
    upgrades,
    priorities: buildPriorityGroups(upgrades, scenarioKey),
  }
}
