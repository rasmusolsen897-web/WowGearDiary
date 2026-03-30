import data from '../data.json'
import { useStorage } from '../hooks/index.js'
import { useBlizzardAPI, useBlizzardMedia } from '../hooks/useBlizzardAPI.js'
import { useCharacterParses } from '../hooks/useWCLAPI.js'
import { useRaidbotsReport, getStoredReportUrl, setStoredReportUrl } from '../hooks/useRaidbotsReport.js'
import { useState, useEffect } from 'react'
import TierProgress from './TierProgress.jsx'
import GearSlots from './GearSlots.jsx'
import SimTable from './SimTable.jsx'
import UpgradeCharts from './UpgradeCharts.jsx'
import CatalystPlanner from './CatalystPlanner.jsx'
import WeeklyTracker from './WeeklyTracker.jsx'
import RaidBossPriority from './RaidBossPriority.jsx'
import DungeonPriority from './DungeonPriority.jsx'
import GamePlan from './GamePlan.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLASS_COLORS = {
  'Death Knight': '#c41e3a', 'Demon Hunter': '#a330c9', 'Druid': '#ff7d0a',
  'Evoker': '#33937f', 'Hunter': '#abd473', 'Mage': '#69ccff', 'Monk': '#00ff96',
  'Paladin': '#f58cba', 'Priest': '#ffffff', 'Rogue': '#fff569', 'Shaman': '#0070de',
  'Warlock': '#9482c9', 'Warrior': '#c79c6e',
}

function ilvlColor(ilvl) {
  if (ilvl >= 272) return 'var(--legendary-orange)'
  if (ilvl >= 263) return 'var(--epic-purple)'
  if (ilvl >= 250) return 'var(--rare-blue)'
  if (ilvl >= 232) return '#1eff00'
  return 'var(--text-muted)'
}

function parseBadgeColor(pct) {
  if (pct >= 95) return '#e268a8'
  if (pct >= 75) return '#ff8000'
  if (pct >= 50) return '#1eff00'
  if (pct >= 25) return '#0070dd'
  return '#9d9d9d'
}

function bestParse(wclData) {
  if (!wclData) return null
  const rankings = wclData.rankingsMythic?.rankings
    ?? wclData.rankingsHeroic?.rankings
    ?? wclData.rankingsNormal?.rankings ?? []
  if (!rankings.length) return null
  const best = rankings.reduce((a, b) => b.rankPercent > a.rankPercent ? b : a, rankings[0])
  const diff = wclData.rankingsMythic?.rankings?.length ? 'M' : wclData.rankingsHeroic?.rankings?.length ? 'H' : 'N'
  return { pct: Math.round(best.rankPercent ?? 0), diff }
}

// ── RaidbotsSection ───────────────────────────────────────────────────────────

