export default function DungeonPriority({ dungeons, mythicSim }) {
  // Group mythicSim items by dungeon name
  const byDungeon = {}
  for (const item of mythicSim) {
    if (!byDungeon[item.dungeon]) byDungeon[item.dungeon] = []
    byDungeon[item.dungeon].push(item)
  }

  return (
    <div className="dungeon-grid">
      {dungeons.map((d, rank) => {
        const items = byDungeon[d.dungeon] || []
        return (
          <div key={d.dungeon} className="card dungeon-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="dungeon-name">{d.dungeon}</div>
              <span style={{
                background: 'rgba(105,204,255,0.12)',
                border: '1px solid rgba(105,204,255,0.3)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11, fontWeight: 700,
                color: 'var(--frost-blue)',
              }}>
                #{rank + 1}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{d.note}</div>
            {items.length > 0 && (
              <ul className="dungeon-drops-list">
                {items.map((item, i) => (
                  <li key={i} className="dungeon-drop-item">
                    <span style={{ flex: 1, color: 'var(--text)' }}>{item.item}</span>
                    {item.catalyst && <span className="badge badge-catalyst" style={{ fontSize: 10 }}>CAT</span>}
                    <span style={{ fontWeight: 700, color: 'var(--rare-blue)', fontSize: 11 }}>{item.ilvl}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
