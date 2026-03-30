export default function GuildHeader({ guild, onSettingsClick }) {
  const title = guild?.name ? guild.name : 'Guild Dashboard'
  const sub   = guild?.realm && guild?.region
    ? `${guild.realm} · ${guild.region.toUpperCase()}`
    : null

  return (
    <header style={{
      background: 'linear-gradient(135deg, #111128 0%, #1a1a35 60%, #0d1520 100%)',
      borderBottom: '1px solid var(--border)',
      padding: '18px 0 16px',
      marginBottom: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-display" style={{
            fontSize: 28, fontWeight: 700, color: 'var(--frost-blue)',
            textShadow: '0 0 20px rgba(105,204,255,0.3)',
            letterSpacing: '0.04em', margin: 0,
          }}>
            {title}
          </h1>
          {sub && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
          )}
        </div>

        <button
          onClick={onSettingsClick}
          title="Settings"
          style={{
            background: 'transparent', border: '1px solid #444', color: 'var(--text-muted)',
            borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          ⚙ Settings
        </button>
      </div>
    </header>
  )
}
