import { useEffect, useRef, useState } from 'react'
import data from './data.json'
import GuildHeader from './components/GuildHeader.jsx'
import GuildOverview from './components/GuildOverview.jsx'
import Settings from './components/Settings.jsx'
import { normalizeIdentityName } from './utils/characterIdentity.js'
import {
  findMemberByName,
  pruneGuildMembers,
  purgeRemovedCharacterStorage,
  REMOVED_MEMBER_NAMES,
} from './utils/rosterSync.js'

const GUILD_STORAGE_KEY = 'wow-gear-diary:guild'
const TOKEN_STORAGE_KEY = 'wow-gear-diary:write-token'

function sanitizeMember(member) {
  if (!member || typeof member !== 'object') return member
  const { realName, real_name, ...rest } = member
  return rest
}

function sanitizeMembers(members) {
  return pruneGuildMembers(
    Array.isArray(members) ? members.map(sanitizeMember) : [],
    { removedNames: REMOVED_MEMBER_NAMES },
  )
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
      const storedNames = new Set((parsed.members ?? []).map((member) => normalizeIdentityName(member.name)))
      const newMembers = sanitizeMembers(data.guild.members).filter(
        (member) => !storedNames.has(normalizeIdentityName(member.name)),
      )
      return { ...parsed, members: [...(parsed.members ?? []), ...newMembers] }
    }
  } catch {}
  return sanitizeGuild(data.guild)
}

function saveGuild(guild) {
  try {
    localStorage.setItem(GUILD_STORAGE_KEY, JSON.stringify(sanitizeGuild(guild)))
  } catch {}
}

function loadWriteToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
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
  }).catch(() => {})
}

export default function App() {
  const [guild, setGuildState] = useState(loadGuild)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [writeToken, setWriteTokenState] = useState(loadWriteToken)
  const [syncError, setSyncError] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle')

  const writeTokenRef = useRef(writeToken)
  useEffect(() => {
    writeTokenRef.current = writeToken
  }, [writeToken])

  useEffect(() => {
    const controller = new AbortController()
    const sig = { signal: controller.signal }

    Promise.all([
      fetch('/api/guild', sig).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/characters', sig).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([remote, supaChars]) => {
      const sanitizedRemote = sanitizeGuild(remote)
      const sanitizedSupaChars = sanitizeMembers(supaChars)

      setGuildState((prev) => {
        let updated = prev

        if (sanitizedRemote) {
          updated = {
            ...updated,
            name: sanitizedRemote.name ?? updated.name,
            realm: sanitizedRemote.realm ?? updated.realm,
            region: sanitizedRemote.region ?? updated.region,
          }
        }

        if (sanitizedSupaChars.length) {
          updated = { ...updated, members: sanitizedSupaChars }
        } else if (sanitizedRemote?.members?.length) {
          updated = { ...updated, members: sanitizedRemote.members }
          const token = writeTokenRef.current
          if (token) postCharactersToApi(sanitizedRemote.members, token)
        }

        saveGuild(updated)
        return updated
      })
    })

    return () => controller.abort()
  }, [])

  function setGuild(updaterOrValue) {
    setGuildState((prev) => {
      const updated = sanitizeGuild(
        typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue,
      )

      const removedNames = prev.members
        .filter((member) => !findMemberByName(updated.members, member.name))
        .map((member) => member.name)

      saveGuild(updated)
      purgeRemovedCharacterStorage(removedNames, updated)

      const token = writeTokenRef.current
      if (token) {
        setSyncStatus('syncing')
        Promise.all([
          postGuildToApi(updated, token),
          postCharactersToApi(updated.members, token),
        ]).then(([res]) => {
          if (res.status === 401) {
            setSyncStatus('error')
            setSyncError('Wrong password - changes saved locally only. Re-enter in Settings > Guild.')
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

      return updated
    })
  }

  function handleGuildChange(updated) {
    setGuild(updated)
  }

  function handleWriteTokenChange(token) {
    setWriteTokenState(token)
    writeTokenRef.current = token
    saveWriteToken(token)
    if (!token) {
      setSyncError(null)
      setSyncStatus('idle')
    }
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

  return (
    <>
      <GuildHeader guild={guild} onSettingsClick={() => setSettingsOpen(true)} />
      <main className="app-shell">
        <GuildOverview guild={guild} />
      </main>
      <Settings {...settingsProps} />
    </>
  )
}
