import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBlizzardPathSegment,
  buildCharacterStorageKey,
  normalizeIdentityName,
} from '../src/utils/characterIdentity.js'

test('normalizeIdentityName normalizes unicode names to the same key', () => {
  assert.equal(normalizeIdentityName(' Okr\u0061\u0300m '), 'okràm')
  assert.equal(normalizeIdentityName('Okràm'), 'okràm')
})

test('buildCharacterStorageKey is stable across unicode normalization forms', () => {
  const composed = buildCharacterStorageKey('eu', 'Argent Dawn', 'Okràm')
  const decomposed = buildCharacterStorageKey('eu', 'Argent Dawn', 'Okr\u0061\u0300m')

  assert.equal(composed, 'eu:argent dawn:okràm')
  assert.equal(decomposed, composed)
})

test('buildBlizzardPathSegment lowercases and encodes accented names', () => {
  assert.equal(buildBlizzardPathSegment('Argent Dawn'), 'argent-dawn')
  assert.equal(buildBlizzardPathSegment('Okràm'), 'okr%C3%A0m')
})
