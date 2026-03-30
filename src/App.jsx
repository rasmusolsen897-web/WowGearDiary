import { useState } from 'react'
import data from './data.json'
import GuildHeader from './components/GuildHeader.jsx'
import GuildOverview from './components/GuildOverview.jsx'
import CharacterView from './components/CharacterView.jsx'
import Settings from './components/Settings.jsx'

const GUILD_STORAGE_KEY = 'wow-gear-diary:guild'

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

export default function App() {
  const [guild, setGuildState]              = useState(loadGuild)
  const [selectedMember, setSelectedMember] = useState(null)
  const [settingsOpen, setSettingsOpen]     = useState(false)

  function setGuild(updated) {
    setGuildState(updated)
    saveGuild(updated)
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
        <Settings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          guild={guild}
          onGuildChange={handleGuildChange}
        />
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
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        guild={guild}
        onGuildChange={handleGuildChange}
      />
    </>
  )
}
