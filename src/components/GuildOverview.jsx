import { useEffect, useId, useMemo, useState } from 'react'

const DASHBOARD_TWEAKS_KEY = 'wow-gear-diary:dashboard-tweaks'
const DEFAULT_TWEAKS = {
  rolecolors: 'on',
  density: 'balanced',
  intensity: 'inked',
}

const MIDNIGHT_BOSS_ORDER = [
  'Imperator Averzian',
  "Belo'ren, Child of Al'ar",
  'Fallen-King Salhadaar',
  'Crown of the Cosmos',
  'Vorasius',
  'Vaelgor & Ezzorak',
  'Midnight Falls',
  'Chimaerus the Undreamt God',
]

const EMPTY_DASHBOARD = {
  guild: { name: '', realm: '', region: '' },
  charts: { parseTrend: [], ilvlTrend: [] },
  progress: {
    zoneName: 'Heroic Midnight',
    progressedBossCount: 0,
    bossCount: MIDNIGHT_BOSS_ORDER.length,
    deltaThisWeek: 0,
    bosses: MIDNIGHT_BOSS_ORDER.map((name) => ({
      name,
      pulls: 0,
      kills: 0,
      bestPercent: 100,
    })),
  },
  leaderboard: [],
  attendance: [],
  summary: {
    raid_night_count: 0,
    latest_raid_night_date: null,
  },
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRoleTone(role) {
  const normalized = String(role ?? 'dps').trim().toLowerCase()
  if (normalized.startsWith('tank')) return 'tank'
  if (normalized.startsWith('heal')) return 'heal'
  return 'dps'
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

function formatPercent(value) {
  const parsed = numberOrNull(value)
  if (parsed == null) return '--'
  return `${Math.round(parsed)}`
}

function formatChange(current, previous, suffix = '') {
  const currentValue = numberOrNull(current)
  const previousValue = numberOrNull(previous)
  if (currentValue == null || previousValue == null) return null
  const delta = currentValue - previousValue
  const prefix = delta >= 0 ? '+' : ''
  return `${prefix}${Math.round(delta)}${suffix}`
}

function formatIlvlMeta(points = []) {
  if (!points.length) return 'No item level snapshots yet'
  const first = numberOrNull(points[0]?.avgIlvl)
  const last = numberOrNull(points.at(-1)?.avgIlvl)
  if (first == null || last == null) return 'No item level snapshots yet'
  const delta = formatChange(last, first)
  return `${Math.round(first)} -> ${Math.round(last)}${delta ? ` · ${delta}` : ''}`
}

function formatParseMeta(points = []) {
  if (!points.length) return 'last 12 raids'
  const first = numberOrNull(points[0]?.avgParsePct)
  const last = numberOrNull(points.at(-1)?.avgParsePct)
  const delta = formatChange(last, first, ' pts')
  return `last ${points.length} raids${delta ? ` · ${delta}` : ''}`
}

function parseColor(value) {
  const parsed = numberOrNull(value)
  if (parsed == null) return 'var(--ink-3)'
  if (parsed >= 95) return '#e268a8'
  if (parsed >= 90) return '#a35bc7'
  if (parsed >= 75) return '#ff8000'
  if (parsed >= 50) return '#1eff00'
  return 'var(--ink-3)'
}

function getBossFill(boss) {
  const pulls = numberOrNull(boss?.pulls) ?? 0
  const kills = numberOrNull(boss?.kills) ?? 0
  const bestPercent = numberOrNull(boss?.bestPercent)

  if (kills > 0) return 100
  if (pulls <= 0 || bestPercent == null) return 0
  return Math.max(0, Math.min(100, 100 - bestPercent))
}

function getBossTone(boss) {
  if ((numberOrNull(boss?.kills) ?? 0) > 0) return 'is-good'
  if ((numberOrNull(boss?.pulls) ?? 0) > 0 && (numberOrNull(boss?.bestPercent) ?? 100) <= 25) return 'is-warn'
  return 'is-muted'
}

function applyBodyTweaks(tweaks) {
  if (typeof document === 'undefined') return
  document.body.dataset.rolecolors = tweaks.rolecolors
  document.body.dataset.density = tweaks.density
  document.body.dataset.intensity = tweaks.intensity
}

function loadTweaks() {
  if (typeof window === 'undefined') return DEFAULT_TWEAKS

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_TWEAKS_KEY) || '{}')
    return {
      rolecolors: parsed.rolecolors === 'off' ? 'off' : 'on',
      density: ['compact', 'balanced', 'spacious'].includes(parsed.density) ? parsed.density : 'balanced',
      intensity: parsed.intensity === 'plain' ? 'plain' : 'inked',
    }
  } catch {
    return DEFAULT_TWEAKS
  }
}

