import { useState, useEffect, useRef } from 'react'
import data from './data.json'
import GuildHeader from './components/GuildHeader.jsx'
import GuildOverview from './components/GuildOverview.jsx'
import CharacterView from './components/CharacterView.jsx'
import Settings from './components/Settings.jsx'

const GUILD_STORAGE_KEY  = 'wow-gear-diary:guild'
const TOKEN_STORAGE_KEY  = 'wow-gear-diary:write-token'

function loadGuild() {
  try {
    const stored = localStorage.getItem(GUILD_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge: add any new members from data.json that aren't in localStorage yet
      const storedNames = new Set(parsed.members.map(m => m.name.toLowerCase()))
      const newMembers  = data.guild.members.filter(m => !storedNames.has(m.name.toLowerCase()))
      return { ...parsed, members: [...parsed.members, ...newMembers] }
    }
  } catch {}
  return data.guild
}

function saveGuild(guild) {
  try { localStorage.setItem(GUILD_STORAGE_KEY, JSON.stringify(guild)) } catch {}
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
    body: JSON.stringify(guild),
  })
}

async function postCharactersToApi(members, token) {
  return fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Write-Token': token },
    body: JSON.stringify({ characters: members }),
  }).catch(() => {}) // best-effort, don't block
}

export default function App() {
  const [guild, setGuildState]              = useState(loadGuild)
  const [selectedMember, setSelectedMember] = useState(null)
  const [settingsOpen, setSettingsOpen]     = useState(false)
  const [writeToken, setWriteTokenState]    = useState(loadWriteToken)
  const [syncError, setSyncError]           = useState(null) // null | string
  const [syncStatus, setSyncStatus]         = useState('idle') // 'idle' | 'syncing' | 'ok' | 'error'

  // Keep a ref to the current writeToken so the setGuild closure always sees the latest value
  const writeTokenRef = useRef(writeToken)
  useEffect(() => { writeTokenRef.current = writeToken }, [writeToken])

  // On mount: fetch guild metadata (KV) + characters (Supabase) in parallel
  useEffect(() => {
    const controller = new AbortController()
    const sig = { signal: controller.signal }

    Promise.all([
      fetch('/api/guild', sig).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/characters', sig).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([remote, supaChars]) => {
      setGuildState(prev => {
        let updated = prev

        // Apply guild metadata (name, realm, region) from KV
        if (remote) {
          updated = {
            ...updated,
            name:   remote.name   ?? updated.name,
            realm:  remote.realm  ?? updated.realm,
            region: remote.region ?? updated.region,
          }
        }

        // Supabase characters are source of truth; KV members are fallback
        if (supaChars?.length) {
          updated = { ...updated, members: supaChars }
        } else if (remote?.members?.length) {
          updated = { ...updated, members: remote.members }
          // Seed Supabase if empty and we have a write token
          const token = writeTokenRef.current
          if (token) postCharactersToApi(remote.members, token)
        }

        saveGuild(updated)
        return updated
      })
    })

    return () => controller.abort()
  }, [])

  // Central setter — writes to localStorage and (if token set) syncs to API + Supabase
  function setGuild(updaterOrValue) {
    setGuildState(prev => {
      const updated = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue
      saveGuild(updated)
      const token = writeTokenRef.current
      if (token) {
        setSyncStatus('syncing')
        // Sync guild metadata to KV and characters to Supabase in parallel
        Promise.all([
          postGuildToApi(updated, token),
          postCharactersToApi(updated.members, token),
        ]).then(([res]) => {
          if (res.status === 401) {
            setSyncStatus('error')
            setSyncError('Wrong password — changes saved locally only. Re-enter in Settings → Guild.')
          } else if (res.ok) {
            setSyncStatus('ok')
            setSyncError(null)
          } else {
            setSyncStatus('error')
            setSyncError('Sync failed — changes saved locally.')
          }
        }).catch(() => {
          setSyncStatus('error')
          setSyncError('Sync failed — check your connection.')
        })
      }
      return updated
    })
  }

  // Keep selectedMember in sync when guild changes (e.g. after Settings save)
  function handleGuildChange(updated) {
    setGuild(updated)
    if (selectedMember) {
      const refreshed = updated.members.find(m => m.name.toLowerCase() === selectedMember.name.toLowerCase())
      if (refreshed) setSelectedMember(refreshed)
    }
  }

  // Called from CharacterView when Blizzard/Raidbots data teaches us class/spec/role
  function updateMember(name, patch) {
    setGuild(prev => ({
      ...prev,
      members: prev.members.map(m =>
        m.name.toLowerCase() === name.toLowerCase() ? { ...m, ...patch } : m
      ),
    }))
    if (selectedMember?.name.toLowerCase() === name.toLowerCase()) {
      setSelectedMember(prev => ({ ...prev, ...patch }))
    }
  }

  function handleWriteTokenChange(token) {
    setWriteTokenState(token)
    writeTokenRef.current = token
    saveWriteToken(token)
    if (!token) { setSyncError(null); setSyncStatus('idle') }
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
