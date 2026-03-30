/**
 * useStorage — persists state to localStorage AND the URL hash simultaneously.
 *
 * Usage:  const [value, setValue] = useStorage(key, defaultValue)
 *
 * URL hash format:  #tab=raid&slot=Head&filter=tier&catalyst=1&raidonly=0
 *   - strings  → stored as-is
 *   - booleans → '1' (true) / '0' (false)
 *   - null     → key omitted entirely (keeps URLs clean)
 *   - default  → key omitted entirely
 *
 * Priority on mount: URL hash > localStorage > defaultValue
 */

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse the current URL hash into a plain key→value object. */
function parseHash() {
  const hash = window.location.hash.slice(1); // strip leading '#'
  if (!hash) return {};
  return Object.fromEntries(
    hash.split('&').map((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return [part, ''];
      return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
    })
  );
}

/** Serialize a value for the URL hash. Returns null if it should be omitted. */
function serializeForHash(value, defaultValue) {
  if (value === null || value === undefined) return null;
  if (value === defaultValue) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/** Deserialize a raw hash string back to the appropriate JS type based on defaultValue. */
function deserializeFromHash(raw, defaultValue) {
  if (raw === undefined || raw === null) return null; // not present in hash
  if (typeof defaultValue === 'boolean') {
    return raw === '1';
  }
  return raw; // string
}

/** Read one key from localStorage. Returns undefined on any error or if absent. */
function lsRead(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Write one key to localStorage. Silently ignores errors (private browsing, quota, etc.). */
function lsWrite(key, value) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore
  }
}

/**
 * Rebuild the URL hash with an updated value for `key`.
 * All other keys currently in the hash are preserved.
 */
function updateHash(key, serialized) {
  const current = parseHash();
  if (serialized === null) {
    delete current[key];
  } else {
    current[key] = serialized;
  }
  const pairs = Object.entries(current)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const newHash = pairs ? `#${pairs}` : window.location.pathname + window.location.search;
  // Use replaceState so we don't pollute the browser history on every keystroke.
  window.history.replaceState(null, '', pairs ? `#${pairs}` : window.location.pathname + window.location.search);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useStorage(key, defaultValue) → [value, setValue]
 *
 * @param {string} key           - storage key (used for both localStorage and hash param)
 * @param {*}      defaultValue  - fallback when nothing is persisted
 */
export function useStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    // 1. Try URL hash first
    const hashParams = parseHash();
    const fromHash = deserializeFromHash(hashParams[key], defaultValue);
    if (fromHash !== null) return fromHash;

    // 2. Try localStorage
    const fromLS = lsRead(key);
    if (fromLS !== undefined) return fromLS;

    // 3. Fall back to default
    return defaultValue;
  });

  // Sync outward whenever value changes
  useEffect(() => {
    // Write to localStorage
    lsWrite(key, value === defaultValue ? null : value);

    // Write to URL hash
    const serialized = serializeForHash(value, defaultValue);
    updateHash(key, serialized);
  }, [key, value]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}

// ---------------------------------------------------------------------------
// Share URL helper
// ---------------------------------------------------------------------------

/**
 * buildShareURL() — returns the current window.location.href.
 *
 * Because all state lives in the URL hash (managed by useStorage), the
 * current href is always the correct shareable link — no extra work needed.
 *
 * @returns {string}
 */
export function buildShareURL() {
  return window.location.href;
}
