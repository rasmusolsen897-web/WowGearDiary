import { useState, useEffect } from 'react';
import { useStorage } from '../hooks/index.js';

// ---------------------------------------------------------------------------
// Countdown helpers
// ---------------------------------------------------------------------------

function msUntilReset() {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcH   = now.getUTCHours();
  const utcM   = now.getUTCMinutes();
  const utcS   = now.getUTCSeconds();
  const utcMs  = now.getUTCMilliseconds();

  const secToday = utcH * 3600 + utcM * 60 + utcS + utcMs / 1000;
  let daysUntilTuesday = (2 - utcDay + 7) % 7;
  const resetSecondOfDay = 9 * 3600; // 09:00 UTC

  if (daysUntilTuesday === 0 && secToday >= resetSecondOfDay) daysUntilTuesday = 7;
  if (daysUntilTuesday === 0) return (resetSecondOfDay - secToday) * 1000;

  const msUntilMidnightUTC = (86400 - secToday) * 1000;
  const msFullDays = (daysUntilTuesday - 1) * 86400 * 1000;
  return msUntilMidnightUTC + msFullDays + resetSecondOfDay * 1000;
}

function formatCountdown(ms) {
  if (ms <= 0) return '0d 0h 0m';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function ResetCountdown() {
  const [ms, setMs] = useState(() => msUntilReset());

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilReset()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isUrgent = ms < 60 * 60 * 1000;
  const color = isUrgent ? 'var(--warning)' : 'var(--frost-blue)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>EU Reset (Tue 09:00 UTC)</span>
      <span style={{ color, fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: '0.05em' }}>
        Resets in {formatCountdown(ms)}
      </span>
      {isUrgent && (
        <span className="badge" style={{ background: 'rgba(255,215,0,0.15)', color: 'var(--warning)', border: '1px solid rgba(255,215,0,0.4)' }}>
          SOON
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WeeklyTracker({ bosses, dungeons }) {
  const [killedMap, setKilledMap] = useStorage('bosses', {});
  const [runsMap,   setRunsMap]   = useStorage('runs', {});
  const [vault,     setVault]     = useStorage('vault', { raid: false, mythic: false, world: false });

  const killedCount = bosses.filter((b) => killedMap && killedMap[b.boss]).length;
  const totalRuns   = Object.values(runsMap || {}).reduce((sum, v) => sum + (v || 0), 0);
  const safeVault   = vault && typeof vault === 'object' ? vault : { raid: false, mythic: false, world: false };

  function toggleBoss(name) {
    setKilledMap((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function changeRuns(dungeon, delta) {
    setRunsMap((prev) => ({ ...prev, [dungeon]: Math.max(0, ((prev && prev[dungeon]) || 0) + delta) }));
  }

  function toggleVault(slot) {
    setVault((prev) => ({ ...prev, [slot]: !prev[slot] }));
  }

  function handleReset() {
    if (window.confirm('Reset all weekly progress?')) {
      setKilledMap({});
      setRunsMap({});
      setVault({ raid: false, mythic: false, world: false });
    }
  }

  function priorityBadgeClass(p) {
    if (p === 'high')   return 'badge badge-priority-high';
    if (p === 'medium') return 'badge badge-priority-medium';
    return 'badge badge-priority-low';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Countdown */}
      <div className="card">
        <p className="section-title">Weekly Reset</p>
        <ResetCountdown />
      </div>

      {/* Boss Kill Tracker */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Boss Kill Tracker</p>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <span style={{ color: killedCount === bosses.length ? 'var(--success)' : 'var(--frost-blue)', fontWeight: 600 }}>
              {killedCount}
            </span> / {bosses.length} killed
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bosses.map((b) => {
            const killed = !!(killedMap && killedMap[b.boss]);
            return (
              <label key={b.boss} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
                cursor: 'pointer', opacity: killed ? 0.5 : 1, transition: 'opacity 0.12s',
              }}>
                <input
                  type="checkbox" checked={killed} onChange={() => toggleBoss(b.boss)}
                  style={{ width: 15, height: 15, accentColor: 'var(--frost-blue)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, textDecoration: killed ? 'line-through' : 'none', color: killed ? 'var(--text-muted)' : 'var(--text)' }}>
                  {b.boss}
                </span>
                <span className={priorityBadgeClass(b.priority)}>{b.priority}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* M+ Run Counter */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <p className="section-title" style={{ marginBottom: 0 }}>M+ Run Counter</p>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--frost-blue)', fontWeight: 600 }}>{totalRuns}</span> runs this week
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dungeons.map((d) => {
            const count = (runsMap && runsMap[d.dungeon]) || 0;
            return (
              <div key={d.dungeon} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--frost-blue)' }}>{d.dungeon}</span>
                  {d.note && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{d.note}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button className="btn" onClick={() => changeRuns(d.dungeon, -1)} disabled={count === 0}
                    style={{ padding: '3px 10px', fontSize: 16, lineHeight: 1, opacity: count === 0 ? 0.35 : 1, cursor: count === 0 ? 'not-allowed' : 'pointer' }}>
                    &minus;
                  </button>
                  <span style={{ width: 28, textAlign: 'center', fontSize: 15, fontWeight: 700, color: count > 0 ? 'var(--frost-blue)' : 'var(--text-muted)' }}>
                    {count}
                  </span>
                  <button className="btn" onClick={() => changeRuns(d.dungeon, 1)} style={{ padding: '3px 10px', fontSize: 16, lineHeight: 1 }}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vault Tracker */}
      <div className="card">
        <p className="section-title">Vault Tracker</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[{ key: 'raid', label: 'Raid Vault' }, { key: 'mythic', label: 'M+ Vault' }, { key: 'world', label: 'World Vault' }].map(({ key, label }) => {
            const filled = !!safeVault[key];
            return (
              <button key={key} onClick={() => toggleVault(key)} aria-pressed={filled} style={{
                flex: '1 1 120px', padding: '14px 12px', borderRadius: 8, cursor: 'pointer',
                border: filled ? '2px solid var(--epic-purple)' : '2px solid var(--border)',
                background: filled ? 'rgba(163,53,238,0.12)' : 'rgba(255,255,255,0.02)',
                boxShadow: filled ? '0 0 14px rgba(163,53,238,0.35)' : 'none',
                color: filled ? 'var(--epic-purple)' : 'var(--text-muted)',
                fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 22 }}>{filled ? '✦' : '◇'}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={handleReset} style={{ borderColor: 'rgba(255,80,80,0.4)', color: 'rgba(255,130,130,0.9)' }}>
          Reset Week
        </button>
      </div>

    </div>
  );
}
