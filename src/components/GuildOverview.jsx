import { useEffect, useMemo, useState } from 'react'
import { timeAgo } from '../utils/timeAgo.js'

const EMPTY_DASHBOARD = {
  guild: { name: '', realm: '', region: '' },
  charts: { parseTrend: [], ilvlTrend: [] },
  progress: { zoneName: '', progressedBossCount: 0, bossCount: 0, deltaThisWeek: 0, bosses: [] },
  leaderboard: [],
  attendance: [],
  loot: [],
  roster: [],
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatRealmLabel(realm) {
  if (!realm) return ''
  return String(realm)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatRaidDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatNumber(value, digits = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return parsed.toFixed(digits)
}

function formatPercent(value) {
  const parsed = numberOrNull(value)
  if (parsed === null) return '—'
  return `${Math.round(parsed)}%`
}

function getMemberTrend(member) {
  const trend = member?.parseTrend ?? member?.history ?? member?.sparkline ?? []
  return Array.isArray(trend) ? trend.map((entry) => numberOrNull(entry?.value ?? entry?.pct ?? entry)).filter((entry) => entry !== null) : []
}

function buildFallbackRoster(guild) {
  return (guild?.members ?? []).map((member) => ({
    name: member?.name ?? 'Unknown',
    className: member?.class ?? '',
    specName: member?.spec ?? '',
    role: member?.role ?? 'dps',
    isMain: member?.isMain !== false,
    avgIlvl: numberOrNull(member?.avgIlvl ?? member?.ilvl),
    lastRaidParsePct: numberOrNull(member?.lastRaidParsePct ?? member?.parsePct ?? member?.parse),
    parseTrend: getMemberTrend(member),
  }))
}

function buildFallbackDashboard(guild) {
  return {
    ...EMPTY_DASHBOARD,
    guild: {
      name: guild?.name ?? '',
      realm: guild?.realm ?? '',
      region: guild?.region ?? '',
    },
    roster: buildFallbackRoster(guild),
  }
}

function normalizeRosterRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    name: row.name ?? row.actor_name ?? 'Unknown',
    className: row.className ?? row.class_name ?? row.class ?? '',
    specName: row.specName ?? row.spec_name ?? row.spec ?? '',
    role: row.role ?? 'dps',
    isMain: row.isMain ?? row.is_main ?? true,
    avgIlvl: numberOrNull(row.avgIlvl ?? row.average_item_level ?? row.item_level),
    lastRaidParsePct: numberOrNull(row.lastRaidParsePct ?? row.last_raid_parse_pct ?? row.parse_percent ?? row.parsePct),
    parseTrend: Array.isArray(row.parseTrend)
      ? row.parseTrend.map((entry) => numberOrNull(entry?.value ?? entry?.pct ?? entry?.parse_pct ?? entry)).filter((entry) => entry !== null)
      : Array.isArray(row.parse_trend)
        ? row.parse_trend.map((entry) => numberOrNull(entry?.value ?? entry?.pct ?? entry?.parse_pct ?? entry)).filter((entry) => entry !== null)
        : [],
  }
}

