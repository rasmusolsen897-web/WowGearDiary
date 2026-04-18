import { useEffect, useMemo, useState } from 'react'

const HISTORY_METRICS = {
  ilvl: {
    key: 'ilvl',
    label: 'iLvl',
    title: 'Item Level',
    color: 'var(--rare-blue)',
    emptyMessage: 'No iLvl history yet.',
    onePointMessage: 'Need 1 more day of data to draw a trend.',
    defaultDomain: [220, 280],
    valueFormatter: (value) => Number(value).toFixed(1),
    axisFormatter: (value) => Math.round(value).toString(),
    valueAccessor: (row) => row.avg_ilvl,
    dateAccessor: (row) => row.snapped_at,
  },
  sim: {
    key: 'sim',
    label: 'Sim DPS',
    title: 'Sim DPS',
    color: 'var(--epic-purple)',
    emptyMessage: 'No sim history yet.',
    onePointMessage: 'Need 1 more sim to draw a trend.',
    defaultDomain: [0, 500000],
    valueFormatter: (value) => Number(value).toLocaleString('en-US'),
    axisFormatter: (value) => compactNumber(value),
    valueAccessor: (row) => row.dps,
    dateAccessor: (row) => row.simmed_at,
  },
}

export function formatHistoryDate(dateStr) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

export function buildHistorySeries(snapshotData, metric) {
  const config = HISTORY_METRICS[metric] ?? HISTORY_METRICS.ilvl
  const rows = Array.isArray(snapshotData?.[metric]) ? snapshotData[metric] : []

  return rows
    .map((row) => {
      const rawValue = Number(config.valueAccessor(row))
      if (!Number.isFinite(rawValue)) return null
      return {
        y: metric === 'ilvl' ? Math.round(rawValue * 10) / 10 : rawValue,
        label: formatHistoryDate(config.dateAccessor(row)),
        raw: row,
      }
    })
    .filter(Boolean)
}

export function buildHistoryChartModel(points, metric) {
  const config = HISTORY_METRICS[metric] ?? HISTORY_METRICS.ilvl
  const width = 720
  const height = 260
  const margin = { top: 20, right: 20, bottom: 38, left: 58 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const values = points.map((point) => point.y)
  const hasPoints = points.length > 0
  const domain = hasPoints
    ? buildPaddedDomain(values, metric)
    : config.defaultDomain

  const [domainMin, domainMax] = domain
  const safeRange = domainMax - domainMin || 1
  const pointCoordinates = points.map((point, index) => {
    const x = points.length === 1
      ? margin.left + plotWidth / 2
      : margin.left + (index / (points.length - 1)) * plotWidth
    const y = margin.top + (1 - ((point.y - domainMin) / safeRange)) * plotHeight
    return { ...point, x, y }
  })

  const yTicks = createTicks(domainMin, domainMax, 4)
  const xLabelIndexes = createXLabelIndexes(points.length)
  const xLabels = xLabelIndexes.map((index) => ({
    index,
    label: points[index]?.label ?? '',
  }))

  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    domainMin,
    domainMax,
    yTicks,
    xLabels,
    pointCoordinates,
    hasPoints,
    latestValue: points.at(-1)?.y ?? null,
  }
}

