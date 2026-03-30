import { useState } from 'react'
import data from './data.json'
import GuildHeader from './components/GuildHeader.jsx'
import GuildOverview from './components/GuildOverview.jsx'
import CharacterView from './components/CharacterView.jsx'
import Settings from './components/Settings.jsx'

export default function App() {
  const [guild, setGuild]                   = useState(data.guild)
  const [selectedMember, setSelectedMember] = useState(null)
  const [settingsOpen, setSettingsOpen]     = useState(false)

  if (selectedMember) {
    return (
      <>
        <GuildHeader guild={guild} onSettingsClick={() => setSettingsOpen(true)} />
        <CharacterView
          member={selectedMember}
          guild={guild}
          onBack={() => setSelectedMember(null)}
        />
        <Settings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          guild={guild}
          onGuildChange={setGuild}
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
        onGuildChange={setGuild}
      />
    </>
  )
}