function buildFallbackDashboard(guild) {
  return {
    ...EMPTY_DASHBOARD,
    guild: {
      name: guild?.name ?? '',
      realm: guild?.realm ?? '',
      region: guild?.region ?? '',
    },
  }
}

function normalizeBossRows(progress = {}) {
  const incoming = Array.isArray(progress.bosses) ? progress.bosses : []
  const byName = new Map(
    incoming
      .map((entry) => ({
        name: entry?.name ?? entry?.encounter_name ?? null,
        pulls: numberOrNull(entry?.pulls) ?? 0,
        kills: numberOrNull(entry?.kills) ?? 0,
        bestPercent: numberOrNull(entry?.bestPercent ?? entry?.best_percent) ?? 100,
      }))
      .filter((entry) => entry.name)
      .map((entry) => [entry.name, entry]),
  )

  return MIDNIGHT_BOSS_ORDER.map((name) => byName.get(name) ?? {
    name,
    pulls: 0,
    kills: 0,
    bestPercent: 100,
  })
}

function normalizeDashboard(payload, guild) {
  const parsed = payload && typeof payload === 'object' ? payload : {}
  const parseTrend = Array.isArray(parsed.charts?.parseTrend)
    ? parsed.charts.parseTrend.map((entry) => ({
      raidDate: entry?.raidDate ?? entry?.raid_night_date ?? null,
      avgParsePct: numberOrNull(entry?.avgParsePct ?? entry?.avg_parse_pct),
    })).filter((entry) => entry.raidDate)
    : []

  const ilvlTrend = Array.isArray(parsed.charts?.ilvlTrend)
    ? parsed.charts.ilvlTrend.map((entry) => ({
      snappedAt: entry?.snapped_at ?? entry?.snappedAt ?? null,
      avgIlvl: numberOrNull(entry?.avg_ilvl ?? entry?.avgIlvl),
      memberCount: numberOrNull(entry?.member_count ?? entry?.memberCount) ?? 0,
    })).filter((entry) => entry.snappedAt)
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
      zoneName: parsed.progress?.zoneName ?? parsed.progress?.zone_name ?? 'Heroic Midnight',
      progressedBossCount: numberOrNull(parsed.progress?.progressedBossCount ?? parsed.progress?.progressed_boss_count) ?? 0,
      bossCount: numberOrNull(parsed.progress?.bossCount ?? parsed.progress?.boss_count) ?? MIDNIGHT_BOSS_ORDER.length,
      deltaThisWeek: numberOrNull(parsed.progress?.deltaThisWeek ?? parsed.progress?.delta_this_week) ?? 0,
      bosses: normalizeBossRows(parsed.progress),
    },
    leaderboard: Array.isArray(parsed.leaderboard)
      ? parsed.leaderboard.map((entry, index) => ({
        rank: index + 1,
        name: entry?.name ?? 'Unknown',
        role: normalizeRoleTone(entry?.role),
        encounterName: entry?.encounterName ?? entry?.encounter_name ?? 'Unknown boss',
        parsePct: numberOrNull(entry?.parsePct ?? entry?.parse_pct),
        wclUrl: entry?.wclUrl ?? entry?.wcl_url ?? null,
      }))
      : [],
    attendance: Array.isArray(parsed.attendance)
      ? parsed.attendance.map((entry) => ({
        name: entry?.name ?? 'Unknown',
        role: normalizeRoleTone(entry?.role),
        nights: Array.isArray(entry?.nights) ? entry.nights.slice(-6) : [],
        attendancePct: numberOrNull(entry?.attendancePct ?? entry?.attendance_pct) ?? 0,
      }))
      : [],
    summary: parsed.summary ?? EMPTY_DASHBOARD.summary,
  }
}

