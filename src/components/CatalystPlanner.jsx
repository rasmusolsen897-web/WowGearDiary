import { useStorage } from '../hooks/index.js';

const TIER_SLOTS = ['Head', 'Shoulder', 'Chest', 'Hands', 'Legs'];

function bestTierDps(slot, raidSim) {
  const tierEntries = raidSim.filter((s) => s.slot === slot && s.tier === true);
  if (tierEntries.length === 0) return null;
  return Math.max(...tierEntries.map((s) => s.dps));
}

function buildRanking(gear, raidSim) {
  return TIER_SLOTS.map((slotName) => {
    const gearItem = gear.find((g) => g.slot === slotName) || null;
    const hasTier = gearItem ? gearItem.hasTier : false;
    const dps = hasTier ? null : bestTierDps(slotName, raidSim);
    return {
      slot: slotName,
      item: gearItem ? gearItem.item : '—',
      ilvl: gearItem ? gearItem.ilvl : null,
      hasTier,
      dps,
    };
  }).sort((a, b) => {
    if (a.hasTier && !b.hasTier) return 1;
    if (!a.hasTier && b.hasTier) return -1;
    if (a.dps === null && b.dps === null) return 0;
    if (a.dps === null) return 1;
    if (b.dps === null) return -1;
    return b.dps - a.dps;
  });
}

function milestoneBadge(currentTierCount) {
  const next = currentTierCount + 1;
  if (next >= 4) return 'Reaches 4pc bonus!';
  if (next >= 2) return 'Reaches 2pc bonus!';
  return null;
}

export default function CatalystPlanner({ gear, raidSim, character }) {
  const [catalyzed, setCatalyzed] = useStorage('catalyzed', []);

  const currentTierCount = gear.filter((g) => g.hasTier).length;
  const charges = character.catalystCharges;
  const ranked = buildRanking(gear, raidSim);
  const recommendation = ranked.find((r) => !r.hasTier && r.dps !== null) || null;
  const allTierComplete = TIER_SLOTS.every((s) => {
    const g = gear.find((item) => item.slot === s);
    return g && g.hasTier;
  });

  function toggleCatalyzed(slot) {
    setCatalyzed((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(slot) ? arr.filter((s) => s !== slot) : [...arr, slot];
    });
  }

  const catalyzedArr = Array.isArray(catalyzed) ? catalyzed : [];

  return (
    <div>
      {/* Charges */}
      <div style={{ marginBottom: '20px' }}>
        <div className="section-title">Catalyst Planner</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--legendary-orange)' }}>
            Catalyst Charges
          </span>
          <div className="catalyst-charges">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={i < charges ? 'charge-pip' : 'charge-pip empty'} />
            ))}
          </div>
          <span style={{ color: 'var(--legendary-orange)', fontSize: '13px', fontWeight: 700 }}>
            {charges} / 8
          </span>
        </div>
      </div>

      {/* Primary Recommendation */}
      <div style={{ marginBottom: '20px' }}>
        {charges === 0 ? (
          <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            No charges remaining
          </div>
        ) : allTierComplete ? (
          <div className="card" style={{ border: '2px solid var(--epic-purple)', boxShadow: '0 0 16px rgba(163,53,238,0.3)', textAlign: 'center', padding: '20px' }}>
            <span style={{ color: 'var(--epic-purple)', fontWeight: 700, fontSize: '15px' }}>All tier slots complete ✦</span>
          </div>
        ) : recommendation ? (
          <div className="card" style={{ border: '2px solid var(--epic-purple)', boxShadow: '0 0 16px rgba(163,53,238,0.3)', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '6px' }}>
              Catalyst next:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '22px', fontWeight: 700, color: 'var(--frost-blue)', letterSpacing: '0.04em' }}>
                {recommendation.slot}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{recommendation.item}</span>
              <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '15px' }}>
                +{recommendation.dps.toFixed(1)}% DPS
              </span>
              {milestoneBadge(currentTierCount) && (
                <span className="badge badge-tier" style={{ fontSize: '12px', padding: '3px 9px' }}>
                  {milestoneBadge(currentTierCount)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            No tier sim data available for remaining slots
          </div>
        )}
      </div>

      {/* Ranked List + Catalyst Log */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
          All Tier Slots — Ranked
        </div>
        <table className="sim-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Current Item</th>
              <th>DPS Gain</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Catalyzed</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry) => {
              const isCatalyzed = catalyzedArr.includes(entry.slot);
              return (
                <tr key={entry.slot} style={isCatalyzed ? { opacity: 0.65 } : undefined}>
                  <td>
                    <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: entry.hasTier ? 'var(--epic-purple)' : 'var(--frost-blue)' }}>
                      {entry.slot}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text)', fontSize: '13px' }}>
                    {entry.item}
                    {entry.ilvl !== null && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>({entry.ilvl})</span>
                    )}
                  </td>
                  <td>
                    {entry.hasTier ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                    ) : entry.dps !== null ? (
                      <span style={{ color: entry.dps >= 2 ? 'var(--success)' : entry.dps >= 1 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700, fontSize: '13px' }}>
                        +{entry.dps.toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No tier sim</span>
                    )}
                  </td>
                  <td>
                    {entry.hasTier ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ color: 'var(--epic-purple)' }}>✦</span>
                        <span className="badge badge-tier">Has Tier</span>
                      </span>
                    ) : isCatalyzed ? (
                      <span className="badge badge-catalyst">CAT</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isCatalyzed}
                      onChange={() => toggleCatalyzed(entry.slot)}
                      disabled={entry.hasTier}
                      style={{ accentColor: 'var(--legendary-orange)', width: '15px', height: '15px', cursor: entry.hasTier ? 'not-allowed' : 'pointer', opacity: entry.hasTier ? 0.35 : 1 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Raidbots Link */}
      <div style={{ paddingTop: '4px' }}>
        <a
          href="https://www.raidbots.com/simbot/quick?region=eu&realm=tarren-mill&name=Whooplol"
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{ borderColor: 'var(--frost-blue)', color: 'var(--frost-blue)', textDecoration: 'none' }}
        >
          Open in Raidbots →
        </a>
      </div>
    </div>
  );
}
