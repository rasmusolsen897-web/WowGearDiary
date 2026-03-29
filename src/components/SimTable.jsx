function ilvlClass(ilvl) {
  if (ilvl >= 272) return 'ilvl-legendary'
  if (ilvl >= 263) return 'ilvl-epic'
  if (ilvl >= 250) return 'ilvl-rare'
  if (ilvl >= 232) return 'ilvl-uncommon'
  return 'ilvl-common'
}

function dpsClass(dps) {
  if (dps >= 2) return 'text-success'
  if (dps >= 1) return 'text-warning'
  return 'text-muted'
}

function dpsBarClass(dps) {
  if (dps >= 2) return 'dps-high-color'
  if (dps >= 1) return 'dps-mid-color'
  return 'dps-low-color'
}

// Normalize slot names so gear slot "Trinket 1"/"Trinket 2" matches sim slot "Trinket"
function normalizeSlot(slot) {
  if (!slot) return ''
  if (slot.startsWith('Trinket')) return 'Trinket'
  if (slot.startsWith('Ring') || slot === 'Finger') return 'Ring'
  return slot
}

export default function SimTable({
  raidSim, mythicSim, activeTab, onTabChange,
  selectedSlot, onClearSlot,
  typeFilter, onTypeFilter,
  raidOnly, onRaidOnly,
  showCatalyst, onShowCatalyst,
}) {
  const rawData = activeTab === 'raid' ? raidSim : mythicSim
  const maxDps = Math.max(...rawData.map(r => r.dps))

  // Apply filters
  let filtered = rawData

  // Slot filter from gear sidebar
  if (selectedSlot) {
    const normSelected = normalizeSlot(selectedSlot)
    filtered = filtered.filter(r => normalizeSlot(r.slot) === normSelected)
  }

  // Type filter
  if (typeFilter === 'tier') {
    filtered = filtered.filter(r => r.tier)
  } else if (typeFilter === 'trinket') {
    filtered = filtered.filter(r => normalizeSlot(r.slot) === 'Trinket')
  }

  // Raid-only toggle (hides catalyst items)
  if (raidOnly && activeTab === 'raid') {
    filtered = filtered.filter(r => !r.catalyst)
  }

  // Catalyst toggle
  if (!showCatalyst) {
    filtered = filtered.filter(r => !r.catalyst)
  }

  const isRaid = activeTab === 'raid'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Tabs */}
      <div className="tabs" style={{ padding: '0 16px' }}>
        <button className={`tab ${activeTab === 'raid' ? 'active' : ''}`} onClick={() => onTabChange('raid')}>
          ⚔ Heroic Raid Sim
        </button>
        <button className={`tab ${activeTab === 'mythic' ? 'active' : ''}`} onClick={() => onTabChange('mythic')}>
          🗝 Mythic+ Sim
        </button>
      </div>

      {/* Filter bar */}
      <div className="filter-bar" style={{ padding: '10px 16px' }}>
        <div className="filter-group">
          {[
            { key: 'all', label: 'All' },
            { key: 'tier', label: '✦ Tier' },
            { key: 'trinket', label: '◉ Trinkets' },
          ].map(f => (
            <button
              key={f.key}
              className={`btn btn-toggle ${typeFilter === f.key ? (f.key === 'tier' ? 'active-purple' : 'active') : ''}`}
              onClick={() => onTypeFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        {isRaid && (
          <button
            className={`btn btn-toggle ${raidOnly ? 'active' : ''}`}
            onClick={() => onRaidOnly(v => !v)}
          >
            Raid Drops Only
          </button>
        )}

        <button
          className={`btn btn-toggle ${showCatalyst ? 'active-orange' : ''}`}
          onClick={() => onShowCatalyst(v => !v)}
        >
          🔥 Catalyst
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Slot filter banner */}
      {selectedSlot && (
        <div style={{ padding: '0 16px 10px' }}>
          <div className="slot-filter-banner">
            <span>Filtering by: <strong>{selectedSlot}</strong></span>
            <button onClick={onClearSlot} title="Clear filter">×</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="no-results">No items match the current filters.</div>
        ) : (
          <table className="sim-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Slot</th>
                <th>iLvl</th>
                <th>+DPS%</th>
                <th>Source</th>
                {!isRaid && <th>Dungeon</th>}
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const normSlot = normalizeSlot(selectedSlot)
                const rowSlot = normalizeSlot(row.slot)
                const isHighlighted = selectedSlot && rowSlot === normSlot
                const barWidth = Math.max(6, (row.dps / maxDps) * 72)

                return (
                  <tr key={i} className={isHighlighted ? 'row-highlighted' : ''}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, width: 28 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500, maxWidth: 200 }}>{row.item}</td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.slot}</td>
                    <td>
                      <span className={ilvlClass(row.ilvl)} style={{ fontWeight: 700 }}>{row.ilvl}</span>
                    </td>
                    <td>
                      <div className="dps-bar-wrap">
                        <div
                          className={`dps-bar ${dpsBarClass(row.dps)}`}
                          style={{ width: barWidth }}
                        />
                        <span className={dpsClass(row.dps)} style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                          +{row.dps.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 180 }}>{row.source}</td>
                    {!isRaid && (
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{row.dungeon}</td>
                    )}
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                        {row.tier && <span className="badge badge-tier">Tier</span>}
                        {row.catalyst && <span className="badge badge-catalyst">CAT</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
