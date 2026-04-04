function formatRealmLabel(realm) {
  if (!realm) return ''
  return realm
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function summarizeRoster(members = []) {
  const mains = members.filter((member) => member.isMain !== false)
  const alts = members.length - mains.length
  const tanks = mains.filter((member) => member.role === 'tank').length
  const healers = mains.filter((member) => member.role === 'healer').length
  const dps = mains.filter((member) => member.role === 'dps').length

  return { mains: mains.length, alts, tanks, healers, dps }
}

export default function GuildHeader({ guild, onSettingsClick }) {
  const title = guild?.name?.trim() || 'Guild Dashboard'
  const realm = formatRealmLabel(guild?.realm)
  const region = guild?.region?.toUpperCase()
  const sub = [realm, region].filter(Boolean).join(' · ')
  const stats = summarizeRoster(guild?.members ?? [])

  return (
    <header className="guild-hero">
      <div className="guild-hero__inner app-container">
        <div className="guild-hero__copy">
          <div className="guild-hero__eyebrow">Wow Diary</div>
          <h1 className="guild-hero__title font-display">{title}</h1>
          {sub && <p className="guild-hero__subtitle">{sub}</p>}

          <div className="guild-hero__stats">
            <div className="guild-hero__stat">
              <span className="guild-hero__stat-value">{stats.mains}</span>
              <span className="guild-hero__stat-label">Mains</span>
            </div>
            <div className="guild-hero__stat">
              <span className="guild-hero__stat-value">{stats.healers + stats.tanks}</span>
              <span className="guild-hero__stat-label">Core Roles</span>
            </div>
            <div className="guild-hero__stat">
              <span className="guild-hero__stat-value">{stats.alts}</span>
              <span className="guild-hero__stat-label">Alts</span>
            </div>
          </div>
        </div>

        <div className="guild-hero__panel">
          <div className="guild-hero__panel-grid">
            <div className="guild-hero__panel-item">
              <span className="guild-hero__panel-kicker">Roster Shape</span>
              <strong>{stats.tanks} tank · {stats.healers} healer · {stats.dps} dps</strong>
            </div>
            <div className="guild-hero__panel-item guild-hero__panel-item--muted">
              <span className="guild-hero__panel-kicker">Next Phase</span>
              <strong>Weekly heroic progress and WCL widgets</strong>
            </div>
          </div>

          <button
            onClick={onSettingsClick}
            title="Settings"
            className="guild-hero__settings"
          >
            Settings
          </button>
        </div>
      </div>
    </header>
  )
}
