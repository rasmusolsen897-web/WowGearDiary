const TIER_SLOTS = ['Head', 'Shoulder', 'Chest', 'Hands', 'Legs']

export default function TierProgress({ gear }) {
  const tierMap = {}
  for (const item of gear) {
    if (item.tierSlot) tierMap[item.slot] = item.hasTier
  }

  const hasTierCount = TIER_SLOTS.filter(s => tierMap[s]).length
  const needed = hasTierCount < 2 ? 2 - hasTierCount : hasTierCount < 4 ? 4 - hasTierCount : 0
  const bonusLabel =
    hasTierCount >= 4 ? '4pc ACTIVE' :
    hasTierCount >= 2 ? '2pc ACTIVE — need 2 more for 4pc' :
    `Need ${needed} more for 2pc bonus`

  const bonusColor =
    hasTierCount >= 4 ? 'var(--legendary-orange)' :
    hasTierCount >= 2 ? 'var(--success)' :
    'var(--text-muted)'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="font-display" style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--epic-purple)' }}>
            Tier Set
          </span>
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 22, fontWeight: 700,
            color: hasTierCount >= 2 ? 'var(--epic-purple)' : 'var(--text-muted)',
          }}>
            {hasTierCount}/5
          </span>
        </div>
        <span style={{ fontSize: 12, color: bonusColor, fontWeight: 600 }}>
          {bonusLabel}
        </span>
      </div>

      <div className="tier-slots-grid">
        {TIER_SLOTS.map(slot => {
          const active = tierMap[slot]
          return (
            <div key={slot} className={`tier-slot-box ${active ? 'has-tier' : 'no-tier'}`}>
              {active && <div style={{ fontSize: 16, marginBottom: 2 }}>✦</div>}
              {slot}
            </div>
          )
        })}
      </div>
    </div>
  )
}
