import {
  buildCharacterStorageKey,
  identityNamesEqual,
  normalizeIdentityList,
  normalizeIdentityName,
} from './characterIdentity.js'

export const REMOVED_MEMBER_NAMES = ['Krypts']

export function pruneGuildMembers(members = [], { removedNames = REMOVED_MEMBER_NAMES } = {}) {
  const removed = normalizeIdentityList(removedNames)

  const filteredMembers = (Array.isArray(members) ? members : []).filter(
    (member) => member?.name && !removed.has(normalizeIdentityName(member.name)),
  )

  const mainNames = normalizeIdentityList(
    filteredMembers
      .filter((member) => member.isMain !== false)
      .map((member) => member.name),
  )

  return filteredMembers.map((member) => {
    if (!member?.altOf) return member
    return mainNames.has(normalizeIdentityName(member.altOf))
      ? member
      : { ...member, altOf: null }
  })
}

export function buildAuthoritativeCharacterSyncPlan(existingCharacters = [], incomingCharacters = []) {
  const incomingNames = normalizeIdentityList(incomingCharacters.map((character) => character?.name))
  const removedNames = (Array.isArray(existingCharacters) ? existingCharacters : [])
    .filter((character) => character?.name && !incomingNames.has(normalizeIdentityName(character.name)))
    .map((character) => character.name)

  return {
    removedNames,
    upsertNames: incomingCharacters
      .filter((character) => character?.name)
      .map((character) => character.name),
  }
}

export function purgeRemovedCharacterStorage(removedNames = [], guild = {}, storage = globalThis.localStorage) {
  if (!storage || typeof storage.length !== 'number') return

  const normalizedRemovedNames = normalizeIdentityList(removedNames)
  if (!normalizedRemovedNames.size) return

  const region = guild.region ?? ''
  const defaultRealm = guild.realm ?? ''
  const memberRealms = new Map(
    (guild.members ?? [])
      .filter((member) => member?.name)
      .map((member) => [normalizeIdentityName(member.name), member.realm?.trim() || defaultRealm]),
  )

  const exactKeys = new Set()
  for (const normalizedName of normalizedRemovedNames) {
    const realm = memberRealms.get(normalizedName) ?? defaultRealm
    exactKeys.add(`raidbots-url:${buildCharacterStorageKey(region, realm, normalizedName)}`)
    exactKeys.add(`droptimizer-url:${buildCharacterStorageKey(region, realm, normalizedName)}`)
    exactKeys.add(`blizzard:${buildCharacterStorageKey(region, realm, normalizedName)}`)
    exactKeys.add(`blizzard-media:${buildCharacterStorageKey(region, realm, normalizedName)}`)
  }

  const prefixes = ['raidbots-url:', 'droptimizer-url:', 'blizzard:', 'blizzard-media:', 'wcl:parses:']
  const keysToRemove = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue

    if (exactKeys.has(key)) {
      keysToRemove.push(key)
      continue
    }

    const normalizedKey = normalizeIdentityName(key)
    if (!prefixes.some((prefix) => normalizedKey.startsWith(prefix))) continue

    if ([...normalizedRemovedNames].some((name) => normalizedKey.includes(`:${name}`))) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key))
}

export function findMemberByName(members = [], name) {
  return (members ?? []).find((member) => identityNamesEqual(member?.name, name)) ?? null
}
