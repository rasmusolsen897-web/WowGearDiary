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
    <header className="guild-header">
      <div className="guild-header__inner app-shell">
        <div className="guild-header__identity">
          <p className="guild-header__kicker">Guild Dashboard</p>
          <h1 className="guild-header__title">{title}</h1>
          {sub && <p className="guild-header__subtitle">{sub}</p>}
        </div>

        <div className="guild-header__summary">
          <div className="guild-header__stat">
            <span className="guild-header__stat-value">{stats.mains}</span>
            <span className="guild-header__stat-label">Mains</span>
          </div>
          <div className="guild-header__stat">
            <span className="guild-header__stat-value">{stats.tanks + stats.healers}</span>
            <span className="guild-header__stat-label">Core Roles</span>
          </div>
          <div className="guild-header__stat">
            <span className="guild-header__stat-value">{stats.alts}</span>
            <span className="guild-header__stat-label">Alts</span>
          </div>
          <button type="button" className="guild-header__settings" onClick={onSettingsClick}>
            Settings
          </button>
        </div>
      </div>
    </header>
  )
}