function RaidbotsSection({ member, region, realm, onUpdateMember }) {
  const memberKey   = `${region}:${realm}:${member.name}`.toLowerCase()
  const [reportUrl, setReportUrl] = useState(() => getStoredReportUrl(memberKey))
  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState('')

  const { dps, spec: reportSpec, loading, error } = useRaidbotsReport(reportUrl)
  const deepLink = `https://www.raidbots.com/simbot/quick?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(member.name)}`

  // Auto-learn spec/role from report once it loads
  useEffect(() => {
    if (reportSpec && onUpdateMember) {
      onUpdateMember(member.name, { spec: reportSpec, role: specToRole(reportSpec) })
    }
  }, [reportSpec]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const t = draft.trim()
    setStoredReportUrl(memberKey, t)
    setReportUrl(t)
    setEditing(false)
  }

  return (
    <div style={card}>
      <h3 style={sectionTitle}>Raidbots Sim</h3>
      {loading && <p style={muted}>Loading report…</p>}
      {error && <p style={{ color: '#ff4444', fontSize: '0.85rem' }}>{error}</p>}
      {dps > 0 && !loading && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: '#a335ee' }}>{(dps / 1000).toFixed(1)}k</span>
          <span style={muted}>DPS</span>
          {reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--frost-blue)' }}>View report ↗</a>}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <a href={deepLink} target="_blank" rel="noreferrer" style={purpleBtn}>Sim in Raidbots ↗</a>
        {!editing && (
          <button onClick={() => { setDraft(reportUrl); setEditing(true) }} style={ghostBtn}>
            {reportUrl ? 'Update report' : 'Paste report URL'}
          </button>
        )}
        {reportUrl && !editing && (
          <button onClick={() => { setStoredReportUrl(memberKey, ''); setReportUrl('') }} style={{ ...ghostBtn, borderColor: '#555', color: '#666' }}>Clear</button>
        )}
      </div>
      {editing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="https://www.raidbots.com/simbot/report/..."
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            style={{ flex: 1, background: '#0d0d1a', border: '1px solid #444', color: '#e0e0e0', borderRadius: 4, padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
          />
          <button onClick={save} style={{ ...ghostBtn, borderColor: 'var(--success)', color: 'var(--success)' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ ...ghostBtn, borderColor: '#555', color: '#666' }}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── GearList ──────────────────────────────────────────────────────────────────

function GearList({ gear }) {
  if (!gear?.length) return null
  return (
    <div style={card}>
      <h3 style={sectionTitle}>Current Gear</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.4rem' }}>
        {gear.map((g) => (
          <div key={g.slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.5rem', background: '#0d0d1a', borderRadius: 4 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{g.slot}</span>
            <span style={{ fontSize: '0.82rem', color: ilvlColor(g.ilvl), fontWeight: 600 }}>{g.ilvl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CharacterView ─────────────────────────────────────────────────────────────

function specToRole(spec) {
  const tanks   = ['Protection', 'Blood', 'Brewmaster', 'Vengeance', 'Guardian']
  const healers = ['Holy', 'Discipline', 'Restoration', 'Mistweaver', 'Preservation']
  if (tanks.some(t => spec?.includes(t)))   return 'tank'
  if (healers.some(h => spec?.includes(h))) return 'healer'
  return 'dps'
}

export default function CharacterView({ member, guild, onBack, onUpdateMember }) {
  const effectiveRealm = member.realm?.trim() || guild.realm
  const region         = guild.region

  const { data: bliz, loading: gearLoading, error: gearError } = useBlizzardAPI(member.name, effectiveRealm, region)
  const { avatarUrl }  = useBlizzardMedia(member.name, effectiveRealm, region)
  const { data: wcl }  = useCharacterParses(member.name, effectiveRealm, region)

  // Auto-learn class/spec/role from Blizzard API
  const blizSpec  = bliz?.spec  ?? null
  const blizClass = bliz?.class ?? null
  if (bliz && onUpdateMember && (blizSpec !== member.spec || blizClass !== member.class)) {
    onUpdateMember(member.name, {
      class: blizClass ?? member.class,
      spec:  blizSpec  ?? member.spec,
      role:  specToRole(blizSpec) ?? member.role,
    })
  }

  // Sim table state (only relevant for the main character with hardcoded data)
  const [activeTab, setActiveTab]     = useStorage('tab', 'raid')
  const [selectedSlot, setSelectedSlot] = useStorage('slot', null)
  const [typeFilter, setTypeFilter]   = useStorage('filter', 'all')
  const [raidOnly, setRaidOnly]       = useStorage('raidonly', false)
  const [showCatalyst, setShowCatalyst] = useStorage('catalyst', true)

  const isMainChar = member.name.toLowerCase() === data.character.name.toLowerCase()

  const parse     = bestParse(wcl)
  const classColor = CLASS_COLORS[bliz?.class ?? member.class] ?? '#e0e0e0'
  const ilvl      = bliz?.avgIlvl ?? null
  const spec      = bliz?.spec ?? ''
  const charClass = bliz?.class ?? member.class ?? ''

  return (
    <div className="app-container">
      {/* Back button */}
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: '1px solid #444', color: 'var(--text-muted)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
          ← Back to guild
        </button>
      </div>

      {/* Character hero */}
      <div style={{ background: 'linear-gradient(135deg, #111128 0%, #1a1a35 60%, #0d1520 100%)', borderRadius: 10, border: '1px solid var(--border)', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{ width: 80, height: 80, borderRadius: 8, flexShrink: 0, overflow: 'hidden', border: `2px solid ${classColor}`, boxShadow: `0 0 16px ${classColor}44` }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', background: '#1a2a40', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🧙</div>
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: classColor, letterSpacing: '0.03em' }}>
              {bliz?.name ?? member.name}
              {member.realName && <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({member.realName})</span>}
            </h2>
            {parse && (
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: parseBadgeColor(parse.pct), border: `1px solid ${parseBadgeColor(parse.pct)}`, borderRadius: 4, padding: '0.15rem 0.5rem' }}>
                {parse.pct}% {parse.diff}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem 1.25rem', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 13 }}>
            {spec && <span>{spec} {charClass}</span>}
            <span>{effectiveRealm} · {region.toUpperCase()}</span>
            {bliz?.level && <span>Lvl {bliz.level}</span>}
            {bliz?.faction && <span>{bliz.faction.charAt(0) + bliz.faction.slice(1).toLowerCase()}</span>}
          </div>
        </div>

        {/* iLvl */}
        {ilvl && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Avg iLvl</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: ilvlColor(ilvl) }}>{ilvl}</div>
          </div>
        )}

        {gearLoading && !bliz && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', alignSelf: 'center' }}>Loading character…</span>}
        {gearError && gearError !== 'API not available' && <span style={{ color: '#ff4444', fontSize: '0.85rem', alignSelf: 'center' }}>{gearError}</span>}
      </div>

      {/* Raidbots */}
      <RaidbotsSection member={member} region={region} realm={effectiveRealm} />

      {/* Gear list from live API */}
      {bliz?.gear && <GearList gear={bliz.gear} />}

      {/* ── Whooplol-specific panels (hardcoded sim data) ── */}
      {isMainChar && (
        <>
          <div className="section">
            <TierProgress gear={data.gear} />
          </div>
          <div className="section">
            <CatalystPlanner gear={data.gear} raidSim={data.raidSim} character={data.character} />
          </div>
          <div className="section main-grid">
            <GearSlots gear={data.gear} selectedSlot={selectedSlot} onSlotClick={(s) => setSelectedSlot(p => p === s ? null : s)} />
            <SimTable
              raidSim={data.raidSim} mythicSim={data.mythicSim}
              activeTab={activeTab} onTabChange={setActiveTab}
              selectedSlot={selectedSlot} onClearSlot={() => setSelectedSlot(null)}
              typeFilter={typeFilter} onTypeFilter={setTypeFilter}
              raidOnly={raidOnly} onRaidOnly={setRaidOnly}
              showCatalyst={showCatalyst} onShowCatalyst={setShowCatalyst}
            />
          </div>
          <div className="section"><UpgradeCharts data={data} /></div>
          <div className="section"><WeeklyTracker bosses={data.raidBossPriority} dungeons={data.dungeonPriority} /></div>
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
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card = {
  background: 'var(--card)', borderRadius: 10, border: '1px solid #2a2a3e',
  padding: '1.25rem', marginBottom: '1.25rem',
}

const sectionTitle = {
  fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: '0.75rem', marginTop: 0, fontWeight: 600,
}

const muted = { fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }

const ghostBtn = {
  background: 'transparent', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: 4, padding: '0.3rem 0.7rem', fontSize: '0.82rem', cursor: 'pointer',
}

const purpleBtn = {
  fontSize: '0.82rem', color: '#a335ee', textDecoration: 'none',
  border: '1px solid #a335ee', borderRadius: 4, padding: '0.3rem 0.7rem',
}
