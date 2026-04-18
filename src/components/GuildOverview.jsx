import { useState, useCallback, useEffect, useMemo, memo } from 'react'
import { useBlizzardAPI, useBlizzardRaids, useCharacterParses } from '../hooks/index.js'
import { useRaidbotsReport, getStoredReportUrl, buildRaidbotsMemberKey } from '../hooks/useRaidbotsReport.js'
import { timeAgo } from '../utils/timeAgo.js'
import ProgressionCharts from './ProgressionCharts.jsx'

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_COLORS = {
  'Death Knight':  '#c41e3a', 'Demon Hunter': '#a330c9', 'Druid':   '#ff7d0a',
  'Evoker':        '#33937f', 'Hunter':       '#abd473', 'Mage':    '#69ccff',
  'Monk':          '#00ff96', 'Paladin':      '#f58cba', 'Priest':  '#ffffff',
  'Rogue':         '#fff569', 'Shaman':       '#0070de', 'Warlock': '#9482c9',
  'Warrior':       '#c79c6e',
}

const OVERVIEW_PROGRESS_CHARACTER = 'Whooplol'

function ilvlColor(ilvl) {
  if (ilvl >= 272) return 'var(--legendary-orange)'
  if (ilvl >= 263) return 'var(--epic-purple)'
  if (ilvl >= 250) return 'var(--rare-blue)'
  if (ilvl >= 232) return 'var(--uncommon-green, #1eff00)'
  return 'var(--text-muted)'
}

function parseBadgeColor(pct) {
  if (pct >= 95) return '#e268a8'
  if (pct >= 75) return '#ff8000'
  if (pct >= 50) return '#1eff00'
  if (pct >= 25) return '#0070dd'
  return '#9d9d9d'
}

function avgParseFromWCL(wclData) {
  if (!wclData) return null
  // Prefer heroic, fall back to normal — only count bosses with at least one kill
  let rankings = (wclData.rankingsHeroic?.rankings ?? []).filter(r => (r.totalKills ?? 0) > 0)
  let diff = 'H'
  if (!rankings.length) {
    rankings = (wclData.rankingsNormal?.rankings ?? []).filter(r => (r.totalKills ?? 0) > 0)
    diff = 'N'
  }
  if (!rankings.length) return null
  const avg = rankings.reduce((s, r) => s + (r.rankPercent ?? 0), 0) / rankings.length
  return { pct: Math.round(avg), diff, bossCount: rankings.length }
}

// ── Guild Summary Bar ─────────────────────────────────────────────────────────

function GuildSummaryBar({ memberData }) {
  const values = Object.values(memberData)
  if (!values.length) return null

  const ilvls      = values.map(d => d.avgIlvl).filter(Boolean)
  const avgIlvl    = ilvls.length ? Math.round(ilvls.reduce((s, v) => s + v, 0) / ilvls.length) : null
  const count4pc   = values.filter(d => (d.tierCount ?? 0) >= 4).length
  const count2pc   = values.filter(d => (d.tierCount ?? 0) >= 2 && (d.tierCount ?? 0) < 4).length
  const countCraft = values.filter(d => d.hasCraftedWeapon).length

  return (
    <div style={summaryBarStyle}>
      {avgIlvl && (
        <span className="stat-pill stat-pill-ilvl">⚔ {avgIlvl} avg iLvl</span>
      )}
      {count4pc > 0 && (
        <span className="stat-pill stat-pill-4pc">✦ {count4pc}× 4pc</span>
      )}
      {count2pc > 0 && (
        <span className="stat-pill stat-pill-2pc">◈ {count2pc}× 2pc</span>
      )}
      {countCraft > 0 && (
        <span className="stat-pill stat-pill-weapon">⚒ {countCraft}× crafted wep</span>
      )}
    </div>
  )
}

// ── MemberCard (memoized) ────────────────────────────────────────────────────

