const COLUMNS = [
  {
    key: 'thisWeek',
    label: 'This Week',
    color: 'var(--frost-blue)',
    bulletColor: 'var(--frost-blue)',
    icon: '📅',
  },
  {
    key: 'thursday',
    label: 'Thursday Raid',
    color: 'var(--epic-purple)',
    bulletColor: 'var(--epic-purple)',
    icon: '⚔',
  },
  {
    key: 'afterRaid',
    label: 'After Raid',
    color: 'var(--legendary-orange)',
    bulletColor: 'var(--legendary-orange)',
    icon: '✔',
  },
]

export default function GamePlan({ gamePlan }) {
  return (
    <div className="gameplan-grid">
      {COLUMNS.map(col => (
        <div key={col.key} className="card gameplan-card">
          <div className="gameplan-header" style={{ color: col.color }}>
            <span style={{ marginRight: 8 }}>{col.icon}</span>
            {col.label}
          </div>
          <ul className="gameplan-list">
            {gamePlan[col.key].map((item, i) => (
              <li key={i} className="gameplan-item">
                <div className="gameplan-bullet" style={{ background: col.bulletColor, opacity: 0.8 }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