function normalizeDashboard(payload, guild) {
  const parsed = payload && typeof payload === 'object' ? payload : {}
  const roster = Array.isArray(parsed.roster) ? parsed.roster.map(normalizeRosterRow).filter(Boolean) : []
  const parseTrend = Array.isArray(parsed.charts?.parseTrend)
    ? parsed.charts.parseTrend.map((entry) => ({
      raidDate: entry?.raidDate ?? entry?.raid_night_date ?? null,
      avgParsePct: numberOrNull(entry?.avgParsePct ?? entry?.avg_parse_pct),
    }))
    : []
  const ilvlTrend = Array.isArray(parsed.charts?.ilvlTrend)
    ? parsed.charts.ilvlTrend.map((entry) => ({
      snapped_at: entry?.snapped_at ?? entry?.snappedAt ?? null,
      avg_ilvl: numberOrNull(entry?.avg_ilvl ?? entry?.avgIlvl),
      member_count: numberOrNull(entry?.member_count ?? entry?.memberCount) ?? 0,
    }))
    : []

  return {
    guild: {
      name: parsed.guild?.name ?? guild?.name ?? '',
      realm: parsed.guild?.realm ?? guild?.realm ?? '',
      region: parsed.guild?.region ?? guild?.region ?? '',
    },
    charts: {
      parseTrend,
      ilvlTrend,
    },
    progress: {
      zoneName: parsed.progress?.zoneName ?? parsed.progress?.zone_name ?? '',
      progressedBossCount: numberOrNull(parsed.progress?.progressedBossCount ?? parsed.progress?.progressed_boss_count) ?? 0,
      bossCount: numberOrNull(parsed.progress?.bossCount ?? parsed.progress?.boss_count) ?? 0,
      deltaThisWeek: numberOrNull(parsed.progress?.deltaThisWeek ?? parsed.progress?.delta_this_week) ?? 0,
      bosses: Array.isArray(parsed.progress?.bosses)
        ? parsed.progress.bosses.map((entry) => ({
          ...entry,
          bestPercent: numberOrNull(entry?.bestPercent ?? entry?.best_percent),
        }))
        : [],
    },
    leaderboard: Array.isArray(parsed.leaderboard)
      ? parsed.leaderboard.map((entry) => ({
        ...entry,
        encounterName: entry?.encounterName ?? entry?.encounter_name ?? null,
        parsePct: numberOrNull(entry?.parsePct ?? entry?.parse_pct),
        wclUrl: entry?.wclUrl ?? entry?.wcl_url ?? null,
      }))
      : [],
    attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
    loot: Array.isArray(parsed.loot)
      ? parsed.loot.map((entry) => ({
        ...entry,
        playerName: entry?.playerName ?? entry?.actor_name ?? null,
        itemName: entry?.itemName ?? entry?.item_name ?? null,
        sourceName: entry?.sourceName ?? entry?.encounter_name ?? null,
        occurredAt: entry?.occurredAt ?? entry?.occurred_at ?? null,
        isTier: entry?.isTier ?? entry?.is_tier ?? false,
      }))
      : [],
    roster: roster.length ? roster : buildFallbackRoster(guild),
  }
}