function SketchLineChart({ values, color, label, filled = false }) {
  const chartId = useId().replace(/:/g, '')
  const points = Array.isArray(values) ? values.map(numberOrNull).filter((value) => value != null) : []

  if (!points.length) {
    return <div className="dashboard-chart__empty">No heroic history yet</div>
  }

  const width = 420
  const height = 140
  const pad = 20
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, index) => (
    points.length === 1
      ? width / 2
      : pad + (index * (width - pad * 2) / (points.length - 1))
  ))
  const ys = points.map((point) => pad + ((height - pad * 2) * (1 - ((point - min) / range))))
  const path = xs.map((x, index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${ys[index].toFixed(1)}`).join(' ')
  const fillPath = `${path} L${xs.at(-1).toFixed(1)},${(height - pad).toFixed(1)} L${xs[0].toFixed(1)},${(height - pad).toFixed(1)} Z`

  return (
    <svg className="dashboard-chart" viewBox={`0 0 ${width} ${height}`} aria-label={label} role="img">
      <defs>
        <pattern id={`grid-${chartId}`} width="40" height="28" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 28" fill="none" stroke="var(--ink-faint)" strokeWidth="0.5" strokeDasharray="2 3" />
        </pattern>
      </defs>
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill={`url(#grid-${chartId})`} />
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--ink)" strokeWidth="1.5" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="var(--ink)" strokeWidth="1.5" />
      {filled ? <path d={fillPath} fill={color} opacity="0.1" /> : null}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, index) => (
        <circle
          key={`${x}-${ys[index]}`}
          cx={x}
          cy={ys[index]}
          r="2.5"
          fill="var(--paper)"
          stroke={color}
          strokeWidth="1.5"
        />
      ))}
      <text x={width - pad} y={pad - 4} textAnchor="end" className="dashboard-chart__label">{label}</text>
    </svg>
  )
}

function HeroChartCard({ title, meta, values, label, color }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card__header">
        <h3 className="dashboard-card__title">{title}</h3>
        <span className="dashboard-card__meta">{meta}</span>
      </div>
      <SketchLineChart values={values} color={color} label={label} filled />
    </section>
  )
}

