import data from '../data.json'
import { useStorage } from '../hooks/index.js'
import { useBlizzardAPI, useBlizzardMedia } from '../hooks/useBlizzardAPI.js'
import { useCharacterParses } from '../hooks/useWCLAPI.js'
import { useRaidbotsReport, getStoredReportUrl, buildRaidbotsMemberKey } from '../hooks/useRaidbotsReport.js'
import { useDroptimizerReport, getStoredDroptimizerUrl, buildDroptimizerMemberKey } from '../hooks/useDroptimizerReport.js'
import { useSimPriorities } from '../hooks/useSimPriorities.js'
import { useState, useEffect, useMemo, useRef } from 'react'
import { timeAgo } from '../utils/timeAgo.js'
import { identityNamesEqual } from '../utils/characterIdentity.js'
import ProgressionCharts from './ProgressionCharts.jsx'
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

function AutomatedPrioritiesSection({ member }) {
  const { data: priorities, loading, error } = useSimPriorities(member.name)
  const [activeScenario, setActiveScenario] = useState('raid_heroic')
  const scenarios = priorities?.scenarios ?? {}
  const active = scenarios[activeScenario] ?? null

  useEffect(() => {
    if (scenarios[activeScenario]) return
    const firstKey = Object.keys(scenarios).find((key) => scenarios[key])
    if (firstKey) setActiveScenario(firstKey)
  }, [activeScenario, scenarios])

  const statusText = active?.status === 'completed'
    ? (active.completedAt ? `Updated ${timeAgo(active.completedAt)}` : 'Completed')
    : active?.status === 'failed'
      ? 'Automation failed'
      : active?.status === 'retryable'
        ? 'Retry scheduled'
        : active?.status === 'queued'
          ? 'Queued for automation'
      : active?.status === 'running'
        ? 'Automation running'
        : 'No automation result yet'

  return (
    <div style={card}>
      <div style={automationHeaderStyle}>
        <div>
          <h3 style={{ ...sectionTitle, marginBottom: '0.35rem' }}>Upgrade Priorities</h3>
          <p style={muted}>Daily stored recommendations from automated Droptimizer runs.</p>
        </div>
        {active && <span style={automationStatusStyle}>{statusText}</span>}
      </div>

      <div style={automationTabRowStyle}>
        {Object.entries(scenarios).map(([key, value]) => (
          <button
            key={key}
            onClick={() => setActiveScenario(key)}
            style={key === activeScenario ? activeTabBtnStyle : tabBtnStyle}
          >
            {value?.label ?? key}
          </button>
        ))}
      </div>

      {loading && <p style={muted}>Loading automated priorities…</p>}
      {error && <p style={{ color: '#ff4444', fontSize: '0.85rem' }}>{error}</p>}

      {!loading && active && (
        <>
          <p style={{ ...muted, marginBottom: '0.9rem' }}>
            {[active.difficulty, active.baseDps > 0 && `${(active.baseDps / 1000).toFixed(1)}k base DPS`, active.upgrades?.length ? `${active.upgrades.length} items` : null]
              .filter(Boolean)
              .join(' · ')}
            {active.lastError && active.status === 'failed' ? ` · ${active.lastError}` : ''}
          </p>

          {active.priorities?.length > 0 && (
            <div style={priorityGroupWrapStyle}>
              {active.priorities.slice(0, 4).map((group) => (
                <div key={`${group.sourceType}-${group.sourceId ?? group.sourceName}`} style={priorityGroupCardStyle}>
                  <div style={priorityGroupTitleStyle}>{group.sourceName}</div>
                  <div style={priorityGroupMetaStyle}>Best drop +{group.bestDrop.toLocaleString()} DPS</div>
                  {group.topItems.map((item) => (
                    <div key={`${item.itemId}-${item.slot}`} style={priorityItemStyle}>
                      <span>{item.itemName}</span>
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>+{item.dpsDelta.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {active.upgrades?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="sim-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Slot</th>
                    <th>Source</th>
                    <th>iLvl</th>
                    <th>+DPS</th>
                    <th>+%</th>
                  </tr>
                </thead>
                <tbody>
                  {active.upgrades.slice(0, 12).map((row) => (
                    <tr key={`${row.itemId}-${row.slot}-${row.sourceId ?? row.sourceName}`}>
                      <td style={{ fontWeight: 500 }}>{row.itemName ?? row.name}</td>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{row.slot || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{row.sourceName ?? row.source ?? '—'}</td>
                      <td>{row.itemLevel ?? '—'}</td>
                      <td style={{ fontWeight: 700, color: dpsDeltaColor(row.dpsDelta), whiteSpace: 'nowrap' }}>+{row.dpsDelta.toLocaleString()}</td>
                      <td style={{ fontWeight: 600, color: dpsDeltaColor(row.dpsDelta), whiteSpace: 'nowrap' }}>+{Number(row.dpsPct ?? 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={muted}>No automated upgrade items stored for this scenario yet.</p>
          )}
        </>
      )}
    </div>
  )
}

// ── RaidbotsSection ───────────────────────────────────────────────────────────

function RaidbotsSection({ member, region, realm, onUpdateMember, writeToken }) {
  const memberKey   = buildRaidbotsMemberKey(region, realm, member.name)
  // Prefer URL from Supabase-synced member object; fall back to localStorage
  const [reportUrl, setReportUrl] = useState(() => member.reportUrl ?? member.report_url ?? getStoredReportUrl(memberKey) ?? '')
  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState('')

  const { dps, spec: reportSpec, loading, error, fetchedAt } = useRaidbotsReport(reportUrl)
  const deepLink = `https://www.raidbots.com/simbot/quick?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(member.name)}`
  const pendingSnapshot = useRef(false)

  // Fire sim snapshot once DPS loads after a user-triggered save
  useEffect(() => {
    if (!pendingSnapshot.current || !dps || dps <= 0 || !writeToken) return
    pendingSnapshot.current = false
    fetch('/api/snapshots?type=sim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Write-Token': writeToken },
      body: JSON.stringify({
        character_name: member.name,
        dps,
        report_url: reportUrl,
        report_type: 'quick',
        spec: reportSpec ?? member.spec ?? undefined,
      }),
    }).catch(() => {})
  }, [dps]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-learn spec/role from report once it loads
  useEffect(() => {
    if (reportSpec && onUpdateMember) {
      onUpdateMember(member.name, { spec: reportSpec, role: specToRole(reportSpec) })
    }
  }, [reportSpec]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync incoming member.reportUrl changes (e.g. loaded from Supabase after mount)
  useEffect(() => {
    const remote = member.reportUrl ?? member.report_url
    if (remote && remote !== reportUrl) setReportUrl(remote)
  }, [member.reportUrl, member.report_url]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const t = draft.trim()
    setReportUrl(t)
    setEditing(false)
    pendingSnapshot.current = true
    // Sync to Supabase via App.jsx updateMember → setGuild → postCharactersToApi
    if (onUpdateMember) onUpdateMember(member.name, { reportUrl: t })
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
          {fetchedAt && <span style={fetchedAtStyle}>{timeAgo(fetchedAt)}</span>}
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
          <button onClick={() => { setReportUrl(''); if (onUpdateMember) onUpdateMember(member.name, { reportUrl: '' }) }} style={{ ...ghostBtn, borderColor: '#555', color: '#666' }}>Clear</button>
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

// ── DroptimizerSection ────────────────────────────────────────────────────────

function ilvlClass(ilvl) {
  if (ilvl >= 272) return 'ilvl-legendary'
  if (ilvl >= 263) return 'ilvl-epic'
  if (ilvl >= 250) return 'ilvl-rare'
  if (ilvl >= 232) return 'ilvl-uncommon'
  return 'ilvl-common'
}

function dpsDeltaColor(delta) {
  if (delta > 0) return 'var(--success)'
  if (delta < 0) return 'var(--legendary-orange)'
  return 'var(--text-muted)'
}

function qualityColor(quality) {
  switch (quality) {
    case 'LEGENDARY': return 'var(--legendary-orange)'
    case 'EPIC':      return 'var(--epic-purple)'
    case 'RARE':      return 'var(--rare-blue)'
    case 'UNCOMMON':  return 'var(--uncommon-green)'
    default:          return 'var(--text)'
  }
}

function DroptimizerSection({ member, region, realm, onUpdateMember }) {
  const memberKey = buildDroptimizerMemberKey(region, realm, member.name)
  // Prefer URL from Supabase-synced member object; fall back to localStorage
  const [reportUrl, setReportUrl] = useState(() => member.droptimizerUrl ?? member.droptimizer_url ?? getStoredDroptimizerUrl(memberKey) ?? '')
  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState('')
  const [sortKey, setSortKey]     = useState('dpsDelta')
  const [sortDir, setSortDir]     = useState('desc')

  const { upgrades, baseDps, spec, difficulty, loading, error, fetchedAt } = useDroptimizerReport(reportUrl)

  const deepLink = `https://www.raidbots.com/simbot/droptimizer?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(member.name)}`

  // Sync incoming member.droptimizerUrl changes (e.g. loaded from Supabase after mount)
  useEffect(() => {
    const remote = member.droptimizerUrl ?? member.droptimizer_url
    if (remote && remote !== reportUrl) setReportUrl(remote)
  }, [member.droptimizerUrl, member.droptimizer_url]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const t = draft.trim()
    setReportUrl(t)
    setEditing(false)
    // Sync to Supabase via App.jsx updateMember → setGuild → postCharactersToApi
    if (onUpdateMember) onUpdateMember(member.name, { droptimizerUrl: t })
  }

  const handleSort = (key) => {
    setSortDir(prev => sortKey === key ? (prev === 'desc' ? 'asc' : 'desc') : 'desc')
    setSortKey(key)
  }

  const sorted = useMemo(() => {
    if (!upgrades) return []
    return [...upgrades].sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [upgrades, sortKey, sortDir])

  const COLS = [
    { key: 'name',      label: 'Item' },
    { key: 'slot',      label: 'Slot' },
    { key: 'itemLevel', label: 'iLvl' },
    { key: 'source',    label: 'Source' },
    { key: 'dpsDelta',  label: '+DPS' },
    { key: 'dpsPct',    label: '+%' },
  ]

  return (
    <div style={card}>
      <h3 style={sectionTitle}>Droptimizer</h3>
      {loading && <p style={muted}>Loading report…</p>}
      {error && error !== 'API not available' && (
        <p style={{ color: '#ff4444', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</p>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <a href={deepLink} target="_blank" rel="noreferrer" style={purpleBtn}>Run Droptimizer ↗</a>
        {!editing && (
          <button onClick={() => { setDraft(reportUrl); setEditing(true) }} style={ghostBtn}>
            {reportUrl ? 'Update report' : 'Paste report URL'}
          </button>
        )}
        {reportUrl && !editing && (
          <button
            onClick={() => { setReportUrl(''); if (onUpdateMember) onUpdateMember(member.name, { droptimizerUrl: '' }) }}
            style={{ ...ghostBtn, borderColor: '#555', color: '#666' }}
          >Clear</button>
        )}
        {reportUrl && !editing && !loading && (
          <a href={`https://www.raidbots.com/simbot/report/${reportUrl.match(/report\/([A-Za-z0-9]+)/)?.[1] ?? reportUrl}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize: '0.8rem', color: 'var(--frost-blue)', alignSelf: 'center' }}>
            View report ↗
          </a>
        )}
      </div>

      {/* URL input */}
      {editing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="https://www.raidbots.com/simbot/report/..."
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            style={{ flex: 1, background: '#0d0d1a', border: '1px solid #444', color: '#e0e0e0', borderRadius: 4, padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
          />
          <button onClick={save} style={{ ...ghostBtn, borderColor: 'var(--success)', color: 'var(--success)' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ ...ghostBtn, borderColor: '#555', color: '#666' }}>✕</button>
        </div>
      )}

      {/* Results */}
      {upgrades && upgrades.length === 0 && !loading && (
        <p style={muted}>No upgrades found in this report.</p>
      )}

      {upgrades && upgrades.length > 0 && (
        <>
          {/* Metadata */}
          <p style={{ ...muted, marginBottom: '0.75rem' }}>
            {[
              spec,
              difficulty && difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
              baseDps > 0 && `${(baseDps / 1000).toFixed(1)}k base DPS`,
              `${upgrades.length} items`,
            ].filter(Boolean).join(' · ')}
            {fetchedAt && <span style={fetchedAtStyle}> · {timeAgo(fetchedAt)}</span>}
          </p>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="sim-table">
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        cursor: 'pointer', userSelect: 'none',
                        color: sortKey === col.key ? 'var(--frost-blue)' : undefined,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}{sortKey === col.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={`${row.itemId}-${i}`}>
                    <td style={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: qualityColor(row.quality) }}>
                      {row.name}
                    </td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{row.slot || '—'}</td>
                    <td>
                      {row.itemLevel
                        ? <span className={ilvlClass(row.itemLevel)}>{row.itemLevel}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.source || '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: dpsDeltaColor(row.dpsDelta), whiteSpace: 'nowrap' }}>
                      {row.dpsDelta >= 0 ? '+' : ''}{row.dpsDelta.toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, color: dpsDeltaColor(row.dpsDelta), whiteSpace: 'nowrap' }}>
                      {row.dpsPct >= 0 ? '+' : ''}{row.dpsPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── WclSection ────────────────────────────────────────────────────────────────

function WclSection({ wclData, loading, fetchedAt }) {
  const [expanded, setExpanded] = useState(false)

  const { bosses, diff, zoneName, avgPct } = useMemo(() => {
    if (!wclData) return { bosses: [], diff: null, zoneName: null, avgPct: null }
    let rankings = (wclData.rankingsHeroic?.rankings ?? []).filter(r => (r.totalKills ?? 0) > 0)
    let diff = 'Heroic'
    let zone = wclData.rankingsHeroic?.zone
    if (!rankings.length) {
      rankings = (wclData.rankingsNormal?.rankings ?? []).filter(r => (r.totalKills ?? 0) > 0)
      diff = 'Normal'
      zone = wclData.rankingsNormal?.zone
    }
    if (!rankings.length) return { bosses: [], diff: null, zoneName: zone?.name ?? null, avgPct: null }
    const avg = rankings.reduce((s, r) => s + (r.rankPercent ?? 0), 0) / rankings.length
    return { bosses: rankings, diff, zoneName: zone?.name ?? null, avgPct: Math.round(avg) }
  }, [wclData])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: expanded ? '0.75rem' : 0 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Warcraft Logs</h3>
        {loading && <span style={muted}>Fetching parses…</span>}
        {!loading && zoneName && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{zoneName} · {diff}</span>}
        {!loading && fetchedAt && <span style={fetchedAtStyle}>{timeAgo(fetchedAt)}</span>}
        {!loading && avgPct !== null && (
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: parseBadgeColor(avgPct), border: `1px solid ${parseBadgeColor(avgPct)}`, borderRadius: 4, padding: '0.1rem 0.45rem' }}>
            avg {avgPct}%
          </span>
        )}
        {!loading && !avgPct && wclData && <span style={muted}>No parse data found.</span>}
        {!loading && bosses.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ ...ghostBtn, marginLeft: 'auto', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
          >
            {expanded ? '▲ Hide' : `▼ ${bosses.length} bosses`}
          </button>
        )}
      </div>

      {expanded && bosses.length > 0 && (
        <table className="wcl-boss-table">
          <thead>
            <tr>
              <th>Boss</th>
              <th>Parse</th>
              <th>Kills</th>
            </tr>
          </thead>
          <tbody>
            {bosses.map(r => {
              const pct = Math.round(r.rankPercent ?? 0)
              return (
                <tr key={r.encounter?.id ?? r.encounter?.name}>
                  <td>{r.encounter?.name ?? '—'}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: parseBadgeColor(pct) }}>{pct}%</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.totalKills ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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

export default function CharacterView({ member, guild, onBack, onUpdateMember, writeToken }) {
  const effectiveRealm = member.realm?.trim() || guild.realm
  const region         = guild.region

  const { data: bliz, loading: gearLoading, error: gearError, fetchedAt: blizFetchedAt, refresh: refreshBliz } = useBlizzardAPI(member.name, effectiveRealm, region)
  const { avatarUrl }  = useBlizzardMedia(member.name, effectiveRealm, region)
  const { data: wcl, loading: wclLoading, fetchedAt: wclFetchedAt, refresh: refreshWCL } = useCharacterParses(member.name, effectiveRealm, region)

  const refreshAll = () => { refreshBliz(); refreshWCL() }
  const refreshing = gearLoading || wclLoading

  // Auto-learn class/spec/role from Blizzard API (in useEffect, not during render)
  useEffect(() => {
    const blizSpec  = bliz?.spec  ?? null
    const blizClass = bliz?.class ?? null
    if (bliz && onUpdateMember && (blizSpec !== member.spec || blizClass !== member.class)) {
      onUpdateMember(member.name, {
        class: blizClass ?? member.class,
        spec:  blizSpec  ?? member.spec,
        role:  specToRole(blizSpec) ?? member.role,
      })
    }
  }, [bliz?.spec, bliz?.class]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sim table state (only relevant for the main character with hardcoded data)
  const [activeTab, setActiveTab]     = useStorage('tab', 'raid')
  const [selectedSlot, setSelectedSlot] = useStorage('slot', null)
  const [typeFilter, setTypeFilter]   = useStorage('filter', 'all')
  const [raidOnly, setRaidOnly]       = useStorage('raidonly', false)
  const [showCatalyst, setShowCatalyst] = useStorage('catalyst', true)

  const isMainChar = identityNamesEqual(member.name, data.character.name)

  const parse     = bestParse(wcl)
  const classColor = CLASS_COLORS[bliz?.class ?? member.class] ?? '#e0e0e0'
  const ilvl      = bliz?.avgIlvl ?? null
  const spec      = bliz?.spec ?? ''
  const charClass = bliz?.class ?? member.class ?? ''

  return (
    <div className="app-container">
      {/* Back button */}
      <div style={backBtnWrap}>
        <button onClick={onBack} style={backBtnStyle}>
          ← Back to guild
        </button>
        <button onClick={refreshAll} disabled={refreshing} style={refreshBtnStyle} title="Refresh gear & parses">
          {refreshing ? '…' : '↻'} Refresh
        </button>
      </div>

      {/* Character hero */}
      <div style={heroStyle}>
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
            {blizFetchedAt && <div style={fetchedAtStyle}>{timeAgo(blizFetchedAt)}</div>}
          </div>
        )}

        {gearLoading && !bliz && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', alignSelf: 'center' }}>Loading character…</span>}
        {gearError && gearError !== 'API not available' && <span style={{ color: '#ff4444', fontSize: '0.85rem', alignSelf: 'center' }}>{gearError}</span>}
      </div>

      {/* Automated daily Droptimizer priorities */}
      <AutomatedPrioritiesSection member={member} />

      {/* Raidbots Quick Sim */}
      <RaidbotsSection member={member} region={region} realm={effectiveRealm} onUpdateMember={onUpdateMember} writeToken={writeToken} />

      {/* Droptimizer */}
      <DroptimizerSection member={member} region={region} realm={effectiveRealm} onUpdateMember={onUpdateMember} />

      {/* Warcraft Logs — per-boss parses */}
      <WclSection wclData={wcl} loading={wclLoading} fetchedAt={wclFetchedAt} />

      {/* Progression history — iLvl + sim DPS over time */}
      <ProgressionCharts characterName={member.name} />

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

const fetchedAtStyle = { fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.7 }

const automationHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '0.75rem',
  marginBottom: '0.85rem',
  flexWrap: 'wrap',
}

const automationStatusStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  border: '1px solid #3a3a56',
  borderRadius: 999,
  padding: '0.2rem 0.6rem',
  whiteSpace: 'nowrap',
}

const automationTabRowStyle = { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }

const tabBtnStyle = {
  background: 'transparent',
  border: '1px solid #3a3a56',
  color: 'var(--text-muted)',
  borderRadius: 6,
  padding: '0.35rem 0.8rem',
  fontSize: '0.82rem',
  cursor: 'pointer',
}

const activeTabBtnStyle = {
  ...tabBtnStyle,
  borderColor: 'var(--frost-blue)',
  color: 'var(--frost-blue)',
  boxShadow: '0 0 0 1px rgba(105,204,255,0.15)',
}

const priorityGroupWrapStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.75rem',
  marginBottom: '1rem',
}

const priorityGroupCardStyle = {
  background: '#111125',
  border: '1px solid #2b2b44',
  borderRadius: 8,
  padding: '0.85rem',
}

const priorityGroupTitleStyle = {
  fontSize: '0.9rem',
  fontWeight: 700,
  marginBottom: '0.2rem',
}

const priorityGroupMetaStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  marginBottom: '0.6rem',
}

const priorityItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
  fontSize: '0.82rem',
  paddingTop: '0.25rem',
}

const ghostBtn = {
  background: 'transparent', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: 4, padding: '0.3rem 0.7rem', fontSize: '0.82rem', cursor: 'pointer',
}

const purpleBtn = {
  fontSize: '0.82rem', color: '#a335ee', textDecoration: 'none',
  border: '1px solid #a335ee', borderRadius: 4, padding: '0.3rem 0.7rem',
}

const backBtnWrap = { marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }

const backBtnStyle = {
  background: 'transparent', border: '1px solid #444', color: 'var(--text-muted)',
  borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
}

const refreshBtnStyle = {
  background: 'transparent', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginLeft: 'auto',
}

const heroStyle = {
  background: 'linear-gradient(135deg, #111128 0%, #1a1a35 60%, #0d1520 100%)',
  borderRadius: 10, border: '1px solid var(--border)', padding: '1.5rem',
  marginBottom: '1.5rem', display: 'flex', gap: '1.25rem',
  alignItems: 'flex-start', flexWrap: 'wrap',
}