const MemberCard = memo(function MemberCard({ member, region, realm, onSelectMember, onDataLoaded, onParseLoaded, onDpsLoaded }) {
  const effectiveRealm = member.realm?.trim() || realm
  const memberKey      = buildRaidbotsMemberKey(region, effectiveRealm, member.name)

  const { data, loading: gearLoading, error: gearError, refresh, fetchedAt: blizFetchedAt } = useBlizzardAPI(member.name, effectiveRealm, region)
  const { data: wclData, loading: wclLoading, refresh: refreshWCL } = useCharacterParses(member.name, effectiveRealm, region)
  const refreshAll = useCallback((e) => { e.stopPropagation(); refresh(); refreshWCL() }, [refresh, refreshWCL])
  const reportUrl = member.reportUrl ?? member.report_url ?? getStoredReportUrl(memberKey)
  const { dps } = useRaidbotsReport(reportUrl)

  // Fix 1: Lift data up via useEffect (not during render)
  useEffect(() => {
    if (data && onDataLoaded) onDataLoaded(member.name, data)
  }, [data, member.name, onDataLoaded])

  const parse = useMemo(() => avgParseFromWCL(wclData), [wclData])

  useEffect(() => {
    if (parse && onParseLoaded) onParseLoaded(member.name, parse.pct)
  }, [parse, member.name, onParseLoaded])

  useEffect(() => {
    if (dps > 0 && onDpsLoaded) onDpsLoaded(member.name, dps)
  }, [dps, member.name, onDpsLoaded])

  const classColor = CLASS_COLORS[data?.class ?? member.class] ?? '#e0e0e0'
  const ilvl = data?.avgIlvl ?? null

  // Fix 3: Stable onSelect — call onSelectMember with member from inside the card
  const handleClick = useCallback(() => { onSelectMember?.(member) }, [onSelectMember, member])

  return (
    <div
      onClick={handleClick}
      style={memberCardStyle}
      onMouseEnter={e => { e.currentTarget.style.borderColor = classColor; e.currentTarget.style.boxShadow = `0 0 12px ${classColor}33` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Name + class */}
      <div>
        <div style={nameRowStyle}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: classColor }}>{member.name}</span>
          </div>
          {!member.isMain && (
            <span style={altBadgeStyle}>alt</span>
          )}
        </div>
        <div style={specLineStyle}>
          {[data?.spec ?? member.spec, data?.class ?? member.class].filter(Boolean).join(' ') || '—'} · {member.role}
        </div>
      </div>

      {/* iLvl */}
      <div style={ilvlRowStyle}>
        {gearLoading && !data && <span style={loadingTextStyle}>Loading gear…</span>}
        {gearError && gearError !== 'API not available' && (
          <span style={errorTextStyle}>{gearError}</span>
        )}
        {gearError === 'API not available' && (
          <span style={mutedSmallStyle}>API offline</span>
        )}
        {ilvl !== null && (
          <>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: ilvlColor(ilvl), lineHeight: 1 }}>{ilvl}</span>
            <span style={mutedSmallStyle}>avg iLvl</span>
            {blizFetchedAt && <span style={cardFetchedAtStyle}>{timeAgo(blizFetchedAt)}</span>}
            <button onClick={refreshAll} disabled={gearLoading || wclLoading} style={refreshIconBtn} title="Refresh">
              {gearLoading || wclLoading ? '…' : '↻'}
            </button>
          </>
        )}
        {!data && !gearLoading && !gearError && (
          <button onClick={(e) => { e.stopPropagation(); refresh() }} style={ghostBtn}>Load data →</button>
        )}
      </div>

      {/* Tier / crafted weapon badges */}
      {data && (
        <div style={badgeRowStyle}>
          {(data.tierCount ?? 0) >= 4 && <span className="badge badge-4pc">4pc ✦</span>}
          {(data.tierCount ?? 0) >= 2 && (data.tierCount ?? 0) < 4 && <span className="badge badge-2pc">2pc</span>}
          {data.hasCraftedWeapon && <span className="badge badge-crafted">⚒ {data.craftedWeaponIlvl}</span>}
        </div>
      )}

      {/* WCL parse */}
      <div style={parseRowStyle}>
        {wclLoading && <span style={fetchingTextStyle}>Fetching parses…</span>}
        {parse && (
          <span style={{
            fontSize: '1rem', fontWeight: 700,
            color: parseBadgeColor(parse.pct),
            border: `1px solid ${parseBadgeColor(parse.pct)}`,
            borderRadius: '4px', padding: '0.2rem 0.6rem',
          }}>
            {parse.pct}% {parse.diff}
          </span>
        )}
        {!wclLoading && !parse && data && (
          <span style={fetchingTextStyle}>No WCL data</span>
        )}
        {dps > 0 && (
          <span style={dpsLabelStyle}>
            {(dps / 1000).toFixed(1)}k DPS
          </span>
        )}
      </div>

      {/* Chevron */}
      <span style={chevronStyle}>→</span>
    </div>
  )
})

// ── GuildOverview ─────────────────────────────────────────────────────────────

