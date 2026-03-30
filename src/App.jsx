import { useState } from 'react'
import data from './data.json'
import { useStorage } from './hooks/index.js'
import CharacterHeader from './components/CharacterHeader.jsx'
import TierProgress from './components/TierProgress.jsx'
import GearSlots from './components/GearSlots.jsx'
import SimTable from './components/SimTable.jsx'
import UpgradeCharts from './components/UpgradeCharts.jsx'
import CatalystPlanner from './components/CatalystPlanner.jsx'
import WeeklyTracker from './components/WeeklyTracker.jsx'
import RaidBossPriority from './components/RaidBossPriority.jsx'
import DungeonPriority from './components/DungeonPriority.jsx'
import GamePlan from './components/GamePlan.jsx'
import GuildOverview from './components/GuildOverview.jsx'
import Settings from './components/Settings.jsx'

export default function App() {
  const [activeTab, setActiveTab] = useStorage('tab', 'raid')
  const [selectedSlot, setSelectedSlot] = useStorage('slot', null)
  const [typeFilter, setTypeFilter] = useStorage('filter', 'all')
  const [raidOnly, setRaidOnly] = useStorage('raidonly', false)
  const [showCatalyst, setShowCatalyst] = useStorage('catalyst', true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guild, setGuild] = useState(data.guild)

  function handleSlotClick(slot) {
    setSelectedSlot(prev => (prev === slot ? null : slot))
  }

  return (
    <div className="app-container">
      <CharacterHeader character={data.character} onSettingsClick={() => setSettingsOpen(true)} />

      <div className="section">
        <TierProgress gear={data.gear} />
      </div>

      <div className="section">
        <CatalystPlanner gear={data.gear} raidSim={data.raidSim} character={data.character} />
      </div>

      <div className="section main-grid">
        <GearSlots
          gear={data.gear}
          selectedSlot={selectedSlot}
          onSlotClick={handleSlotClick}
        />
        <SimTable
          raidSim={data.raidSim}
          mythicSim={data.mythicSim}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedSlot={selectedSlot}
          onClearSlot={() => setSelectedSlot(null)}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          raidOnly={raidOnly}
          onRaidOnly={setRaidOnly}
          showCatalyst={showCatalyst}
          onShowCatalyst={setShowCatalyst}
        />
      </div>

      <div className="section">
        <UpgradeCharts data={data} />
      </div>

      <div className="section">
        <WeeklyTracker bosses={data.raidBossPriority} dungeons={data.dungeonPriority} />
      </div>

      <div className="section">
        <p className="section-title">Raid Boss Priority</p>
        <RaidBossPriority bosses={data.raidBossPriority} />
      </div>

      <div className="section">
        <p className="section-title">M+ Dungeon Targeting</p>
        <DungeonPriority dungeons={data.dungeonPriority} mythicSim={data.mythicSim} />
      </div>

      <div className="section">
        <p className="section-title">Weekly Game Plan</p>
        <GamePlan gamePlan={data.gamePlan} />
      </div>

      <div className="section">
        <GuildOverview guild={guild} />
      </div>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        guild={guild}
        onGuildChange={setGuild}
      />
    </div>
  )
}