function TrendSparkline({ values, color = 'var(--wax-strong)', label }) {
  const safeValues = Array.isArray(values) ? values.map(numberOrNull).filter((value) => value !== null) : []

  if (!safeValues.length) {
    return <span className="guild-trend-empty">{label ?? 'No trend yet'}</span>
  }

  const width = 120
  const height = 34
  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)
  const range = max - min || 1
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? width / 2 : (index / (safeValues.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg className="guild-trend-sparkline" viewBox={`0 0 ${width} ${height}`} aria-label={label ?? 'Trend sparkline'} role="img">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DashboardStat({ label, value, meta }) {
  return (
    <article className="guild-stat-card">
      <span className="guild-stat-card__label">{label}</span>
      <strong className="guild-stat-card__value">{value}</strong>
      {meta && <span className="guild-stat-card__meta">{meta}</span>}
    </article>
  )
}

function SectionHeader({ kicker, title, subtitle, action }) {
  return (
    <div className="guild-section__header">
      <div>
        {kicker && <p className="guild-section__kicker">{kicker}</p>}
        <h3 className="guild-section__title">{title}</h3>
        {subtitle && <p className="guild-section__subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function TrendPanel({ title, subtitle, points, valueKey, labelKey, accent }) {
  const normalized = Array.isArray(points) ? points : []
  const values = normalized.map((point) => numberOrNull(point?.[valueKey])).filter((value) => value !== null)

  return (
    <article className="guild-panel guild-panel--trend">
      <SectionHeader kicker="Raid history" title={title} subtitle={subtitle} />
      <div className="guild-trend-panel">
        <TrendSparkline values={values} color={accent} label={title} />
        <div className="guild-trend-panel__axis">
          {normalized.length > 0 ? normalized.slice(-4).map((point) => (
            <span key={`${point?.[labelKey] ?? 'point'}-${point?.[valueKey] ?? ''}`}>
              {labelKey === 'snapped_at' ? formatRaidDate(point?.[labelKey]) : String(point?.[labelKey] ?? '—')}
            </span>
          )) : <span>No history yet</span>}
        </div>
      </div>
    </article>
  )
}

export default function GuildOverview({ guild }) {
  const [dashboard, setDashboard] = useState(() => buildFallbackDashboard(guild))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rosterOpen, setRosterOpen] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/guild-dashboard', { signal: controller.signal })
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'Dashboard API not deployed yet.' : `HTTP ${response.status}`)
        }

        const payload = await response.json().catch(() => ({}))
        if (!active) return
        setDashboard(normalizeDashboard(payload, guild))
      } catch (err) {
        if (!active) return
        setDashboard(buildFallbackDashboard(guild))
        setError(err?.message ?? 'Unable to load guild dashboard.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      active = false
      controller.abort()
    }
  }, [guild?.name, guild?.realm, guild?.region, refreshTick])

  const normalized = useMemo(() => normalizeDashboard(dashboard, guild), [dashboard, guild])
  const parseTrend = normalized.charts.parseTrend
  const ilvlTrend = normalized.charts.ilvlTrend
  const progressBosses = normalized.progress.bosses
  const roster = normalized.roster
  const mains = roster.filter((member) => member.isMain !== false).length
  const alts = roster.length - mains
  const openLabel = rosterOpen ? 'Collapse roster' : 'Expand roster'

  if (!roster.length && loading) {
    return (
      <section className="guild-dashboard">
        <div className="guild-panel guild-panel--empty">Loading guild dashboard...</div>
      </section>
    )
  }

  return (
    <section className="guild-dashboard">
      <section className="guild-hero-card">
        <div className="guild-hero-card__copy">
          <p className="guild-hero-card__kicker">Parchment briefing</p>
          <h2 className="guild-hero-card__title">
            {normalized.guild.name || guild?.name || 'Guild Dashboard'}
          </h2>
          <p className="guild-hero-card__subtitle">
            {[
              formatRealmLabel(normalized.guild.realm || guild?.realm),
              (normalized.guild.region || guild?.region)?.toUpperCase(),
            ].filter(Boolean).join(' · ') || 'Waiting for guild metadata'}
          </p>
          <p className="guild-hero-card__body">
            Live summary panel for raid parses, progression, attendance, loot, and roster trends.
          </p>
        </div>

        <div className="guild-hero-card__actions">
          <button type="button" className="guild-button guild-button--primary" onClick={() => setRefreshTick((value) => value + 1)}>
            Refresh dashboard
          </button>
          <p className="guild-hero-card__status">
            {loading ? 'Syncing dashboard data...' : error ? error : 'Dashboard ready'}
          </p>
        </div>
      </section>

      <section className="guild-stat-grid">
        <DashboardStat
          label="Raid nights"
          value={formatNumber(parseTrend.length, 0)}
          meta={parseTrend.length ? `Latest ${formatRaidDate(parseTrend.at(-1)?.raidDate)}` : 'No imported raids yet'}
        />
        <DashboardStat
          label="Progress"
          value={`${normalized.progress.progressedBossCount}/${normalized.progress.bossCount || 0}`}
          meta={normalized.progress.zoneName || 'Progress rail pending'}
        />
        <DashboardStat
          label="Roster"
          value={`${mains} mains`}
          meta={`${alts} alts in the collapse panel`}
        />
        <DashboardStat
          label="Attendance"
          value={formatNumber(normalized.attendance.length, 0)}
          meta="Last six raid nights"
        />
      </section>

      <div className="guild-dashboard__trends">
        <TrendPanel
          title="Parse trend"
          subtitle="Average kill parses by raid night"
          points={parseTrend}
          valueKey="avgParsePct"
          labelKey="raidDate"
          accent="var(--wax-strong)"
        />
        <TrendPanel
          title="iLvl trend"
          subtitle="Average guild item level over time"
          points={ilvlTrend}
          valueKey="avg_ilvl"
          labelKey="snapped_at"
          accent="var(--amber)"
        />
      </div>

      <div className="guild-dashboard__grid">
        <article className="guild-panel">
          <SectionHeader
            kicker="Progress rail"
            title="Raid progression"
            subtitle="Pulls, kills, and best wipe percentage from imported reports."
          />
          {progressBosses.length > 0 ? (
            <div className="guild-progress-list">
              {progressBosses.map((boss) => {
                const pulls = numberOrNull(boss.pulls) ?? 0
                const kills = numberOrNull(boss.kills) ?? 0
                const bestPercent = numberOrNull(boss.bestPercent)
                const fill = pulls > 0 ? Math.min(100, (kills / pulls) * 100) : 0

                return (
                  <div key={boss.name} className="guild-progress-row">
                    <div className="guild-progress-row__title">
                      <strong>{boss.name}</strong>
                      <span>{kills}/{pulls} kills</span>
                    </div>
                    <div className="guild-progress-row__bar">
                      <span className="guild-progress-row__fill" style={{ width: `${fill}%` }} />
                    </div>
                    <div className="guild-progress-row__meta">
                      <span>{formatPercent(bestPercent)} best wipe</span>
                      <span>{boss.encounterName ?? boss.note ?? ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="guild-panel__empty">No progression data has been imported yet.</p>
          )}
        </article>

        <article className="guild-panel">
          <SectionHeader
            kicker="Most recent raid"
            title="Leaderboard"
            subtitle="Best kill parse per member from the latest imported night."
          />
          {normalized.leaderboard.length > 0 ? (
            <div className="guild-leaderboard">
              {normalized.leaderboard.map((entry) => (
                <a
                  key={`${entry.name}-${entry.encounterName ?? ''}`}
                  href={entry.wclUrl || undefined}
                  target={entry.wclUrl ? '_blank' : undefined}
                  rel={entry.wclUrl ? 'noreferrer' : undefined}
                  className="guild-leaderboard__row"
                >
                  <div>
                    <strong>{entry.name}</strong>
                    <span>{entry.role || 'dps'} · {entry.encounterName || 'Unknown encounter'}</span>
                  </div>
                  <span className="guild-leaderboard__score">{formatPercent(entry.parsePct)}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="guild-panel__empty">No leaderboard entries yet.</p>
          )}
        </article>

        <article className="guild-panel">
          <SectionHeader
            kicker="Attendance"
            title="Last six raid nights"
            subtitle="Mains only attendance snapshot."
          />
          {normalized.attendance.length > 0 ? (
            <div className="guild-attendance-list">
              {normalized.attendance.map((entry) => (
                <div key={entry.name} className="guild-attendance-row">
                  <div>
                    <strong>{entry.name}</strong>
                    <span>{entry.role || 'role unknown'}</span>
                  </div>
                  <div className="guild-attendance-row__nights">
                    {(entry.nights ?? []).map((night, index) => (
                      <span key={`${entry.name}-${index}`} className={`guild-night-pill${night ? ' is-present' : ''}`} title={night ? 'Present' : 'Absent'} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="guild-panel__empty">No attendance data yet.</p>
          )}
        </article>

        <article className="guild-panel">
          <SectionHeader
            kicker="Recent loot"
            title="Loot tracker"
            subtitle="Last 14 days of imported loot, if available."
          />
          {normalized.loot.length > 0 ? (
            <div className="guild-loot-list">
              {normalized.loot.map((entry) => (
                <div key={`${entry.playerName}-${entry.itemName}-${entry.occurredAt}`} className="guild-loot-row">
                  <div>
                    <strong>{entry.itemName}</strong>
                    <span>{entry.playerName} · {entry.sourceName || 'Unknown source'}</span>
                  </div>
                  <div className="guild-loot-row__meta">
                    <span>{formatRaidDate(entry.occurredAt)}</span>
                    {entry.isTier && <span className="guild-loot-row__tag">Tier</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="guild-panel__empty">No loot events imported yet.</p>
          )}
        </article>
      </div>

      <article className="guild-panel guild-panel--roster">
        <div className="guild-section__header">
          <div>
            <p className="guild-section__kicker">Roster</p>
            <h3 className="guild-section__title">Collapsible roster</h3>
            <p className="guild-section__subtitle">Dense rows with current iLvl and parse-trend sparklines.</p>
          </div>
          <button type="button" className="guild-button" aria-expanded={rosterOpen} onClick={() => setRosterOpen((value) => !value)}>
            {openLabel}
          </button>
        </div>

        {rosterOpen ? (
          <div className="guild-roster-list">
            {roster.map((member) => (
              <div key={member.name} className="guild-roster-row">
                <div className="guild-roster-row__identity">
                  <strong>{member.name}</strong>
                  <span>{[member.className, member.specName].filter(Boolean).join(' ') || 'Unspecified'} · {member.role || 'dps'}</span>
                </div>
                <div className="guild-roster-row__stats">
                  <div>
                    <span className="guild-roster-row__label">iLvl</span>
                    <strong>{member.avgIlvl !== null ? formatNumber(member.avgIlvl, 1) : '—'}</strong>
                  </div>
                  <div>
                    <span className="guild-roster-row__label">Last parse</span>
                    <strong>{member.lastRaidParsePct !== null ? formatPercent(member.lastRaidParsePct) : '—'}</strong>
                  </div>
                  <TrendSparkline values={member.parseTrend} color="var(--wax-strong)" label={`${member.name} parse trend`} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="guild-panel__empty">Roster collapsed.</p>
        )}
      </article>
    </section>
  )
}