function HeroicProgressPanel({ guild, onSelectMember }) {
  const whooplolMember = useMemo(
    () => (guild?.members ?? []).find((member) => member?.name?.toLowerCase() === OVERVIEW_PROGRESS_CHARACTER.toLowerCase()) ?? null,
    [guild?.members],
  )
  const progressRealm = whooplolMember?.realm?.trim() || guild?.realm
  const progressRegion = guild?.region || 'eu'
  const { data: summary, loading, error } = useBlizzardRaids(OVERVIEW_PROGRESS_CHARACTER, progressRealm, progressRegion)

  const progressLabel = summary?.bossCount > 0
    ? `${summary.progressedBossCount} / ${summary.bossCount} bosses`
    : 'No heroic data yet'
  const updatedLabel = summary?.lastUpdated
    ? `Updated ${timeAgo(new Date(summary.lastUpdated).getTime())}`
    : `${summary?.expansionName ?? 'Midnight'} Heroic`
  const missingSummary = summary?.raids?.map((raid) => ({
    raidName: raid.name,
    missingBosses: raid.bosses.filter((boss) => !boss.progressed).map((boss) => boss.name),
  })) ?? []

  return (
    <section className="wcl-section overview-card heroic-progress-card">
      <div className="heroic-progress-header">
        <div className="progression-card-copy">
          <div className="progression-card-kicker">Heroic Progress</div>
          <h3 className="progression-card-title">Whooplol raid status</h3>
          <p className="progression-card-subtitle">
            Exact Blizzard progress for Midnight Heroic kills.
          </p>
        </div>

        {whooplolMember && (
          <button
            type="button"
            className="btn-pill"
            onClick={() => onSelectMember?.(whooplolMember)}
          >
            Open {OVERVIEW_PROGRESS_CHARACTER}
          </button>
        )}
      </div>

      <div className="heroic-progress-summary">
        <span className="heroic-progress-count">{progressLabel}</span>
        <span className="heroic-progress-threshold">{updatedLabel}</span>
        {loading && <span className="heroic-progress-loading">Loading Blizzard raids...</span>}
        {error && <span className="heroic-progress-loading">{error}</span>}
      </div>

      <div className="heroic-progress-raid-list">
        {summary?.raids?.length > 0 ? summary.raids.map((raid) => (
          <div key={raid.name} className="heroic-progress-raid-row">
            <div className="heroic-progress-raid-name">
              <span>{raid.name}</span>
              <span className="heroic-progress-raid-meta">
                {raid.progressedBossCount}/{raid.bosses.length}
              </span>
            </div>
            <div className="heroic-progress-bosses">
              {raid.bosses.filter((boss) => !boss.progressed).length > 0 ? raid.bosses.filter((boss) => !boss.progressed).map((boss) => (
                <span key={boss.name} className="heroic-boss-chip missing">
                  {boss.name}
                </span>
              )) : (
                <span className="heroic-boss-chip progressed">Clear</span>
              )}
            </div>
          </div>
        )) : (
          <p className="heroic-progress-empty">
            {loading ? 'Loading Blizzard raids...' : error ? 'Unable to load Blizzard raid progress right now.' : 'No heroic boss data yet.'}
          </p>
        )}
      </div>

      <div className="heroic-progress-footer">
        {missingSummary.length > 0
          ? missingSummary.map((raid) => (
            <span key={raid.raidName} className="heroic-progress-footer-row">
              {raid.raidName}: {raid.missingBosses.length > 0 ? raid.missingBosses.join(', ') : 'clear'}
            </span>
          ))
          : summary?.bossCount > 0
            ? 'Full clear on the tracked heroic bosses.'
            : 'Waiting for Blizzard heroic boss data.'}
      </div>
    </section>
  )
}

