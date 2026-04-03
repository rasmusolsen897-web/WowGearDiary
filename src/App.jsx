import { useState, useEffect, useRef } from 'react'
import data from './data.json'
import GuildHeader from './components/GuildHeader.jsx'
import GuildOverview from './components/GuildOverview.jsx'
import CharacterView from './components/CharacterView.jsx'
import Settings from './components/Settings.jsx'

const GUILD_STORAGE_KEY  = 'wow-gear-diary:guild'
const TOKEN_STORAGE_KEY  = 'wow-gear-diary:write-token'

function readLocalStorage(key) {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

function removeLocalStorage(key) {
  try { localStorage.removeItem(key) } catch {}
}

function legacyReportStorageKey(prefix, region, realm, name) {
  return `${prefix}:${region}:${realm}:${name}`.toLowerCase()
}

function migrateLegacyReportUrls(guild) {
  if (!guild?.members?.length) return { guild, migrated: false }

  let migrated = false

  const members = guild.members.map((member) => {
    const region = `${guild.region ?? ''}`.trim().toLowerCase()
    const realm = `${member.realm?.trim() || guild.realm || ''}`.trim().toLowerCase()
    const name = `${member.name ?? ''}`.trim()

    if (!region || !realm || !name) return member

    const raidbotsKey = legacyReportStorageKey('raidbots-url', region, realm, name)
    const droptimizerKey = legacyReportStorageKey('droptimizer-url', region, realm, name)

    const reportUrl = member.reportUrl ?? member.report_url ?? ''
    const droptimizerUrl = member.droptimizerUrl ?? member.droptimizer_url ?? ''

    const legacyReportUrl = reportUrl ? '' : readLocalStorage(raidbotsKey).trim()
    const legacyDroptimizerUrl = droptimizerUrl ? '' : readLocalStorage(droptimizerKey).trim()

    if (!legacyReportUrl && !legacyDroptimizerUrl) return member

    migrated = true
    removeLocalStorage(raidbotsKey)
    removeLocalStorage(droptimizerKey)

    return {
      ...member,
      ...(legacyReportUrl ? { reportUrl: legacyReportUrl } : {}),
      ...(legacyDroptimizerUrl ? { droptimizerUrl: legacyDroptimizerUrl } : {}),
    }
  })

  return {
    guild: migrated ? { ...guild, members } : guild,
    migrated,
  }
}

function sanitizeMember(member) {
  if (!member || typeof member !== 'object') return member
  const { realName, real_name, ...rest } = member
  return rest
}

function sanitizeMembers(members) {
  return Array.isArray(members) ? members.map(sanitizeMember) : []
}

function sanitizeGuild(guild) {
  if (!guild || typeof guild !== 'object') return guild
  return {
    ...guild,
    members: sanitizeMembers(guild.members),
  }
}

function loadGuild() {
  try {
    const stored = localStorage.getItem(GUILD_STORAGE_KEY)
    if (stored) {
      const parsed = sanitizeGuild(JSON.parse(stored))
      // Merge: add any new members from data.json that aren't in localStorage yet.
      const storedNames = new Set(parsed.members.map((member) => member.name.toLowerCase()))
      const newMembers = sanitizeMembers(data.guild.members).filter(
        (member) => !storedNames.has(member.name.toLowerCase()),
      )
      return migrateLegacyReportUrls({ ...parsed, members: [...parsed.members, ...newMembers] }).guild
    }
  } catch {}
  return migrateLegacyReportUrls(sanitizeGuild(data.guild)).guild
}

function saveGuild(guild) {
  try { localStorage.setItem(GUILD_STORAGE_KEY, JSON.stringify(sanitizeGuild(guild))) } catch {}
}

function loadWriteToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '' } catch { return '' }
}

function saveWriteToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {}
}

async function postGuildToApi(guild, token) {
  return fetch('/api/guild', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Write-Token': token },
    body: JSON.stringify(sanitizeGuild(guild)),
  })
}

async function postCharactersToApi(members, token) {
  return fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Write-Token': token },
    body: JSON.stringify({ characters: sanitizeMembers(members) }),
  }).catch(() => {}) // best-effort, don't block
}

