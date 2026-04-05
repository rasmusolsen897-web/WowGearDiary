import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useBlizzardAPI, useBlizzardMedia, useCharacterParses } from '../hooks/index.js'
import { useRaidbotsReport, getStoredReportUrl } from '../hooks/useRaidbotsReport.js'
import { timeAgo } from '../utils/timeAgo.js'
import { getAverageWclParse } from '../utils/wclRankings.js'

const CLASS_COLORS = {
  'Death Knight': '#c41e3a',
  'Demon Hunter': '#a330c9',
  Druid: '#ff7d0a',
  Evoker: '#33937f',
  Hunter: '#abd473',
  Mage: '#69ccff',
  Monk: '#00ff96',
  Paladin: '#f58cba',
  Priest: '#ffffff',
  Rogue: '#fff569',
  Shaman: '#0070de',
  Warlock: '#9482c9',
  Warrior: '#c79c6e',
}

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

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function GuildSummaryBar({ memberData }) {
  const values = Object.values(memberData)
  if (!values.length) return null

  const ilvls = values.map((value) => value.avgIlvl).filter(Boolean)
  const avgIlvl = ilvls.length ? Math.round((ilvls.reduce((sum, value) => sum + value, 0) / ilvls.length) * 10) / 10 : null
  const count4pc = values.filter((value) => (value.tierCount ?? 0) >= 4).length
  const count2pc = values.filter((value) => (value.tierCount ?? 0) >= 2 && (value.tierCount ?? 0) < 4).length
  const countCraft = values.filter((value) => value.hasCraftedWeapon).length

  return (
    <div className="guild-summary-bar">
      {avgIlvl && <span className="stat-pill stat-pill-ilvl">{avgIlvl} avg iLvl</span>}
      {count4pc > 0 && <span className="stat-pill stat-pill-4pc">{count4pc} x 4pc</span>}
      {count2pc > 0 && <span className="stat-pill stat-pill-2pc">{count2pc} x 2pc</span>}
      {countCraft > 0 && <span className="stat-pill stat-pill-weapon">{countCraft} crafted weapon</span>}
    </div>
  )
}

function GuildTrendChart({ points }) {
  if (points.length < 2) return null

  const width = 900
  const height = 250
  const left = 48
  const right = 18
  const top = 18
  const bottom = 38
  const values = points.map((point) => point.y)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const toX = (index) => left + (index / (points.length - 1)) * (width - left - right)
  const toY = (value) => height - bottom - ((value - min) / range) * (height - top - bottom)

  const line = points.map((point, index) => `${toX(index).toFixed(1)},${toY(point.y).toFixed(1)}`).join(' ')
  const area = `M ${toX(0).toFixed(1)} ${height - bottom} L ${line} L ${toX(points.length - 1).toFixed(1)} ${height - bottom} Z`
  const midIndex = Math.floor(points.length / 2)
  const xTicks = [0, midIndex, points.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="guild-trend-chart" aria-label="Guild item level trend">
      <defs>
        <linearGradient id="guildTrendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(105, 204, 255, 0.35)" />
          <stop offset="100%" stopColor="rgba(105, 204, 255, 0.02)" />
        </linearGradient>
      </defs>

      {[min, min + range / 2, max].map((tick, index) => {
        const y = toY(tick)
        return (
          <g key={index}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="rgba(122, 139, 160, 0.18)" strokeDasharray="4 6" />
            <text x={8} y={y + 4} fill="var(--text-muted)" fontSize="11">{tick.toFixed(1)}</text>
          </g>
        )
      })}

      <path d={area} fill="url(#guildTrendFill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--frost-blue)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((point, index) => (
        <circle key={point.label} cx={toX(index)} cy={toY(point.y)} r="4" fill="var(--frost-blue)">
          <title>{`${point.label}: ${point.y} avg iLvl across ${point.memberCount} mains`}</title>
        </circle>
      ))}

      {xTicks.map((index) => (
        <text
          key={index}
          x={toX(index)}
          y={height - 12}
          fill="var(--text-muted)"
          fontSize="11"
          textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
        >
          {points[index].label}
        </text>
      ))}
    </svg>
  )
}

