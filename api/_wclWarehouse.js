import { fetchWCLGraphQL } from './_wcl.js'

const DEFAULT_TIME_ZONE = 'Europe/Copenhagen'

function normalizeText(value) {
  return String(value ?? '').normalize('NFC').trim()
}

function normalizeSlugPart(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeRegion(region) {
  return normalizeSlugPart(region) || null
}

function toIso(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()

  const raw = typeof value === 'string' ? Number(value) : value
  if (Number.isFinite(raw)) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function toDateOnly(value, timeZone = DEFAULT_TIME_ZONE) {
  const iso = toIso(value)
  if (!iso) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function average(values = []) {
  const numbers = values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
  if (!numbers.length) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function compact(value) {
  return value == null || value === '' ? null : value
}

function groupBy(array = [], keyFn) {
  const map = new Map()
  for (const item of array) {
    const key = keyFn(item)
    if (key == null) continue
    const bucket = map.get(key) ?? []
    bucket.push(item)
    map.set(key, bucket)
  }
  return map
}

export function normalizeWclReportCode(input) {
  const text = normalizeText(input)
  if (!text) return null
  const match = text.match(/\/reports\/([A-Za-z0-9]+)/i)
  return (match?.[1] ?? text).trim() || null
}

export function normalizeWclRealmSlug(realm) {
  return normalizeSlugPart(realm) || null
}

export function normalizeWclActorKey(actor = {}, fallback = {}) {
  const region = normalizeRegion(actor.region ?? fallback.region)
  const realm = normalizeWclRealmSlug(actor.realm ?? actor.server ?? fallback.realm)
  const name = normalizeSlugPart(actor.name ?? fallback.name)
  if (!name) return null
  if (region && realm) return `${region}:${realm}:${name}`
  if (realm) return `${realm}:${name}`
  return name
}

function makePlayerLookup(actors = []) {
  const lookup = new Map()
  for (const actor of actors) {
    if (actor && actor.type === 'Player') lookup.set(actor.id, actor)
  }
  return lookup
}

function normalizeRankingRows(rawRows = [], fight = {}, report = {}) {
  const rows = Array.isArray(rawRows)
    ? rawRows
    : Array.isArray(rawRows?.rankings)
      ? rawRows.rankings
      : Array.isArray(rawRows?.data)
        ? rawRows.data
        : []

  return rows
    .map((row) => {
      const actor = row?.actor ?? row?.player ?? row?.character ?? row?.source ?? {}
      const name = normalizeText(actor?.name ?? row?.name)
      if (!name) return null

      const realm = normalizeText(actor?.server ?? actor?.realm ?? row?.realm ?? report?.guild?.server ?? report?.guild?.realm)
      const region = normalizeText(actor?.region ?? row?.region ?? report?.region?.code ?? report?.region?.name)
      return {
        actor_id: actor?.id ?? row?.actorId ?? row?.actorID ?? null,
        actor_key: normalizeWclActorKey({ name, realm, region }),
        actor_name: name,
        actor_realm: compact(normalizeWclRealmSlug(realm)),
        actor_region: compact(normalizeRegion(region)),
        class_name: compact(normalizeText(actor?.class ?? row?.class ?? row?.specClass)),
        spec_name: compact(normalizeText(actor?.spec ?? actor?.subType ?? row?.spec ?? row?.subType)),
        role: compact(normalizeText(actor?.role ?? row?.role)),
        parse_percent: Number.isFinite(Number(row?.rankPercent ?? row?.parsePercent ?? row?.percent ?? row?.rank_percent))
          ? Number(row.rankPercent ?? row.parsePercent ?? row.percent ?? row.rank_percent)
          : null,
        dps: Number.isFinite(Number(row?.dps ?? row?.dpsAmount ?? row?.value)) ? Number(row.dps ?? row.dpsAmount ?? row.value) : null,
        item_level: Number.isFinite(Number(row?.itemLevel ?? row?.item_level ?? row?.ilvl))
          ? Number(row.itemLevel ?? row.item_level ?? row.ilvl)
          : null,
        fight_id: fight?.id ?? null,
      }
    })
    .filter((row) => row && row.actor_key)
}

function normalizeLootEvent(event = {}, context = {}) {
  const actor = event?.actor ?? event?.player ?? event?.source ?? {}
  const name = normalizeText(actor?.name ?? event?.actorName ?? event?.playerName ?? event?.name)
  if (!name) return null

  return {
    event_uid: normalizeText(event?.eventUid ?? event?.uid ?? `${context.reportCode}:${context.fight?.id ?? 'fight'}:${event?.itemId ?? event?.item?.id ?? event?.itemName ?? name}`),
    report_code: context.reportCode,
    fight_id: context.fight?.id ?? event?.fightId ?? null,
    actor_key: normalizeWclActorKey({
      name,
      realm: actor?.server ?? actor?.realm ?? context.report?.guild?.server ?? context.report?.guild?.realm,
      region: actor?.region ?? context.report?.region?.code ?? context.report?.region?.name,
    }),
    actor_name: name,
    item_id: event?.itemId ?? event?.item?.id ?? null,
    item_name: normalizeText(event?.itemName ?? event?.item?.name ?? event?.name) || null,
    item_level: Number.isFinite(Number(event?.itemLevel ?? event?.item?.level)) ? Number(event.itemLevel ?? event.item?.level) : null,
    quality: compact(normalizeText(event?.quality ?? event?.rarity ?? event?.item?.quality)),
    encounter_name: compact(normalizeText(event?.encounterName ?? context.fight?.name ?? context.report?.zone?.name)),
    occurred_at: toIso(event?.occurredAt ?? event?.timestamp ?? context.occurredAt),
    is_tier: Boolean(event?.isTier ?? event?.tier),
  }
}

function flattenLootLikeEvents(raw, context) {
  const rows = []
  const queue = [raw]

  while (queue.length) {
    const value = queue.shift()
    if (!value) continue
    if (Array.isArray(value)) {
      queue.unshift(...value)
      continue
    }
    if (typeof value !== 'object') continue
    if (Array.isArray(value.data)) {
      queue.unshift(...value.data)
      continue
    }

    const type = normalizeText(value.type ?? value.eventType ?? value.event).toLowerCase()
    const hasItem = value.item || value.itemId || value.itemName || value.lootItem
    if (type.includes('loot') || hasItem) {
      const row = normalizeLootEvent(value, context)
      if (row) rows.push(row)
    }
    if (Array.isArray(value.events)) queue.unshift(...value.events)
    if (Array.isArray(value.entries)) queue.unshift(...value.entries)
  }

  return rows
}

function buildPlayerRows(reportCode, actors = [], report = {}) {
  return (Array.isArray(actors) ? actors : [])
    .filter((actor) => actor && actor.type === 'Player')
    .map((actor) => {
      const realm = normalizeText(actor.server ?? actor.realm)
      return {
        report_code: reportCode,
        actor_id: actor.id ?? null,
        actor_key: normalizeWclActorKey({
          name: actor.name,
          realm,
          region: report?.region?.code ?? report?.region?.name,
        }),
        actor_name: normalizeText(actor.name),
        actor_realm: compact(normalizeWclRealmSlug(realm)),
        actor_region: compact(normalizeRegion(report?.region?.code ?? report?.region?.name)),
        class_name: compact(normalizeText(actor.class ?? actor.subType)),
        spec_name: compact(normalizeText(actor.subType)),
        role: compact(normalizeText(actor.role)),
        game_id: actor.gameID ?? null,
        pet_owner: actor.petOwner ?? null,
      }
    })
    .filter((row) => row.actor_key)
}

function buildFightRows(reportCode, fights = [], report = {}, raidNightDate) {
  return (Array.isArray(fights) ? fights : [])
    .map((fight) => {
      if (fight?.id == null) return null
      return {
        report_code: reportCode,
        fight_id: fight.id,
        encounter_id: fight.encounterID ?? null,
        encounter_name: normalizeText(fight.name) || 'Unknown',
        difficulty: fight.difficulty ?? null,
        kill: Boolean(fight.kill),
        size: fight.size ?? null,
        start_time: toIso(fight.startTime),
        end_time: toIso(fight.endTime),
        average_item_level: fight.averageItemLevel ?? null,
        boss_percentage: fight.bossPercentage ?? null,
        fight_percentage: fight.fightPercentage ?? null,
        complete_raid: Boolean(fight.completeRaid),
        in_progress: Boolean(fight.inProgress),
        wipe_called_time: toIso(fight.wipeCalledTime),
        raid_night_date: raidNightDate ?? toDateOnly(fight.startTime ?? report.startTime),
      }
    })
    .filter(Boolean)
}

function buildFightPlayerRows(reportCode, fights = [], playerLookup = new Map(), rankingsByFightId = {}, report = {}, raidNightDate) {
  const rows = []
  for (const fight of fights) {
    if (fight?.id == null) continue
    const rankingRows = normalizeRankingRows(rankingsByFightId[fight.id], fight, report)
    if (rankingRows.length) {
      for (const row of rankingRows) {
        rows.push({
          report_code: reportCode,
          fight_id: fight.id,
          actor_key: row.actor_key,
          actor_id: row.actor_id,
          actor_name: row.actor_name,
          actor_realm: row.actor_realm,
          actor_region: row.actor_region,
          class_name: row.class_name,
          spec_name: row.spec_name,
          role: row.role,
          parse_percent: row.parse_percent,
          dps: row.dps,
          item_level: row.item_level,
          kill: Boolean(fight.kill),
          raid_night_date: raidNightDate ?? toDateOnly(fight.startTime ?? report.startTime),
        })
      }
      continue
    }

    for (const actorId of Array.isArray(fight.friendlyPlayers) ? fight.friendlyPlayers : []) {
      const actor = playerLookup.get(actorId)
      const actorKey = normalizeWclActorKey({
        name: actor?.name,
        realm: actor?.server,
        region: report?.region?.code ?? report?.region?.name,
      })
      if (!actorKey) continue
      rows.push({
        report_code: reportCode,
        fight_id: fight.id,
        actor_key: actorKey,
        actor_id: actorId,
        actor_name: normalizeText(actor?.name) || null,
        actor_realm: compact(normalizeWclRealmSlug(actor?.server)),
        actor_region: compact(normalizeRegion(report?.region?.code ?? report?.region?.name)),
        class_name: compact(normalizeText(actor?.subType)),
        spec_name: compact(normalizeText(actor?.subType)),
        role: null,
        parse_percent: null,
        dps: null,
        item_level: null,
        kill: Boolean(fight.kill),
        raid_night_date: raidNightDate ?? toDateOnly(fight.startTime ?? report.startTime),
      })
    }
  }
  return rows
}

function buildProgressRows(reportCode, fights = []) {
  const byEncounter = new Map()
  for (const fight of fights) {
    const encounterId = fight?.encounter_id ?? null
    const encounterName = normalizeText(fight.encounter_name) || 'Unknown'
    const key = `${encounterId ?? encounterName}:${encounterName}`
    const existing = byEncounter.get(key) ?? {
      report_code: reportCode,
      encounter_id: encounterId,
      encounter_name: encounterName,
      pulls: 0,
      kills: 0,
      best_wipe_percent: null,
      best_percent: null,
      last_raid_night_date: fight.raid_night_date ?? null,
    }

    existing.pulls += 1
    existing.best_percent = Math.max(existing.best_percent ?? 0, Number(fight.boss_percentage ?? fight.fight_percentage ?? 0))
    if (fight.kill) {
      existing.kills += 1
    } else if (fight.boss_percentage != null) {
      existing.best_wipe_percent = existing.best_wipe_percent == null
        ? Number(fight.boss_percentage)
        : Math.max(existing.best_wipe_percent, Number(fight.boss_percentage))
    }
    if (fight.raid_night_date && (!existing.last_raid_night_date || fight.raid_night_date > existing.last_raid_night_date)) {
      existing.last_raid_night_date = fight.raid_night_date
    }
    byEncounter.set(key, existing)
  }

  return Array.from(byEncounter.values()).sort((left, right) => {
    if (right.kills !== left.kills) return right.kills - left.kills
    if (right.pulls !== left.pulls) return right.pulls - left.pulls
    return left.encounter_name.localeCompare(right.encounter_name)
  })
}

function buildSummary(reportRow, fightRows, playerRows, lootEvents) {
  return {
    fight_count: fightRows.length,
    player_count: playerRows.length,
    kill_count: fightRows.filter((fight) => fight.kill).length,
    loot_count: lootEvents.length,
    raid_night_date: reportRow.raid_night_date,
    imported_at: reportRow.imported_at,
  }
}

export function buildWclWarehouseDocument(reportCode, reportNode, options = {}) {
  const report = reportNode ?? {}
  const fights = Array.isArray(report.fights) ? report.fights : []
  const actors = Array.isArray(report.masterData?.actors) ? report.masterData.actors : []
  const playerLookup = makePlayerLookup(actors)
  const raidNightDate = options.raidNightDate ?? toDateOnly(report.startTime)
  const fightRows = buildFightRows(reportCode, fights, report, raidNightDate)
  const playerRows = buildPlayerRows(reportCode, actors, report)
  const fightPlayerRows = buildFightPlayerRows(
    reportCode,
    fights,
    playerLookup,
    options.fightRankingsByFightId ?? {},
    report,
    raidNightDate,
  )
  const lootEvents = Array.isArray(options.lootEvents)
    ? options.lootEvents.map((event) => {
      if (event?.event_uid) {
        return {
          event_uid: normalizeText(event.event_uid),
          report_code: event.report_code ?? reportCode,
          fight_id: event.fight_id ?? event.fightId ?? null,
          actor_key: event.actor_key ?? null,
          actor_name: normalizeText(event.actor_name) || null,
          item_id: event.item_id ?? null,
          item_name: normalizeText(event.item_name) || null,
          item_level: event.item_level ?? null,
          quality: event.quality ?? null,
          encounter_name: normalizeText(event.encounter_name) || null,
          occurred_at: event.occurred_at ?? null,
          is_tier: Boolean(event.is_tier),
        }
      }

      return normalizeLootEvent(event, {
        reportCode,
        report,
        fight: fights.find((fight) => fight?.id === (event?.fightId ?? event?.fight_id)) ?? null,
        occurredAt: event?.occurredAt ?? event?.occurred_at ?? null,
      })
    }).filter(Boolean)
    : []

  const reportRow = {
    report_code: reportCode,
    source_url: options.sourceUrl ?? null,
    title: normalizeText(report.title) || null,
    visibility: normalizeText(report.visibility) || null,
    region: normalizeRegion(report.region?.name ?? report.region?.code ?? report.region),
    guild_name: normalizeText(report.guild?.name) || null,
    guild_server_slug: normalizeWclRealmSlug(report.guild?.server?.slug ?? report.guild?.server ?? report.guild?.realm ?? report.guild?.name),
    guild_server_region: normalizeRegion(
      report.guild?.server?.region?.slug
      ?? report.guild?.server?.region?.compactName
      ?? report.guild?.server?.region
      ?? report.region?.slug
      ?? report.region?.compactName
      ?? report.region?.name,
    ),
    owner_name: normalizeText(report.owner?.name) || null,
    zone_id: report.zone?.id ?? null,
    zone_name: normalizeText(report.zone?.name) || null,
    start_time: toIso(report.startTime),
    end_time: toIso(report.endTime),
    revision: report.revision ?? null,
    segments: report.segments ?? null,
    raid_night_date: raidNightDate,
    import_status: options.importStatus ?? 'ready',
    last_error: options.lastError ?? null,
    imported_at: options.importedAt ?? new Date().toISOString(),
    updated_at: options.updatedAt ?? new Date().toISOString(),
  }

  return {
    report: reportRow,
    fights: fightRows,
    players: playerRows,
    fightPlayers: fightPlayerRows,
    lootEvents,
    progression: buildProgressRows(reportCode, fightRows),
    summary: buildSummary(reportRow, fightRows, playerRows, lootEvents),
  }
}

function normalizeReportRows(reports = []) {
  return reports
    .filter((row) => row && (row.report_code ?? row.code))
    .map((row) => ({
      report_code: row.report_code ?? row.code,
      source_url: row.source_url ?? row.sourceUrl ?? null,
      title: row.title ?? null,
      guild_name: row.guild_name ?? null,
      guild_server_slug: row.guild_server_slug ?? null,
      guild_server_region: row.guild_server_region ?? null,
      zone_id: row.zone_id ?? null,
      zone_name: row.zone_name ?? null,
      start_time: row.start_time ?? null,
      end_time: row.end_time ?? null,
      raid_night_date: row.raid_night_date ?? null,
      import_status: row.import_status ?? row.status ?? 'ready',
      last_error: row.last_error ?? null,
      imported_at: row.imported_at ?? null,
      updated_at: row.updated_at ?? null,
    }))
}

function normalizeFightRows(fights = []) {
  return fights.map((fight) => ({
    report_code: fight.report_code,
    fight_id: fight.fight_id,
    encounter_id: fight.encounter_id ?? null,
    encounter_name: normalizeText(fight.encounter_name) || 'Unknown',
    difficulty: fight.difficulty ?? null,
    kill: Boolean(fight.kill),
    size: fight.size ?? null,
    start_time: fight.start_time ?? null,
    end_time: fight.end_time ?? null,
    average_item_level: fight.average_item_level ?? null,
    boss_percentage: fight.boss_percentage ?? null,
    fight_percentage: fight.fight_percentage ?? null,
    complete_raid: Boolean(fight.complete_raid),
    in_progress: Boolean(fight.in_progress),
    wipe_called_time: fight.wipe_called_time ?? null,
    raid_night_date: fight.raid_night_date ?? null,
  }))
}

function normalizePlayerRows(players = []) {
  return players.map((player) => ({
    report_code: player.report_code,
    actor_id: player.actor_id ?? null,
    actor_key: player.actor_key ?? null,
    actor_name: normalizeText(player.actor_name) || null,
    actor_realm: player.actor_realm ?? null,
    actor_region: player.actor_region ?? null,
    class_name: player.class_name ?? null,
    spec_name: player.spec_name ?? null,
    role: player.role ?? null,
    game_id: player.game_id ?? null,
    pet_owner: player.pet_owner ?? null,
  }))
}

function normalizeFightPlayerRows(rows = []) {
  return rows.map((row) => ({
    report_code: row.report_code,
    fight_id: row.fight_id,
    actor_key: row.actor_key,
    actor_id: row.actor_id ?? null,
    actor_name: normalizeText(row.actor_name) || null,
    actor_realm: row.actor_realm ?? null,
    actor_region: row.actor_region ?? null,
    class_name: row.class_name ?? null,
    spec_name: row.spec_name ?? null,
    role: row.role ?? null,
    parse_percent: row.parse_percent ?? null,
    dps: row.dps ?? null,
    item_level: row.item_level ?? null,
    kill: typeof row.kill === 'boolean' ? row.kill : null,
    raid_night_date: row.raid_night_date ?? null,
  }))
}

function normalizeLootRows(rows = []) {
  return rows.map((row) => ({
    event_uid: row.event_uid,
    report_code: row.report_code,
    fight_id: row.fight_id ?? null,
    actor_key: row.actor_key ?? null,
    actor_name: normalizeText(row.actor_name) || null,
    item_id: row.item_id ?? null,
    item_name: normalizeText(row.item_name) || null,
    item_level: row.item_level ?? null,
    quality: row.quality ?? null,
    encounter_name: normalizeText(row.encounter_name) || null,
    occurred_at: row.occurred_at ?? null,
    is_tier: Boolean(row.is_tier),
  }))
}

function getReportCode(row) {
  return row?.report_code ?? row?.code ?? null
}

function sortByUpdatedAtDesc(left, right) {
  const leftTime = Date.parse(left.updated_at ?? left.imported_at ?? 0) || 0
  const rightTime = Date.parse(right.updated_at ?? right.imported_at ?? 0) || 0
  return rightTime - leftTime
}

export function listWclImportsFromRows(rows = []) {
  return normalizeReportRows(rows).sort(sortByUpdatedAtDesc).map((row) => ({
    report_code: row.report_code,
    source_url: row.source_url,
    title: row.title,
    raid_night_date: row.raid_night_date,
    zone_name: row.zone_name,
    import_status: row.import_status,
    last_error: row.last_error,
    updated_at: row.updated_at,
    imported_at: row.imported_at,
  }))
}

export function groupRowsByReportCode(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const code = getReportCode(row)
    if (!code) continue
    const bucket = map.get(code) ?? []
    bucket.push(row)
    map.set(code, bucket)
  }
  return map
}

export function buildGuildDashboardPayload({
  guild = null,
  roster = [],
  reports = [],
  fights = [],
  fightPlayers = [],
  ilvlSnapshots = [],
  lootEvents = [],
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
} = {}) {
  const normalizedReports = normalizeReportRows(reports)
  const readyReports = normalizedReports.filter((report) => report.import_status === 'ready')
  const reportByCode = new Map(readyReports.map((report) => [report.report_code, report]))
  const fightRows = normalizeFightRows(fights).filter((fight) => reportByCode.has(fight.report_code))
  const fightByKey = new Map(fightRows.map((fight) => [`${fight.report_code}:${fight.fight_id}`, fight]))
  const fightPlayerRows = normalizeFightPlayerRows(fightPlayers)
    .filter((row) => reportByCode.has(row.report_code))
    .map((row) => {
      const fight = fightByKey.get(`${row.report_code}:${row.fight_id}`)
      return {
        ...row,
        kill: typeof row.kill === 'boolean' ? row.kill : Boolean(fight?.kill),
        raid_night_date: row.raid_night_date ?? fight?.raid_night_date ?? reportByCode.get(row.report_code)?.raid_night_date ?? null,
      }
    })
  const lootRows = normalizeLootRows(lootEvents).filter((row) => reportByCode.has(row.report_code))
  const rosterRows = (Array.isArray(roster) ? roster : []).map((row) => ({
    name: normalizeText(row.name) || null,
    class: row.class ?? row.class_name ?? null,
    spec: row.spec ?? row.spec_name ?? null,
    role: row.role ?? null,
    is_main: Boolean(row.is_main ?? row.isMain ?? false),
    avg_ilvl: row.avg_ilvl ?? row.avgIlvl ?? null,
    actor_key: row.actor_key ?? normalizeWclActorKey({
      name: row.name,
      realm: row.realm ?? guild?.realm,
      region: row.region ?? guild?.region,
    }),
    realm: row.realm ?? guild?.realm ?? null,
    region: row.region ?? guild?.region ?? null,
  }))

  const raidNightDates = [...new Set(readyReports.map((report) => report.raid_night_date).filter(Boolean))].sort()
  const parseTrendDates = raidNightDates.slice(-12)
  const attendanceDates = raidNightDates.slice(-6)
  const paddedAttendanceDates = [...attendanceDates]
  while (paddedAttendanceDates.length < 6) paddedAttendanceDates.unshift(null)

  const parseTrend = parseTrendDates.map((raidNightDate) => {
    const reportCodes = readyReports.filter((report) => report.raid_night_date === raidNightDate).map((report) => report.report_code)
    const parses = fightPlayerRows
      .filter((row) => row.raid_night_date === raidNightDate && row.kill && row.parse_percent != null && reportCodes.includes(row.report_code))
      .map((row) => row.parse_percent)
    const avg = average(parses)
    return {
      raid_night_date: raidNightDate,
      avg_parse_pct: avg == null ? null : Math.round(avg),
    }
  })

  const ilvlTrend = Array.from(groupBy(ilvlSnapshots, (row) => row.snapped_at ?? row.snappedAt ?? null).entries())
    .map(([snappedAt, rows]) => ({
      snapped_at: snappedAt,
      avg_ilvl: average(rows.map((row) => row.avg_ilvl ?? row.avgIlvl)),
      member_count: rows.length,
    }))
    .sort((left, right) => String(left.snapped_at).localeCompare(String(right.snapped_at)))
    .map((row) => ({
      snapped_at: row.snapped_at,
      avg_ilvl: row.avg_ilvl == null ? null : Math.round(row.avg_ilvl * 10) / 10,
      member_count: row.member_count,
  }))

  const latestRaidDate = raidNightDates.at(-1) ?? null
  const bossRows = buildProgressRows('aggregate', fightRows)
  const leaderboard = latestRaidDate
    ? Object.values(
      fightPlayerRows
        .filter((row) => row.raid_night_date === latestRaidDate && row.kill && row.parse_percent != null)
        .reduce((acc, row) => {
          const current = acc[row.actor_key]
          if (!current || row.parse_percent > current.parse_pct) {
            const fight = fightByKey.get(`${row.report_code}:${row.fight_id}`)
            acc[row.actor_key] = {
              actor_key: row.actor_key,
              name: row.actor_name ?? row.actor_key,
              role: row.role ?? rosterRows.find((member) => member.actor_key === row.actor_key)?.role ?? null,
              class: row.class_name ?? rosterRows.find((member) => member.actor_key === row.actor_key)?.class ?? null,
              spec: row.spec_name ?? rosterRows.find((member) => member.actor_key === row.actor_key)?.spec ?? null,
              encounter_name: fight?.encounter_name ?? null,
              parse_pct: row.parse_percent,
              raid_night_date: latestRaidDate,
              wcl_url: row.report_code ? `https://www.warcraftlogs.com/reports/${row.report_code}` : null,
            }
          }
          return acc
        }, {}),
    ).sort((left, right) => right.parse_pct - left.parse_pct || left.name.localeCompare(right.name))
    : []

  const attendance = rosterRows
    .filter((member) => member.is_main)
    .map((member) => {
      const nights = paddedAttendanceDates.map((raidNightDate) => {
        if (!raidNightDate) return false
        const reportCodes = readyReports.filter((report) => report.raid_night_date === raidNightDate).map((report) => report.report_code)
        return fightPlayerRows.some((row) => row.actor_key === member.actor_key && row.raid_night_date === raidNightDate && reportCodes.includes(row.report_code))
      })
      return {
        name: member.name,
        actor_key: member.actor_key,
        role: member.role,
        nights,
        attendance_pct: nights.length ? Math.round((nights.filter(Boolean).length / nights.length) * 100) : 0,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const rosterWithHistory = rosterRows
    .map((member) => {
      const parseTrendForMember = attendanceDates.map((raidNightDate) => {
        const reportCodes = readyReports.filter((report) => report.raid_night_date === raidNightDate).map((report) => report.report_code)
        const rows = fightPlayerRows.filter((row) => row.actor_key === member.actor_key && row.raid_night_date === raidNightDate && row.kill && row.parse_percent != null && reportCodes.includes(row.report_code))
        const values = rows.map((row) => row.parse_percent)
        return {
          raid_night_date: raidNightDate,
          parse_pct: values.length ? Math.round(average(values)) : null,
        }
      })

      const ilvlHistory = ilvlSnapshots
        .filter((row) => normalizeText(row.character_name ?? row.name) === member.name)
        .sort((left, right) => String(left.snapped_at ?? left.snappedAt ?? '').localeCompare(String(right.snapped_at ?? right.snappedAt ?? '')))

      return {
        name: member.name,
        class: member.class,
        spec: member.spec,
        role: member.role,
        is_main: member.is_main,
        actor_key: member.actor_key,
        avg_ilvl: member.avg_ilvl ?? ilvlHistory.at(-1)?.avg_ilvl ?? ilvlHistory.at(-1)?.avgIlvl ?? null,
        last_raid_parse_pct: latestRaidDate
          ? leaderboard.find((entry) => entry.actor_key === member.actor_key)?.parse_pct ?? null
          : null,
        parse_trend: parseTrendForMember,
      }
    })
    .sort((left, right) => (Number(right.is_main) - Number(left.is_main)) || left.name.localeCompare(right.name))

  return {
    guild: guild ? {
      name: guild.name ?? null,
      realm: guild.realm ?? null,
      region: guild.region ?? null,
    } : null,
    charts: {
      parseTrend,
      ilvlTrend,
    },
    progress: {
      zone_name: readyReports.find((report) => report.raid_night_date === latestRaidDate)?.zone_name ?? guild?.zone ?? null,
      progressed_boss_count: bossRows.filter((row) => row.kills > 0).length,
      boss_count: bossRows.length,
      delta_this_week: bossRows.filter((row) => row.kills > 0).length,
      bosses: bossRows.map((row) => ({
        name: row.encounter_name,
        pulls: row.pulls,
        kills: row.kills,
        best_percent: row.best_wipe_percent ?? row.best_percent ?? null,
      })),
    },
    leaderboard,
    attendance,
    loot: lootRows
      .filter((row) => {
        if (!row.occurred_at) return true
        const ageMs = Date.parse(now) - Date.parse(row.occurred_at)
        return !Number.isFinite(ageMs) || ageMs <= 14 * 24 * 60 * 60 * 1000
      })
      .sort((left, right) => String(right.occurred_at ?? '').localeCompare(String(left.occurred_at ?? ''))),
    roster: rosterWithHistory,
    readyReports: readyReports.map((report) => ({
      report_code: report.report_code,
      raid_night_date: report.raid_night_date,
      zone_name: report.zone_name,
      imported_at: report.imported_at,
      updated_at: report.updated_at,
    })),
    summary: {
      raid_night_count: raidNightDates.length,
      latest_raid_night_date: latestRaidDate,
    },
  }
}

const REPORT_IMPORT_QUERY = /* GraphQL */ `
  query WclReportImport($code: String!) {
    reportData {
      report(code: $code, allowUnlisted: true) {
        code
        title
        visibility
        startTime
        endTime
        revision
        segments
        region { id name slug compactName }
        zone { id name }
        guild { id name server { id name slug normalizedName region { id name slug compactName } } }
        owner { id name }
        masterData(translate: true) {
          actors(type: "Player") {
            id
            name
            type
            subType
            server
            petOwner
            gameID
          }
        }
        fights(translate: true) {
          id
          name
          encounterID
          difficulty
          startTime
          endTime
          kill
          size
          averageItemLevel
          bossPercentage
          fightPercentage
          completeRaid
          inProgress
          wipeCalledTime
          friendlyPlayers
          enemyPlayers
        }
      }
    }
  }
`

const FIGHT_RANKINGS_QUERY = /* GraphQL */ `
  query WclFightRankings($code: String!, $fightId: Int!, $difficulty: Int) {
    reportData {
      report(code: $code, allowUnlisted: true) {
        rankings(compare: Parses, difficulty: $difficulty, fightIDs: [$fightId], playerMetric: dps, timeframe: Historical)
      }
    }
  }
`

const FIGHT_EVENTS_QUERY = /* GraphQL */ `
  query WclFightEvents($code: String!, $fightId: Int!) {
    reportData {
      report(code: $code, allowUnlisted: true) {
        events(dataType: All, fightIDs: [$fightId], limit: 5000, translate: true) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`

async function fetchReportCore(reportCode) {
  const { response, data } = await fetchWCLGraphQL(REPORT_IMPORT_QUERY, { code: reportCode })
  if (!response.ok) {
    const message = data?.errors?.length
      ? data.errors.map((entry) => entry.message).join('; ')
      : `HTTP ${response.status}`
    throw new Error(`WCL report fetch failed for ${reportCode}: ${message}`)
  }

  const report = data?.data?.reportData?.report ?? null
  if (!report) throw new Error(`WCL report ${reportCode} returned no data`)
  return report
}

async function fetchFightRankings(reportCode, fight) {
  const { response, data } = await fetchWCLGraphQL(FIGHT_RANKINGS_QUERY, {
    code: reportCode,
    fightId: fight.id,
    difficulty: fight.difficulty ?? null,
  })

  if (!response.ok) {
    const message = data?.errors?.length
      ? data.errors.map((entry) => entry.message).join('; ')
      : `HTTP ${response.status}`
    throw new Error(`WCL fight rankings failed for ${reportCode}#${fight.id}: ${message}`)
  }

  return data?.data?.reportData?.report?.rankings ?? null
}

async function fetchFightEvents(reportCode, fight) {
  const { response, data } = await fetchWCLGraphQL(FIGHT_EVENTS_QUERY, {
    code: reportCode,
    fightId: fight.id,
  })

  if (!response.ok) {
    const message = data?.errors?.length
      ? data.errors.map((entry) => entry.message).join('; ')
      : `HTTP ${response.status}`
    throw new Error(`WCL fight events failed for ${reportCode}#${fight.id}: ${message}`)
  }

  return data?.data?.reportData?.report?.events ?? null
}

export async function fetchWclWarehouseImport(reportInput) {
  const reportCode = normalizeWclReportCode(reportInput)
  if (!reportCode) throw new Error('WCL report code required')

  const report = await fetchReportCore(reportCode)
  const fights = Array.isArray(report.fights) ? report.fights : []
  const fightRankingsByFightId = {}
  const lootEvents = []

  for (const fight of fights) {
    if (fight?.id == null) continue
    fightRankingsByFightId[fight.id] = await fetchFightRankings(reportCode, fight)
    lootEvents.push(...flattenLootLikeEvents(await fetchFightEvents(reportCode, fight), {
      reportCode,
      report,
      fight,
      occurredAt: fight.endTime ?? report.endTime ?? null,
    }))
  }

  return {
    reportCode,
    report,
    document: buildWclWarehouseDocument(reportCode, report, {
      sourceUrl: typeof reportInput === 'string' ? reportInput : null,
      fightRankingsByFightId,
      lootEvents,
    }),
  }
}

export async function fetchWclReportImport(reportInput) {
  return fetchWclWarehouseImport(reportInput)
}

async function replaceRowsByReportCode(supabase, table, reportCode, rows) {
  const { error: deleteError } = await supabase.from(table).delete().eq('report_code', reportCode)
  if (deleteError) throw deleteError
  if (!rows.length) return
  const { error: insertError } = await supabase.from(table).insert(rows)
  if (insertError) throw insertError
}

export async function persistWclWarehouseDocument(supabase, document) {
  const reportRow = { ...document.report, updated_at: new Date().toISOString() }
  const { error: reportError } = await supabase.from('wcl_reports').upsert(reportRow, { onConflict: 'report_code' })
  if (reportError) throw reportError

  await replaceRowsByReportCode(supabase, 'wcl_fights', reportRow.report_code, normalizeFightRows(document.fights))
  await replaceRowsByReportCode(supabase, 'wcl_fight_players', reportRow.report_code, normalizeFightPlayerRows(document.fightPlayers))
  await replaceRowsByReportCode(supabase, 'wcl_loot_events', reportRow.report_code, normalizeLootRows(document.lootEvents))

  return reportRow
}

export async function importWclWarehouseReport({ supabase, reportInput }) {
  const reportCode = normalizeWclReportCode(reportInput)
  if (!reportCode) throw new Error(`Invalid report input: ${reportInput}`)

  const startedAt = new Date().toISOString()
  const runningRow = {
    report_code: reportCode,
    source_url: typeof reportInput === 'string' ? reportInput : null,
    import_status: 'running',
    last_error: null,
    imported_at: startedAt,
    updated_at: startedAt,
  }

  const { error: runningError } = await supabase.from('wcl_reports').upsert(runningRow, { onConflict: 'report_code' })
  if (runningError) throw runningError

  try {
    const { document } = await fetchWclWarehouseImport(reportInput)
    const persisted = await persistWclWarehouseDocument(supabase, {
      ...document,
      report: {
        ...document.report,
        import_status: 'ready',
        imported_at: startedAt,
        updated_at: new Date().toISOString(),
      },
    })

    return {
      reportCode,
      report: persisted,
      fights: document.fights.length,
      players: document.players.length,
      fightPlayers: document.fightPlayers.length,
      lootEvents: document.lootEvents.length,
    }
  } catch (error) {
    const failedRow = {
      ...runningRow,
      import_status: 'failed',
      last_error: error.message,
      updated_at: new Date().toISOString(),
    }
    const { error: updateError } = await supabase.from('wcl_reports').upsert(failedRow, { onConflict: 'report_code' })
    if (updateError) throw updateError
    throw error
  }
}