export default function App() {
  const [guild, setGuildState]              = useState(loadGuild)
  const [selectedMember, setSelectedMember] = useState(null)
  const [settingsOpen, setSettingsOpen]     = useState(false)
  const [writeToken, setWriteTokenState]    = useState(loadWriteToken)
  const [syncError, setSyncError]           = useState(null) // null | string
  const [syncStatus, setSyncStatus]         = useState('idle') // 'idle' | 'syncing' | 'ok' | 'error'

  // Keep refs current so async syncs always use the latest local state.
  const writeTokenRef = useRef(writeToken)
  const guildRef = useRef(guild)
  useEffect(() => { writeTokenRef.current = writeToken }, [writeToken])
  useEffect(() => { guildRef.current = guild }, [guild])

  function syncGuild(updated, token) {
    if (!token) return

    setSyncStatus('syncing')
    Promise.all([
      postGuildToApi(updated, token),
      postCharactersToApi(updated.members, token),
    ]).then(([res]) => {
      if (res.status === 401) {
        setSyncStatus('error')
        setSyncError('Wrong password - changes saved locally only. Re-enter in Settings -> Guild.')
      } else if (res.ok) {
        setSyncStatus('ok')
        setSyncError(null)
      } else {
        setSyncStatus('error')
        setSyncError('Sync failed - changes saved locally.')
      }
    }).catch(() => {
      setSyncStatus('error')
      setSyncError('Sync failed - check your connection.')
    })
  }

  // On mount: fetch guild metadata (KV) + characters (Supabase) in parallel.
  useEffect(() => {
    const controller = new AbortController()
    const sig = { signal: controller.signal }

    Promise.all([
      fetch('/api/guild', sig).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/characters', sig).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([remote, supaChars]) => {
      const sanitizedRemote = sanitizeGuild(remote)
      const sanitizedSupaChars = sanitizeMembers(supaChars)

      setGuildState((prev) => {
        let updated = prev

        // Apply guild metadata (name, realm, region) from KV.
        if (sanitizedRemote) {
          updated = {
            ...updated,
            name: sanitizedRemote.name ?? updated.name,
            realm: sanitizedRemote.realm ?? updated.realm,
            region: sanitizedRemote.region ?? updated.region,
          }
        }

        // Supabase characters are source of truth; KV members are fallback.
        if (sanitizedSupaChars.length) {
          updated = { ...updated, members: sanitizedSupaChars }
        } else if (sanitizedRemote?.members?.length) {
          updated = { ...updated, members: sanitizedRemote.members }
          const token = writeTokenRef.current
          if (token) postCharactersToApi(sanitizedRemote.members, token)
        }

        const migration = migrateLegacyReportUrls(updated)
        updated = migration.guild

        saveGuild(updated)
        if (migration.migrated) {
          const token = writeTokenRef.current
          if (token) syncGuild(updated, token)
        }
        return updated
      })
    })

    return () => controller.abort()
  }, [])

  // Central setter: writes to localStorage and, if unlocked, syncs to KV + Supabase.
  function setGuild(updaterOrValue) {
    setGuildState((prev) => {
      const updated = sanitizeGuild(
        typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue,
      )
      saveGuild(updated)
      const token = writeTokenRef.current
      if (token) syncGuild(updated, token)
      return updated
    })
  }

  // Keep selectedMember in sync when guild changes (e.g. after Settings save).
  function handleGuildChange(updated) {
    setGuild(updated)
    if (selectedMember) {
      const refreshed = updated.members.find(
        (member) => member.name.toLowerCase() === selectedMember.name.toLowerCase(),
      )
      if (refreshed) setSelectedMember(refreshed)
    }
  }

  // Called from CharacterView when Blizzard/Raidbots data teaches us class/spec/role.
  function updateMember(name, patch) {
    setGuild((prev) => ({
      ...prev,
      members: prev.members.map((member) =>
        member.name.toLowerCase() === name.toLowerCase() ? { ...member, ...patch } : member,
      ),
    }))
    if (selectedMember?.name.toLowerCase() === name.toLowerCase()) {
      setSelectedMember((prev) => ({ ...prev, ...patch }))
    }
  }

  function handleWriteTokenChange(token) {
    setWriteTokenState(token)
    writeTokenRef.current = token
    saveWriteToken(token)
    if (!token) {
      setSyncError(null)
      setSyncStatus('idle')
      return
    }

    syncGuild(sanitizeGuild(guildRef.current), token)
  }

  const settingsProps = {
    open: settingsOpen,
    onClose: () => setSettingsOpen(false),
    guild,
    onGuildChange: handleGuildChange,
    writeToken,
    onWriteTokenChange: handleWriteTokenChange,
    syncError,
    syncStatus,
  }

  if (selectedMember) {
    return (
      <>
        <GuildHeader guild={guild} onSettingsClick={() => setSettingsOpen(true)} />
        <CharacterView
          member={selectedMember}
          guild={guild}
          onBack={() => setSelectedMember(null)}
          onUpdateMember={updateMember}
          writeToken={writeToken}
        />
        <Settings {...settingsProps} />
      </>
    )
  }

  return (
    <>
      <GuildHeader guild={guild} onSettingsClick={() => setSettingsOpen(true)} />
      <div className="app-container">
        <GuildOverview
          guild={guild}
          onSelectMember={setSelectedMember}
        />
      </div>
      <Settings {...settingsProps} />
    </>
  )
}
