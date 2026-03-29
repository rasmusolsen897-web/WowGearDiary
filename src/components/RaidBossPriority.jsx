// Extract DPS% from drop strings like "Gaze of the Alnseer (Trinket +2.5%)"
function extractDps(dropStr) {
  const match = dropStr.match(/\+(\d+\.\d+)%/)
  return match ? parseFloat(match[1]) : null
}

function DropDps({ dps }) {
  if (dps === null) return null
  const color = dps >= 2 ? 'var(--success)' : dps >= 1 ? 'var(--warning)' : 'var(--text-muted)'
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11, marginLeft: 'auto', paddingLeft: 8, whiteSpace: 'nowrap' }}>
      +{dps.toFixed(1)}%
    </span>
  )
}

const priorityBadgeClass = {
  high: 'badge-priority-high',
  medium: 'badge-priority-medium',
  low: 'badge-priority-low',
}

export default function RaidBossPriority({ bosses }) {
  return (
    <div className="boss-grid">
      {bosses.map(boss => (
        <div key={boss.boss} className={`card boss-card priority-${boss.priority}`}>
          <div className="boss-name">
            <span>{boss.boss}</span>
            <span className={`badge ${priorityBadgeClass[boss.priority]}`}>
              {boss.priority.toUpperCase()}
            </span>
          </div>
          <ul className="boss-drops">
            {boss.drops.map((drop, i) => {
              const dps = extractDps(drop)
              // Strip the DPS part from the display string
              const label = drop.replace(/\s*\+\d+\.\d+%/, '')
              return (
                <li key={i} className="boss-drop-item">
                  <span style={{ flex: 1 }}>{label}</span>
                  <DropDps dps={dps} />
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