export default function GuildOverview({ guild, onSelectMember }) {
  const [showAlts, setShowAlts] = useState(false)
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState('ilvl')
  const [memberData, setMemberData] = useState({})
  const [parseCache, setParseCache] = useState({})
  const [dpsCache, setDpsCache] = useState({})

  const onDataLoaded = useCallback((name, data) => setMemberData((prev) => (prev[name] === data ? prev : { ...prev, [name]: data })), [])
  const onParseLoaded = useCallback((name, pct) => setParseCache((prev) => (prev[name] === pct ? prev : { ...prev, [name]: pct })), [])
  const onDpsLoaded = useCallback((name, dps) => setDpsCache((prev) => (prev[name] === dps ? prev : { ...prev, [name]: dps })), [])

  if (!guild?.members?.length) {
    return (
      <section style={containerStyle}>
        <h2 style={headingStyle}>Guild Overview</h2>
        <p style={emptyMsgStyle}>
          No members configured. Open Settings to add guild members.
        </p>
      </section>
    )
  }

  const displayed = guild.members
    .filter((member) => showAlts || member.isMain !== false)
    .filter((member) => roleFilter === 'all' || member.role === roleFilter)
    .sort((a, b) => {
      if (sortBy === 'ilvl') return (memberData[b.name]?.avgIlvl ?? 0) - (memberData[a.name]?.avgIlvl ?? 0)
      if (sortBy === 'parse') return (parseCache[b.name] ?? 0) - (parseCache[a.name] ?? 0)
      if (sortBy === 'dps') return (dpsCache[b.name] ?? 0) - (dpsCache[a.name] ?? 0)
      return 0
    })

  const mainMember = guild.members.find((member) => member.isMain) ?? guild.members[0] ?? null

  return (
    <section style={containerStyle}>
      <div style={headingRowStyle}>
        <h2 style={{ ...headingStyle, marginBottom: 0 }}>
          {guild.name ? `${guild.name} ` : ''}Guild Overview
          <span style={headingSubStyle}>
            {guild.realm} · {guild.region.toUpperCase()}
          </span>
        </h2>
      </div>

      <GuildSummaryBar memberData={memberData} />

      <div className="overview-grid">
        <HeroicProgressPanel
          guild={guild}
          onSelectMember={onSelectMember}
        />
        {mainMember && (
          <ProgressionCharts characterName={mainMember.name} title="Progression" />
        )}
      </div>

      <div className="filter-bar" style={filterBarMargin}>
        <div className="filter-group filter-group-label">
          <span className="filter-label">Role</span>
          {[['all', 'All'], ['tank', 'Tank'], ['healer', 'Healer'], ['dps', 'DPS']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn-pill${roleFilter === key ? ' active' : ''}`}
              onClick={() => setRoleFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="filter-group filter-group-label">
          <span className="filter-label">Sort</span>
          {[['ilvl', 'iLvl'], ['parse', 'Parse %'], ['dps', 'Sim DPS']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn-pill${sortBy === key ? ' active' : ''}`}
              onClick={() => setSortBy(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn-pill${showAlts ? ' active' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowAlts((value) => !value)}
        >
          {showAlts ? 'Hide alts' : 'Show alts'}
        </button>
      </div>

      <div style={cardsContainerStyle}>
        {displayed.map((member) => (
          <MemberCard
            key={member.name}
            member={member}
            region={guild.region}
            realm={guild.realm}
            onSelectMember={onSelectMember}
            onDataLoaded={onDataLoaded}
            onParseLoaded={onParseLoaded}
            onDpsLoaded={onDpsLoaded}
          />
        ))}
        {displayed.length === 0 && (
          <p style={emptyMsgStyle}>No members match this filter.</p>
        )}
      </div>
    </section>
  )
}

// ── Styles (module-level constants — no re-creation per render) ──────────────

const ghostBtn = {
  background: 'transparent', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer',
}

const containerStyle = {
  background: 'var(--card)', borderRadius: '10px', padding: '1.25rem',
  border: '1px solid #2a2a3e', marginBottom: '1.5rem',
}

const headingStyle = {
  fontSize: '1rem', fontWeight: 700, color: 'var(--frost-blue)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', marginTop: 0,
}

const memberCardStyle = {
  background: 'var(--card)', borderRadius: '8px', padding: '1rem',
  border: '1px solid #2a2a3e', display: 'flex', flexDirection: 'column', gap: '0.55rem',
  minWidth: '220px', flex: '1 1 220px', cursor: 'pointer',
  transition: 'border-color 0.15s, box-shadow 0.15s', position: 'relative',
}

const summaryBarStyle = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }
const headingRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }
const headingSubStyle = { fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }
const filterBarMargin = { marginBottom: '1rem' }
const cardsContainerStyle = { display: 'flex', flexWrap: 'wrap', gap: '1rem' }
const emptyMsgStyle   = { color: 'var(--text-muted)', fontSize: '0.9rem' }
const nameRowStyle    = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const altBadgeStyle   = { fontSize: '0.7rem', color: 'var(--text-muted)', border: '1px solid #444', borderRadius: '3px', padding: '0.1rem 0.4rem' }
const specLineStyle   = { fontSize: '0.8rem', color: 'var(--text-muted)' }
const ilvlRowStyle    = { display: 'flex', alignItems: 'baseline', gap: '0.5rem' }
const loadingTextStyle = { color: 'var(--text-muted)', fontSize: '0.85rem' }
const errorTextStyle  = { color: '#ff4444', fontSize: '0.8rem' }
const mutedSmallStyle = { color: 'var(--text-muted)', fontSize: '0.8rem' }
const badgeRowStyle   = { display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }
const parseRowStyle   = { display: 'flex', alignItems: 'center', gap: '0.5rem' }
const fetchingTextStyle = { fontSize: '0.75rem', color: 'var(--text-muted)' }
const dpsLabelStyle   = { fontSize: '0.85rem', fontWeight: 600, color: '#a335ee' }
const chevronStyle      = { position: 'absolute', bottom: '0.7rem', right: '0.9rem', fontSize: '0.85rem', color: 'var(--text-muted)', pointerEvents: 'none' }
const cardFetchedAtStyle = { fontSize: '0.68rem', color: 'var(--text-muted)', opacity: 0.6, marginLeft: 'auto' }
const refreshIconBtn    = { background: 'transparent', border: 'none', color: 'var(--frost-blue)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 2px', lineHeight: 1, opacity: 0.7 }