function GuildIlvlTrend({ guild }) {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const mains = useMemo(
    () => (guild?.members ?? []).filter((member) => member.isMain !== false).map((member) => member.name.trim()).filter(Boolean),
    [guild],
  )

  useEffect(() => {
    if (!mains.length) {
      setPoints([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/snapshots?view=guild&members=${encodeURIComponent(mains.join(','))}`)
      .then((res) => (res.ok ? res.json() : { ilvl: [] }))
      .then((payload) => {
        if (cancelled) return
        const next = (payload.ilvl ?? []).map((row) => ({
          y: Math.round((row.avg_ilvl ?? 0) * 10) / 10,
          label: formatDate(row.snapped_at),
          memberCount: row.member_count ?? 0,
        }))
        setPoints(next)
      })
      .catch(() => {
        if (!cancelled) setPoints([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mains])

  return (
    <section className="guild-overview-panel guild-overview-panel--trend">
      <div className="guild-panel-heading">
        <div>
          <h2 className="guild-panel-title">Guild Item Level Trend</h2>
          <p className="guild-panel-subtitle">Daily average across mains only, built from recorded Blizzard snapshots.</p>
        </div>
        {!loading && points.length > 0 && (
          <span className="guild-trend-badge">
            {points[points.length - 1].y} avg
          </span>
        )}
      </div>

      {loading && <p className="guild-panel-empty">Loading guild progression…</p>}
      {!loading && points.length >= 2 && <GuildTrendChart points={points} />}
      {!loading && points.length === 1 && (
        <p className="guild-panel-empty">Need one more snapshot day before the guild trend can be drawn.</p>
      )}
      {!loading && points.length === 0 && (
        <p className="guild-panel-empty">No guild progression history yet. Front-page visits will start building this automatically.</p>
      )}
    </section>
  )
}

const MemberCard = memo(function MemberCard({
  member,
  region,
  realm,
  onSelectMember,
  onDataLoaded,
  onParseLoaded,
  onDpsLoaded,
}) {
  const effectiveRealm = member.realm?.trim() || realm
  const memberKey = `${region}:${effectiveRealm}:${member.name}`.toLowerCase()
  const { data, loading: gearLoading, error: gearError, refresh, fetchedAt } = useBlizzardAPI(member.name, effectiveRealm, region)
  const { avatarUrl } = useBlizzardMedia(member.name, effectiveRealm, region)
  const { data: wclData, loading: wclLoading, error: wclError, refresh: refreshWCL } = useCharacterParses(member.name, effectiveRealm, region)
  const reportUrl = member.reportUrl ?? member.report_url ?? getStoredReportUrl(memberKey)
  const { dps } = useRaidbotsReport(reportUrl)

  useEffect(() => {
    if (data && onDataLoaded) onDataLoaded(member.name, data)
  }, [data, member.name, onDataLoaded])

  const parse = useMemo(() => getAverageWclParse(wclData), [wclData])

  useEffect(() => {
    if (parse && onParseLoaded) onParseLoaded(member.name, parse.pct)
  }, [member.name, onParseLoaded, parse])

  useEffect(() => {
    if (dps > 0 && onDpsLoaded) onDpsLoaded(member.name, dps)
  }, [dps, member.name, onDpsLoaded])

  const classColor = CLASS_COLORS[data?.class ?? member.class] ?? '#d6deea'
  const ilvl = data?.avgIlvl ?? null
  const handleClick = useCallback(() => onSelectMember?.(member), [member, onSelectMember])
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelectMember?.(member)
    }
  }, [member, onSelectMember])
  const refreshAll = useCallback((event) => {
    event.stopPropagation()
    refresh()
    refreshWCL()
  }, [refresh, refreshWCL])

  return (
    <div
      role="button"
      tabIndex={0}
      className="guild-member-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ '--member-accent': classColor }}
    >
      <div className="guild-member-card__top">
        <div className="guild-member-card__avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt={member.name} className="guild-member-card__avatar-image" />
          ) : (
            <span className="guild-member-card__avatar-fallback">{initials(member.name)}</span>
          )}
        </div>

        <div className="guild-member-card__identity">
          <div className="guild-member-card__name-row">
            <span className="guild-member-card__name">{member.name}</span>
            {!member.isMain && <span className="guild-member-card__alt">alt</span>}
          </div>
          <div className="guild-member-card__meta">
            {[data?.spec ?? member.spec, data?.class ?? member.class].filter(Boolean).join(' ') || 'Unknown class'}
          </div>
          <div className="guild-member-card__meta guild-member-card__meta--secondary">
            {member.role} · {effectiveRealm || realm}
          </div>
        </div>

        <div className="guild-member-card__ilvl">
          {ilvl !== null ? (
            <>
              <span className="guild-member-card__ilvl-value" style={{ color: ilvlColor(ilvl) }}>{ilvl}</span>
              <span className="guild-member-card__ilvl-label">avg iLvl</span>
            </>
          ) : (
            <span className="guild-member-card__loading">{gearLoading ? 'Loading…' : 'No gear yet'}</span>
          )}
        </div>
      </div>

      <div className="guild-member-card__body">
        <div className="guild-member-card__badges">
          {parse && (
            <span className="guild-member-card__parse" style={{ color: parseBadgeColor(parse.pct), borderColor: parseBadgeColor(parse.pct) }}>
              {parse.pct}% {parse.diff}
            </span>
          )}
          {dps > 0 && <span className="badge badge-crafted">{(dps / 1000).toFixed(1)}k DPS</span>}
          {(data?.tierCount ?? 0) >= 4 && <span className="badge badge-4pc">4pc</span>}
          {(data?.tierCount ?? 0) >= 2 && (data?.tierCount ?? 0) < 4 && <span className="badge badge-2pc">2pc</span>}
          {data?.hasCraftedWeapon && <span className="badge badge-crafted">{data.craftedWeaponIlvl} crafted</span>}
        </div>

        <div className="guild-member-card__footer">
          <div className="guild-member-card__status">
            {gearError && gearError !== 'API not available' && <span className="guild-member-card__error">{gearError}</span>}
            {gearError === 'API not available' && <span className="guild-member-card__muted">API offline</span>}
            {!gearError && wclError && <span className="guild-member-card__error">{wclError}</span>}
            {!gearError && !wclError && fetchedAt && <span className="guild-member-card__muted">Updated {timeAgo(fetchedAt)}</span>}
            {!gearError && !wclError && !fetchedAt && !gearLoading && <span className="guild-member-card__muted">Ready to inspect</span>}
          </div>

          <button
            type="button"
            className="guild-member-card__refresh"
            onClick={refreshAll}
            disabled={gearLoading || wclLoading}
          >
            {gearLoading || wclLoading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  )
})

export default function GuildOverview({ guild, onSelectMember }) {
  const [showAlts, setShowAlts] = useState(false)
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState('ilvl')
  const [memberData, setMemberData] = useState({})
  const [parseCache, setParseCache] = useState({})
  const [dpsCache, setDpsCache] = useState({})

  const onDataLoaded = useCallback((name, data) => {
    setMemberData((prev) => (prev[name] === data ? prev : { ...prev, [name]: data }))
  }, [])
  const onParseLoaded = useCallback((name, pct) => {
    setParseCache((prev) => (prev[name] === pct ? prev : { ...prev, [name]: pct }))
  }, [])
  const onDpsLoaded = useCallback((name, dps) => {
    setDpsCache((prev) => (prev[name] === dps ? prev : { ...prev, [name]: dps }))
  }, [])

  const displayed = useMemo(() => {
    if (!guild?.members?.length) return []

    return [...guild.members]
      .filter((member) => showAlts || member.isMain !== false)
      .filter((member) => roleFilter === 'all' || member.role === roleFilter)
      .sort((a, b) => {
        if (sortBy === 'ilvl') return (memberData[b.name]?.avgIlvl ?? 0) - (memberData[a.name]?.avgIlvl ?? 0)
        if (sortBy === 'parse') return (parseCache[b.name] ?? 0) - (parseCache[a.name] ?? 0)
        if (sortBy === 'dps') return (dpsCache[b.name] ?? 0) - (dpsCache[a.name] ?? 0)
        return a.name.localeCompare(b.name)
      })
  }, [dpsCache, guild?.members, memberData, parseCache, roleFilter, showAlts, sortBy])

  if (!guild?.members?.length) {
    return (
      <section className="guild-overview-panel">
        <h2 className="guild-panel-title">Guild Overview</h2>
        <p className="guild-panel-empty">No members configured. Open Settings to add guild members.</p>
      </section>
    )
  }

  return (
    <div className="guild-overview-layout">
      <GuildIlvlTrend guild={guild} />

      <section className="guild-overview-panel">
        <div className="guild-panel-heading">
          <div>
            <h2 className="guild-panel-title">Roster Overview</h2>
            <p className="guild-panel-subtitle">A sharper front page for quick roster checks before diving into a character.</p>
          </div>
        </div>

        <GuildSummaryBar memberData={memberData} />

        <div className="filter-bar guild-filter-bar">
          <div className="filter-group">
            {[
              ['all', 'All'],
              ['tank', 'Tank'],
              ['healer', 'Healer'],
              ['dps', 'DPS'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`btn-pill${roleFilter === key ? ' active' : ''}`}
                onClick={() => setRoleFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <span className="guild-filter-label">Sort</span>
            <select
              className="filter-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="ilvl">iLvl</option>
              <option value="parse">Parse %</option>
              <option value="dps">Sim DPS</option>
              <option value="name">Name</option>
            </select>
          </div>

          <button
            className={`btn-pill${showAlts ? ' active' : ''}`}
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowAlts((value) => !value)}
          >
            {showAlts ? 'Hide alts' : 'Show alts'}
          </button>
        </div>

        <div className="guild-member-grid">
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
        </div>

        {displayed.length === 0 && <p className="guild-panel-empty">No members match this filter.</p>}
      </section>
    </div>
  )
}