export default function ProgressionCharts({ characterName, title = 'Progression History' }) {
  const [data, setData] = useState({ ilvl: [], sim: [] })
  const [loading, setLoading] = useState(true)
  const [activeMetric, setActiveMetric] = useState('ilvl')

  useEffect(() => {
    setActiveMetric('ilvl')
  }, [characterName])

  useEffect(() => {
    if (!characterName) {
      setData({ ilvl: [], sim: [] })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    fetch(`/api/snapshots?character=${encodeURIComponent(characterName)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { ilvl: [], sim: [] }))
      .then((payload) => {
        setData({
          ilvl: Array.isArray(payload?.ilvl) ? payload.ilvl : [],
          sim: Array.isArray(payload?.sim) ? payload.sim : [],
        })
      })
      .catch(() => {
        setData({ ilvl: [], sim: [] })
      })
      .finally(() => {
        setLoading(false)
      })

    return () => controller.abort()
  }, [characterName])

  const ilvlSeries = useMemo(() => buildHistorySeries(data, 'ilvl'), [data])
  const simSeries = useMemo(() => buildHistorySeries(data, 'sim'), [data])
  const activeSeries = activeMetric === 'sim' ? simSeries : ilvlSeries
  const activeConfig = HISTORY_METRICS[activeMetric] ?? HISTORY_METRICS.ilvl
  const chartModel = useMemo(() => buildHistoryChartModel(activeSeries, activeMetric), [activeSeries, activeMetric])
  const latestValue = chartModel.latestValue

  return (
    <section className="wcl-section overview-card progression-card">
      <div className="progression-card-header">
        <div className="progression-card-copy">
          <div className="progression-card-kicker">History</div>
          <h3 className="progression-card-title">{title}</h3>
          {characterName && (
            <p className="progression-card-subtitle">{characterName}</p>
          )}
        </div>

        <div className="progression-toggle-group" role="tablist" aria-label="Progression metric">
          {Object.values(HISTORY_METRICS).map((metric) => (
            <button
              key={metric.key}
              type="button"
              role="tab"
              aria-selected={activeMetric === metric.key}
              className={`btn-pill progression-toggle${activeMetric === metric.key ? ' active' : ''}`}
              onClick={() => setActiveMetric(metric.key)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="progression-legend" aria-live="polite">
        <span className="progression-legend-swatch" style={{ color: activeConfig.color }} />
        <span>{activeConfig.title}</span>
        {latestValue !== null && (
          <span className="progression-legend-value">{formatMetricValue(activeMetric, latestValue)}</span>
        )}
        {loading && <span className="text-muted">Loading...</span>}
      </div>

      <div className="history-chart-shell">
        <HistoryChartSvg
          metric={activeMetric}
          config={activeConfig}
          model={chartModel}
          loading={loading}
        />
        {!chartModel.hasPoints && (
          <div className="history-empty-state">
            {loading ? 'Loading progression history...' : activeConfig.emptyMessage}
          </div>
        )}
      </div>

      <div className="history-chart-footer">
        {chartModel.hasPoints && chartModel.pointCoordinates.length === 1
          ? activeConfig.onePointMessage
          : chartModel.hasPoints
            ? `${chartModel.pointCoordinates.length} data points`
            : activeConfig.emptyMessage}
      </div>
    </section>
  )
}

function HistoryChartSvg({ metric, config, model, loading }) {
  const axisColor = 'var(--border-bright)'
  const gridColor = 'rgba(255, 255, 255, 0.06)'

  return (
    <svg
      className="history-chart-svg"
      viewBox={`0 0 ${model.width} ${model.height}`}
      role="img"
      aria-label={`${config.title} chart`}
      preserveAspectRatio="none"
    >
      <line
        className="history-axis-line"
        x1={model.margin.left}
        y1={model.margin.top + model.plotHeight}
        x2={model.width - model.margin.right}
        y2={model.margin.top + model.plotHeight}
        stroke={axisColor}
      />
      <line
        className="history-axis-line"
        x1={model.margin.left}
        y1={model.margin.top}
        x2={model.margin.left}
        y2={model.margin.top + model.plotHeight}
        stroke={axisColor}
      />

      {model.yTicks.map((tick) => {
        const y = model.margin.top + (1 - ((tick - model.domainMin) / (model.domainMax - model.domainMin || 1))) * model.plotHeight
        return (
          <g key={tick}>
            <line
              className="history-grid-line"
              x1={model.margin.left}
              y1={y}
              x2={model.width - model.margin.right}
              y2={y}
              stroke={gridColor}
            />
            <text
              className="history-axis-label history-axis-label-y"
              x={model.margin.left - 10}
              y={y + 4}
              textAnchor="end"
            >
              {config.axisFormatter(tick)}
            </text>
          </g>
        )
      })}

      {model.hasPoints && model.pointCoordinates.length > 1 && (
        <polyline
          className="history-series"
          points={model.pointCoordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={config.color}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {model.pointCoordinates.map((point, index) => (
        <circle
          key={`${metric}-${index}`}
          className="history-point"
          cx={point.x.toFixed(1)}
          cy={point.y.toFixed(1)}
          r="4"
          fill={config.color}
          stroke="rgba(13, 13, 24, 0.9)"
          strokeWidth="2"
        >
          <title>{`${point.label}: ${formatMetricValue(metric, point.y)}`}</title>
        </circle>
      ))}

      {model.xLabels.map((label) => {
        const point = model.pointCoordinates[label.index]
        if (!point) return null
        const textAnchor = model.pointCoordinates.length === 1 ? 'middle' : (label.index === 0 ? 'start' : label.index === model.pointCoordinates.length - 1 ? 'end' : 'middle')
        const x = model.pointCoordinates.length === 1
          ? model.width / 2
          : label.index === 0
            ? point.x
            : label.index === model.pointCoordinates.length - 1
              ? point.x
              : point.x

        return (
          <text
            key={`${label.index}-${label.label}`}
            className="history-axis-label history-axis-label-x"
            x={x}
            y={model.height - 12}
            textAnchor={textAnchor}
          >
            {label.label}
          </text>
        )
      })}

      {!model.hasPoints && loading && (
        <text
          className="history-empty-label"
          x={model.width / 2}
          y={model.height / 2}
          textAnchor="middle"
        >
          Loading...
        </text>
      )}
    </svg>
  )
}

function buildPaddedDomain(values, metric) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const pad = metric === 'sim'
      ? Math.max(5000, Math.abs(max) * 0.12)
      : Math.max(1, Math.abs(max) * 0.08)
    return [Math.max(0, min - pad), max + pad]
  }

  const pad = (max - min) * 0.12
  return [Math.max(0, min - pad), max + pad]
}

function createTicks(min, max, count) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (count <= 1 || min === max) return [Math.round(min)]

  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, index) => {
    const value = min + step * index
    return Number.isInteger(value) ? value : Math.round(value)
  })
}

function createXLabelIndexes(length) {
  if (length <= 0) return []
  if (length === 1) return [0]
  if (length === 2) return [0, 1]

  const indexes = [0, Math.floor((length - 1) / 2), length - 1]
  return [...new Set(indexes)]
}

function formatMetricValue(metric, value) {
  const config = HISTORY_METRICS[metric] ?? HISTORY_METRICS.ilvl
  return config.valueFormatter(value)
}

function compactNumber(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value))
}