function ProgressRail({ progress }) {
  return (
    <section className="dashboard-card dashboard-card--progress">
      <div className="dashboard-card__header">
        <h3 className="dashboard-card__title">Heroic Midnight · boss-by-boss</h3>
        <span className="dashboard-card__meta">
          {progress.progressedBossCount} / {progress.bossCount} · +{progress.deltaThisWeek} kills this week
        </span>
      </div>
      <div className="dashboard-progress-list">
        {progress.bosses.map((boss) => (
          <div key={boss.name} className="dashboard-progress-row">
            <div className="dashboard-progress-row__name">{boss.name}</div>
            <div className="dashboard-bar-track">
              <div
                className={`dashboard-bar-fill ${getBossTone(boss)}`}
                style={{ width: `${getBossFill(boss)}%` }}
              />
            </div>
            <div className="dashboard-progress-row__pulls">{boss.pulls} pulls</div>
            <div className={`dashboard-progress-row__result ${getBossTone(boss)}`}>
              {boss.kills > 0 ? `${boss.kills} kill${boss.kills > 1 ? 's' : ''}` : `best ${formatPercent(boss.bestPercent)}%`}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function LeaderboardCard({ entries }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card__header">
        <div>
          <h3 className="dashboard-card__title">Log leaderboard</h3>
          <p className="dashboard-card__subtitle">best parse per member · last heroic raid</p>
        </div>
        <span className="dashboard-card__meta">last raid</span>
      </div>
      <div className="dashboard-log-list">
        {entries.length ? entries.slice(0, 8).map((entry) => {
          const content = (
            <div className="dashboard-log-row">
              <div className="dashboard-log-row__rank">{String(entry.rank).padStart(2, '0')}</div>
              <div className="dashboard-log-row__name">{entry.name}</div>
              <span className={`sk-pill ${entry.role}`}>{entry.role}</span>
              <div className="dashboard-log-row__boss">{entry.encounterName}</div>
              <div className="dashboard-log-row__score" style={{ color: parseColor(entry.parsePct) }}>
                {formatPercent(entry.parsePct)}
              </div>
            </div>
          )

          return entry.wclUrl ? (
            <a
              key={`${entry.name}-${entry.encounterName}`}
              href={entry.wclUrl}
              className="dashboard-log-link"
              target="_blank"
              rel="noreferrer"
            >
              {content}
            </a>
          ) : (
            <div key={`${entry.name}-${entry.encounterName}`} className="dashboard-log-link">
              {content}
            </div>
          )
        }) : <div className="dashboard-card__empty">No heroic leaderboard entries yet.</div>}
      </div>
    </section>
  )
}

function AttendanceCard({ entries }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card__header">
        <div>
          <h3 className="dashboard-card__title">Attendance · last 6 nights</h3>
          <p className="dashboard-card__subtitle">filled = attended · hollow = missed</p>
        </div>
      </div>
      <div className="dashboard-attendance-list">
        {entries.length ? entries.slice(0, 8).map((entry) => (
          <div key={entry.name} className="dashboard-attendance-row">
            <div className="dashboard-attendance-row__name">{entry.name}</div>
            <div className="dashboard-attendance-row__dots" aria-label={`${entry.name} attendance`}>
              {entry.nights.map((night, index) => (
                <span
                  key={`${entry.name}-${index}`}
                  className={`dashboard-attendance-dot ${entry.role}${night ? ' is-present' : ''}`}
                />
              ))}
            </div>
          </div>
        )) : <div className="dashboard-card__empty">No heroic attendance data yet.</div>}
      </div>
    </section>
  )
}

function TweaksRail({ tweaks, onToggleRoleColors, onDensityChange, onIntensityChange }) {
  return (
    <aside className="tweaks-panel on">
      <h3>Tweaks</h3>
      <label htmlFor="dashboard-rolecolors">
        <span>Role colors</span>
        <button
          id="dashboard-rolecolors"
          type="button"
          className={`tog${tweaks.rolecolors === 'on' ? ' on' : ''}`}
          data-tog="rolecolors"
          onClick={onToggleRoleColors}
          aria-pressed={tweaks.rolecolors === 'on'}
        />
      </label>
      <label htmlFor="dashboard-density">
        <span>Density</span>
        <select
          id="dashboard-density"
          data-set="density"
          value={tweaks.density}
          onChange={(event) => onDensityChange(event.target.value)}
        >
          <option value="compact">compact</option>
          <option value="balanced">balanced</option>
          <option value="spacious">spacious</option>
        </select>
      </label>
      <label htmlFor="dashboard-intensity">
        <span>Aesthetic</span>
        <select
          id="dashboard-intensity"
          data-set="intensity"
          value={tweaks.intensity}
          onChange={(event) => onIntensityChange(event.target.value)}
        >
          <option value="inked">inked</option>
          <option value="plain">plain</option>
        </select>
      </label>
    </aside>
  )
}

export default function GuildOverview({ guild, onSettingsClick }) {
  const [dashboard, setDashboard] = useState(() => buildFallbackDashboard(guild))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tweaks, setTweaks] = useState(loadTweaks)

  useEffect(() => {
    applyBodyTweaks(tweaks)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DASHBOARD_TWEAKS_KEY, JSON.stringify(tweaks))
    }
  }, [tweaks])

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
  }, [guild?.name, guild?.realm, guild?.region])

  const normalized = useMemo(() => normalizeDashboard(dashboard, guild), [dashboard, guild])
  const parseTrend = normalized.charts.parseTrend.slice(-12)
  const ilvlTrend = normalized.charts.ilvlTrend.slice(-12)
  const guildLabel = [
    normalized.guild.name || guild?.name || 'Guild Dashboard',
    formatRealmLabel(normalized.guild.realm || guild?.realm),
    (normalized.guild.region || guild?.region || '').toUpperCase(),
  ].filter(Boolean).join(' · ')
  const latestRaidLabel = normalized.summary?.latest_raid_night_date
    ? `latest heroic night · ${formatRaidDate(normalized.summary.latest_raid_night_date)}`
    : 'waiting on heroic report history'
  const statusLabel = loading ? 'syncing dashboard data' : error || latestRaidLabel

  return (
    <section className="dashboard-shell">
      <div className="variant dashboard-variant">
        <div className="variant-head">
          <span className="variant-label">LOCKED · A</span>
          <span className="variant-title">Hero charts, progress rail, log leaderboard</span>
          <div className="dashboard-variant__meta">
            <span className="variant-note">weekly glance · raid-lead friendly</span>
            <button type="button" className="dashboard-settings-button" onClick={onSettingsClick}>
              Settings
            </button>
          </div>
        </div>

        <div className="dashboard-board__intro">
          <div className="dashboard-board__guild">{guildLabel}</div>
          <div className="dashboard-board__status">{statusLabel}</div>
        </div>

        <div className="grid-2 dashboard-grid-2">
          <HeroChartCard
            title="Avg guild parse · per raid night"
            meta={formatParseMeta(parseTrend)}
            values={parseTrend.map((entry) => entry.avgParsePct)}
            label="parse %"
            color="var(--role-dps)"
          />
          <HeroChartCard
            title="Avg guild ilvl · per raid night"
            meta={formatIlvlMeta(ilvlTrend)}
            values={ilvlTrend.map((entry) => entry.avgIlvl)}
            label="ilvl"
            color="var(--ink)"
          />
        </div>

        <ProgressRail progress={normalized.progress} />

        <div className="grid-2 dashboard-grid-2 dashboard-grid-2--lower">
          <LeaderboardCard entries={normalized.leaderboard} />
          <AttendanceCard entries={normalized.attendance} />
        </div>
      </div>

      <TweaksRail
        tweaks={tweaks}
        onToggleRoleColors={() => setTweaks((current) => ({
          ...current,
          rolecolors: current.rolecolors === 'on' ? 'off' : 'on',
        }))}
        onDensityChange={(density) => setTweaks((current) => ({ ...current, density }))}
        onIntensityChange={(intensity) => setTweaks((current) => ({ ...current, intensity }))}
      />
    </section>
  )
}
