function ilvlClass(ilvl) {
  if (ilvl >= 272) return 'ilvl-legendary'
  if (ilvl >= 263) return 'ilvl-epic'
  if (ilvl >= 250) return 'ilvl-rare'
  if (ilvl >= 232) return 'ilvl-uncommon'
  return 'ilvl-common'
}

export default function GearSlots({ gear, selectedSlot, onSlotClick }) {
  return (
    <div className="card" style={{ padding: '12px 8px' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.1em', padding: '0 12px 10px', borderBottom: '1px solid var(--border)',
        marginBottom: 6,
      }}>
        Gear Slots
        {selectedSlot && (
          <button
            onClick={() => onSlotClick(selectedSlot)}
            style={{
              float: 'right', background: 'none', border: 'none',
              color: 'var(--frost-blue)', cursor: 'pointer', fontSize: 11,
              fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
          >
            Clear ×
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {gear.map(item => {
          const isActive = selectedSlot === item.slot
          return (
            <div
              key={item.slot}
              className={`gear-slot-row ${isActive ? 'active' : ''} ${item.hasTier ? 'has-tier' : ''}`}
              onClick={() => onSlotClick(item.slot)}
              title={`Filter sim table to: ${item.slot}`}
            >
              <span className="slot-name">{item.slot}</span>
              <span className="slot-item" style={{ color: item.hasTier ? 'var(--epic-purple)' : 'var(--text)' }}>
                {item.item}
              </span>
              <span className={`slot-ilvl ${ilvlClass(item.ilvl)}`}>{item.ilvl}</span>
              {item.tierSlot && (
                <span title={item.hasTier ? 'Has tier' : 'Tier slot — no tier yet'} style={{ fontSize: 12, opacity: item.hasTier ? 1 : 0.3 }}>
                  {item.hasTier ? '✦' : '◇'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
