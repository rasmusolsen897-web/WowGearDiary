import { useState } from 'react'
import data from './data.json'
import CharacterHeader from './components/CharacterHeader.jsx'
import TierProgress from './components/TierProgress.jsx'
import GearSlots from './components/GearSlots.jsx'
import SimTable from './components/SimTable.jsx'
import RaidBossPriority from './components/RaidBossPriority.jsx'
import DungeonPriority from './components/DungeonPriority.jsx'
import GamePlan from './components/GamePlan.jsx'

export default function App() {
  const [activeTab, setActiveTab] = useState('raid')       // 'raid' | 'mythic'
  const [selectedSlot, setSelectedSlot] = useState(null)   // slot name string
  const [typeFilter, setTypeFilter] = useState('all')       // 'all' | 'tier' | 'trinket'
  const [raidOnly, setRaidOnly] = useState(false)
  const [showCatalyst, setShowCatalyst] = useState(true)

  function handleSlotClick(slot) {
    setSelectedSlot(prev => (prev === slot ? null : slot))
  }

  return (
    <div className="app-container">
      <CharacterHeader character={data.character} />

      <div className="section">
        <TierProgress gear={data.gear} />
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
    </div>
  )
}
