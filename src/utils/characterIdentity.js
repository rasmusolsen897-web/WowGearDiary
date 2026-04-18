function normalizeUnicode(value) {
  return String(value ?? '').normalize('NFC').trim()
}

export function normalizeIdentityName(value) {
  return normalizeUnicode(value).toLocaleLowerCase()
}

export function buildIdentitySlug(value) {
  return normalizeUnicode(value)
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/'/g, '')
}

export function identityNamesEqual(left, right) {
  return normalizeIdentityName(left) === normalizeIdentityName(right)
}

export function buildCharacterStorageKey(region, realm, name) {
  return [
    normalizeIdentityName(region),
    normalizeIdentityName(realm),
    normalizeIdentityName(name),
  ].join(':')
}

export function buildBlizzardPathSegment(value) {
  return encodeURIComponent(buildIdentitySlug(value))
}

export function normalizeIdentityList(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeIdentityName(value))
      .filter(Boolean),
  )
}
