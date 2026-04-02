import { useState, useEffect, useMemo } from 'react'

function Sparkline({ points, color, width = 400, height = 70 }) {
  if (points.length < 2) return null

  const vals = points.map(p => p.y)
  const [min, max] = [Math.min(...vals), Math.max(...vals)]
  const range = max - min || 1

  const toSvgX = (i) => (i / (points.length - 1)) * (width - 24) + 12
  const toSvgY = (v) => height - 12 - ((v - min) / range) * (height - 28)

  const polyPoints = points.map((p, i) => `${toSvgX(i).toFixed(1)},${toSvgY(p.y).toFixed(1)}`).join(' ')

  const last = points[points.length - 1]
  const lastX = toSvgX(points.length - 1)
  const lastY = toSvgY(last.y)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }}>
      <polyline
        points={polyPoints}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Dots at each point */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={toSvgX(i).toFixed(1)}
          cy={toSvgY(p.y).toFixed(1)}
          r="3"
          fill={color}
          opacity="0.7"
        >
          <title>{`${p.label}: ${p.y}`}</title>
        </circle>
      ))}
      {/* Last value label */}
      <text
        x={lastX > width - 60 ? lastX - 6 : lastX + 6}
        y={lastY - 6}
        textAnchor={lastX > width - 60 ? 'end' : 'start'}
        fill={color}
        fontSize="11"
        fontWeight="600"
      >
        {last.y}
      </text>
    </svg>
  )
}

function formatDate(dateStr) {
  // Handles both 'YYYY-MM-DD' (iLvl) and ISO timestamps (sim)
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

export default function ProgressionCharts({ characterName }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [ilvlOpen, setIlvlOpen] = useState(true)
  const [simOpen, setSimOpen]   = useState(true)

  useEffect(() => {
    if (!characterName) return
    setLoading(true)
    fetch(`/api/snapshots?character=${encodeURIComponent(characterName)}`)
      .then(r => r.ok ? r.json() : { ilvl: [], sim: [] })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setData({ ilvl: [], sim: [] }); setLoading(false) })
  }, [characterName])

  const ilvlPoints = useMemo(() => {
    if (!data?.ilvl?.length) return []
    return data.ilvl.map(r => ({
      y:     Math.round(r.avg_ilvl * 10) / 10,
      label: formatDate(r.snapped_at),
    }))
  }, [data])

  const simPoints = useMemo(() => {
    if (!data?.sim?.length) return []
    return data.sim.map(r => ({
      y:     r.dps,
      label: formatDate(r.simmed_at),
      type:  r.report_type,
    }))
  }, [data])

  if (loading) {
    return (
      <section className="wcl-section">
        <div className="wcl-header">
          <span className="wcl-title">Progression History</span>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>Loading…</span>
        </div>
      </section>
    )
  }

  const hasAny = ilvlPoints.length > 0 || simPoints.length > 0

  return (
    <section className="wcl-section">
      <div className="wcl-header">
        <span className="wcl-title">Progression History</span>
        {!hasAny && (
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
            No history yet — records automatically as you use the tool
          </span>
        )}
      </div>

      {/* iLvl over time */}
      <div className="chart-block">
        <button
          className="wcl-expand-btn"
          onClick={() => setIlvlOpen(o => !o)}
          style={{ width: '100%', textAlign: 'left' }}
        >
          <span>Item Level over time</span>
          {ilvlPoints.length > 0 && (
            <span className="wcl-avg-badge" style={{ background: 'rgba(0,112,221,0.15)', color: 'var(--rare-blue)' }}>
              {ilvlPoints[ilvlPoints.length - 1].y}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>{ilvlOpen ? '▲' : '▼'}</span>
        </button>
        {ilvlOpen && (
          ilvlPoints.length >= 2
            ? <div style={{ padding: '8px 0 4px' }}>
                <Sparkline points={ilvlPoints} color="var(--rare-blue)" />
                <div className="chart-x-labels">
                  <span>{ilvlPoints[0].label}</span>
                  <span>{ilvlPoints[ilvlPoints.length - 1].label}</span>
                </div>
              </div>
            : <p className="text-muted" style={{ fontSize: '0.8rem', padding: '6px 0' }}>
                {ilvlPoints.length === 1 ? 'Need 1 more day of data to draw a chart.' : 'No iLvl history yet.'}
              </p>
        )}
      </div>

      {/* Sim DPS over time */}
      <div className="chart-block">
        <button
          className="wcl-expand-btn"
          onClick={() => setSimOpen(o => !o)}
          style={{ width: '100%', textAlign: 'left' }}
        >
          <span>Sim DPS over time</span>
          {simPoints.length > 0 && (
            <span className="wcl-avg-badge" style={{ background: 'rgba(163,53,238,0.15)', color: 'var(--epic-purple)' }}>
              {simPoints[simPoints.length - 1].y.toLocaleString()}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>{simOpen ? '▲' : '▼'}</span>
        </button>
        {simOpen && (
          simPoints.length >= 2
            ? <div style={{ padding: '8px 0 4px' }}>
                <Sparkline points={simPoints} color="var(--epic-purple)" />
                <div className="chart-x-labels">
                  <span>{simPoints[0].label}</span>
                  <span>{simPoints[simPoints.length - 1].label}</span>
                </div>
              </div>
            : <p className="text-muted" style={{ fontSize: '0.8rem', padding: '6px 0' }}>
                {simPoints.length === 1 ? 'Need 1 more sim to draw a chart.' : 'No sim history yet.'}
              </p>
        )}
      </div>
    </section>
  )
}
