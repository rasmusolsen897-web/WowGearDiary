import { useMemo } from 'react';
import './UpgradeCharts.css';

/**
 * UpgradeCharts — Module C
 * Chart 1: DPS% Gain by Slot (highest raidSim dps per slot)
 * Chart 2: Current iLvl vs Best Available (raidSim + mythicSim combined)
 */
export default function UpgradeCharts({ data }) {
  const { gear = [], raidSim = [], mythicSim = [] } = data;

  // ─── Chart 1: DPS% Gain by Slot (memoized) ────────────────────────────────

  const { dpsSlots, maxDps } = useMemo(() => {
    const dpsPerSlot = {};
    for (const item of raidSim) {
      const slot = item.slot;
      if (dpsPerSlot[slot] === undefined || item.dps > dpsPerSlot[slot]) {
        dpsPerSlot[slot] = item.dps;
      }
    }
    const slots = Object.entries(dpsPerSlot)
      .filter(([, dps]) => dps > 0)
      .sort(([, a], [, b]) => b - a);
    return { dpsSlots: slots, maxDps: slots.length > 0 ? slots[0][1] : 1 };
  }, [raidSim]);

  function dpsBarColor(dps) {
    if (dps >= 2) return 'var(--success)';
    if (dps >= 1) return 'var(--warning)';
    return 'var(--rare-blue)';
  }

  // ─── Chart 2: Current iLvl vs Best Available ──────────────────────────────

  const ILVL_MIN = 230;
  const ILVL_MAX = 290;
  const ILVL_RANGE = ILVL_MAX - ILVL_MIN;

  // Build chart rows (memoized) — slot → current iLvl vs best available
  const ilvlRows = useMemo(() => {
    const bestAvailableBySlot = {};
    const allSims = [...raidSim, ...mythicSim];
    for (const item of allSims) {
      const slot = item.slot;
      if (bestAvailableBySlot[slot] === undefined || item.ilvl > bestAvailableBySlot[slot]) {
        bestAvailableBySlot[slot] = item.ilvl;
      }
    }

    return gear.map((g) => {
      const currentIlvl = g.ilvl;
      const bestIlvl = bestAvailableBySlot[g.slot] ?? null;
      const isBis = bestIlvl !== null && bestIlvl <= currentIlvl;

      const currentPct = Math.max(0, Math.min(100, ((currentIlvl - ILVL_MIN) / ILVL_RANGE) * 100));
      const bestPct = bestIlvl !== null
        ? Math.max(0, Math.min(100, ((bestIlvl - ILVL_MIN) / ILVL_RANGE) * 100))
        : 0;

      return { slot: g.slot, currentIlvl, bestIlvl, isBis, currentPct, bestPct };
    });
  }, [gear, raidSim, mythicSim]);

  function ilvlQualityColor(ilvl) {
    if (ilvl === null) return 'var(--text-muted)';
    if (ilvl >= 272) return 'var(--legendary-orange)';
    if (ilvl >= 263) return 'var(--epic-purple)';
    if (ilvl >= 250) return 'var(--rare-blue)';
    if (ilvl >= 232) return 'var(--uncommon-green)';
    return 'var(--text-muted)';
  }

  function currentIlvlColor(ilvl) {
    if (ilvl >= 272) return 'rgba(255,128,0,0.35)';
    if (ilvl >= 263) return 'rgba(163,53,238,0.35)';
    if (ilvl >= 250) return 'rgba(0,112,221,0.35)';
    if (ilvl >= 232) return 'rgba(30,255,0,0.25)';
    return 'rgba(122,139,160,0.25)';
  }

  return (
    <div className="upgrade-charts">
      {/* ── Chart 1 ─────────────────────────────────────────────────────── */}
      <h2 className="section-title">DPS% Gain by Slot</h2>
      <div className="card chart-card">
        {dpsSlots.length === 0 ? (
          <div className="no-results">No upgrade data available.</div>
        ) : (
          <div className="chart1-list">
            {dpsSlots.map(([slot, dps]) => {
              const barPct = (dps / maxDps) * 100;
              const color = dpsBarColor(dps);
              return (
                <div key={slot} className="chart1-row">
                  <span className="chart1-slot">{slot}</span>
                  <div className="chart1-bar-track">
                    <div
                      className="chart1-bar-fill"
                      style={{
                        width: `${barPct}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <span
                    className="chart1-dps-label"
                    style={{ color }}
                  >
                    +{dps.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="chart1-legend">
          <span className="legend-dot" style={{ background: 'var(--success)' }} />
          <span className="legend-label">≥2% High</span>
          <span className="legend-dot" style={{ background: 'var(--warning)' }} />
          <span className="legend-label">1–1.9% Mid</span>
          <span className="legend-dot" style={{ background: 'var(--rare-blue)' }} />
          <span className="legend-label">&lt;1% Low</span>
        </div>
      </div>

      {/* ── Chart 2 ─────────────────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: '28px' }}>Current iLvl vs Best Available</h2>
      <div className="card chart-card">
        <div className="chart2-scale-labels">
          <span>{ILVL_MIN}</span>
          <span>{Math.round(ILVL_MIN + ILVL_RANGE * 0.25)}</span>
          <span>{Math.round(ILVL_MIN + ILVL_RANGE * 0.5)}</span>
          <span>{Math.round(ILVL_MIN + ILVL_RANGE * 0.75)}</span>
          <span>{ILVL_MAX}</span>
        </div>
        <div className="chart2-list">
          {ilvlRows.map((row) => (
            <div key={row.slot} className="chart2-row">
              <span className="chart2-slot">{row.slot}</span>
              <div className="chart2-bars">
                {/* Current iLvl bar */}
                <div className="chart2-bar-track">
                  <div
                    className="chart2-bar-fill chart2-bar-current"
                    style={{
                      width: `${row.currentPct}%`,
                      background: currentIlvlColor(row.currentIlvl),
                    }}
                    title={`Current: ${row.currentIlvl}`}
                  />
                  <span className="chart2-bar-label chart2-label-current">
                    {row.currentIlvl}
                  </span>
                </div>

                {/* Best available bar or BIS indicator */}
                <div className="chart2-bar-track">
                  {row.isBis || row.bestIlvl === null ? (
                    row.bestIlvl !== null ? (
                      <span className="chart2-bis-badge">✓ BIS</span>
                    ) : (
                      <span className="chart2-no-upgrade">—</span>
                    )
                  ) : (
                    <>
                      <div
                        className="chart2-bar-fill chart2-bar-best"
                        style={{
                          width: `${row.bestPct}%`,
                          background: ilvlQualityColor(row.bestIlvl),
                        }}
                        title={`Best: ${row.bestIlvl}`}
                      />
                      <span
                        className="chart2-bar-label chart2-label-best"
                        style={{ color: ilvlQualityColor(row.bestIlvl) }}
                      >
                        {row.bestIlvl}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="chart2-legend">
          <div className="chart2-legend-item">
            <div className="chart2-legend-bar" style={{ background: 'rgba(122,139,160,0.4)' }} />
            <span>Current</span>
          </div>
          <div className="chart2-legend-item">
            <div className="chart2-legend-bar" style={{ background: 'var(--epic-purple)' }} />
            <span>Best upgrade</span>
          </div>
          <div className="chart2-legend-item">
            <span className="chart2-bis-badge">✓ BIS</span>
            <span style={{ marginLeft: '6px' }}>Already at best</span>
          </div>
        </div>
      </div>
    </div>
  );
}
