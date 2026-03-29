export default function CharacterHeader({ character }) {
  const charges = character.catalystCharges
  const maxCharges = 8

  return (
    <header style={{
      background: 'linear-gradient(135deg, #111128 0%, #1a1a35 60%, #0d1520 100%)',
      borderBottom: '1px solid var(--border)',
      padding: '24px 0 20px',
      marginBottom: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
        {/* Avatar placeholder */}
        <div style={{
          width: 72, height: 72, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, #1a2a40, #0d1520)',
          border: '2px solid var(--frost-blue)',
          boxShadow: '0 0 16px rgba(105,204,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32,
        }}>
          🧊
        </div>

        {/* Name & class */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 className="font-display" style={{
              fontSize: 32, fontWeight: 700, color: 'var(--frost-blue)',
              textShadow: '0 0 20px rgba(105,204,255,0.4)',
              letterSpacing: '0.04em',
            }}>
              {character.name}
            </h1>
            <span className="badge" style={{
              background: 'rgba(105,204,255,0.12)',
              border: '1px solid rgba(105,204,255,0.4)',
              color: 'var(--frost-blue)',
              fontSize: 12,
            }}>
              {character.class}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
            <span>{character.race}</span>
            <span style={{ color: 'var(--border-bright)' }}>·</span>
            <span>{character.server}</span>
            <span style={{ color: 'var(--border-bright)' }}>·</span>
            <span>Lvl {character.level}</span>
            <span style={{ color: 'var(--border-bright)' }}>·</span>
            <span style={{ color: 'var(--text-muted)' }}>{character.patch}</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <StatBox label="Avg iLvl" value={character.avgIlvl} color="var(--frost-blue)" />

          {/* Catalyst charges */}
          <div style={{
            background: 'rgba(255,128,0,0.08)',
            border: '1px solid rgba(255,128,0,0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            minWidth: 130,
          }}>
            <div style={{ fontSize: 11, color: 'var(--legendary-orange)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Catalyst Charges
            </div>
            <div className="catalyst-charges">
              {Array.from({ length: maxCharges }).map((_, i) => (
                <div key={i} className={`charge-pip${i >= charges ? ' empty' : ''}`} title={i < charges ? 'Charge available' : 'Used'} />
              ))}
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--legendary-orange)', marginLeft: 4 }}>
                {charges}/{maxCharges}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 16px',
      textAlign: 'center',
      minWidth: 90,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Rajdhani, sans-serif', color }}>
        {value}
      </div>
    </div>
  )
}
