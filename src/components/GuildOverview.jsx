import { useState } from 'react'
import { useBlizzardAPI, useCharacterParses, useRaidbotsAPI } from '../hooks/index.js'

/**
 * GuildOverview — member cards with live Blizzard gear data, WCL parse badges,
 * and a Raidbots quick-sim button.
 *
 * Props:
 *   guild  { name, region, realm, members[] }
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_COLORS = {
  'Death Knight':  '#c41e3a',
  'Demon Hunter':  '#a330c9',
  'Druid':         '#ff7d0a',
  'Evoker':        '#33937f',
  'Hunter':        '#abd473',
  'Mage':          '#69ccff',
  'Monk':          '#00ff96',
  'Paladin':       '#f58cba',
  'Priest':        '#ffffff',
  'Rogue':         '#fff569',
  'Shaman':        '#0070de',
  'Warlock':       '#9482c9',
  'Warrior':       '#c79c6e',
}

function ilvlColor(ilvl) {
  if (ilvl >= 272) return 'var(--legendary-orange)'
  if (ilvl >= 263) return 'var(--epic-purple)'
  if (ilvl >= 250) return 'var(--rare-blue)'
  if (ilvl >= 232) return 'var(--uncommon-green, #1eff00)'
  return 'var(--text-muted)'
}

function parseBadgeColor(pct) {
  if (pct >= 95) return '#e268a8'   // legendary
  if (pct >= 75) return '#ff8000'   // orange
  if (pct >= 50) return '#1eff00'   // green
  if (pct >= 25) return '#0070dd'   // blue
  return '#9d9d9d'                  // grey
}

function bestParseFromWCL(wclData) {
  if (!wclData) return null
  const rankings = wclData.rankingsMythic?.rankings
    ?? wclData.rankingsHeroic?.rankings
    ?? wclData.rankingsNormal?.rankings
    ?? []
  if (!rankings.length) return null
  const best = rankings.reduce((a, b) => (b.rankPercent > a.rankPercent ? b : a), rankings[0])
  return {
    pct:   Math.round(best.rankPercent ?? 0),
    spec:  best.spec ?? '',
    diff:  wclData.rankingsMythic?.rankings?.length ? 'M' : wclData.rankingsHeroic?.rankings?.length ? 'H' : 'N',
  }
}

// ── SimButton ────────────────────────────────────────────────────────────────

function SimButton({ member }) {
  const { submitSim, status, progress, resultUrl, loading, error, reset } = useRaidbotsAPI()

  if (resultUrl) {
    return (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <a
          href={resultUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '0.75rem', color: 'var(--frost-blue)', textDecoration: 'none', border: '1px solid var(--frost-blue)', borderRadius: '4px', padding: '0.2rem 0.5rem' }}
        >
          View sim ↗
        </a>
        <button onClick={reset} style={ghostBtn} title="Reset">✕</button>
      </div>
    )
  }

  if (loading) {
    const pct = Math.round(progress * 100)
    return (
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Simming… {pct > 0 ? `${pct}%` : status}
      </span>
    )
  }

  if (error) {
    const msg = error === 'API not available' ? 'API offline' : 'Sim failed'
    return <span style={{ fontSize: '0.75rem', color: '#ff4444' }}>{msg}</span>
  }

  if (!member.simc) {
    return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No SimC</span>
  }

  return (
    <button
      onClick={() => submitSim({ simc: member.simc, type: 'quick' })}
      style={{ ...ghostBtn, borderColor: '#a335ee', color: '#a335ee' }}
    >
      Sim
    </button>
  )
}

const ghostBtn = {
  background: 'transparent', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer',
}

// ── MemberCard ───────────────────────────────────────────────────────────────

function MemberCard({ member, region, realm }) {
  const { data, loading: gearLoading, error: gearError, refresh } = useBlizzardAPI(member.name, realm, region)
  const { data: wclData, loading: wclLoading } = useCharacterParses(member.name, realm, region)

  const classColor = CLASS_COLORS[member.class] ?? '#e0e0e0'
  const parse = bestParseFromWCL(wclData)

  const ilvl = data?.avgIlvl ?? null
  const tierCount = data?.gear?.filter((g) => g.quality === 'EPIC' && g.slot?.startsWith('Tier'))?.length ?? null

  return (
    <div style={{
      background: 'var(--card)', borderRadius: '8px', padding: '1rem',
      border: '1px solid #2a2a3e', display: 'flex', flexDirection: 'column', gap: '0.6rem',
      minWidth: '220px', flex: '1 1 220px',
    }}>
      {/* Name + class */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: classColor }}>{member.name}</span>
          {!member.isMain && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', border: '1px solid #444', borderRadius: '3px', padding: '0.1rem 0.4rem' }}>alt</span>
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{member.class} · {member.role}</div>
      </div>

      {/* iLvl */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        {gearLoading && !data && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading gear…</span>}
        {gearError && gearError !== 'API not available' && (
          <span style={{ color: '#ff4444', fontSize: '0.8rem' }}>{gearError}</span>
        )}
        {gearError === 'API not available' && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>API offline</span>
        )}
        {ilvl !== null && (
          <>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: ilvlColor(ilvl), lineHeight: 1 }}>{ilvl}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>avg iLvl</span>
          </>
        )}
        {!data && !gearLoading && !gearError && (
          <button onClick={refresh} style={{ ...ghostBtn, fontSize: '0.8rem' }}>Load data →</button>
        )}
      </div>

      {/* Spec (from live data if available) */}
      {data?.spec && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {data.spec} {data.class}
        </div>
      )}

      {/* WCL parse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {wclLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fetching parses…</span>}
        {parse && (
          <span style={{
            fontSize: '0.85rem', fontWeight: 700,
            color: parseBadgeColor(parse.pct),
            border: `1px solid ${parseBadgeColor(parse.pct)}`,
            borderRadius: '4px', padding: '0.1rem 0.5rem',
          }}>
            {parse.pct}% {parse.diff}
          </span>
        )}
        {!wclLoading && !parse && data && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No WCL data</span>
        )}
      </div>

      {/* Gear summary */}
      {data?.gear && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
          <span>{data.gear.length} slots</span>
          <span style={{ color: 'var(--epic-purple)' }}>
            {data.gear.filter((g) => g.quality === 'EPIC').length} epic
          </span>
        </div>
      )}

      {/* SimC / Raidbots */}
      <div style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #1a1a2e' }}>
        <SimButton member={member} />
      </div>
    </div>
  )
}

// ── GuildOverview ─────────────────────────────────────────────────────────────

export default function GuildOverview({ guild }) {
  const [showAlts, setShowAlts] = useState(false)

  if (!guild?.members?.length) {
    return (
      <section style={containerStyle}>
        <h2 style={headingStyle}>Guild Overview</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          No members configured. Open Settings to add guild members.
        </p>
      </section>
    )
  }

  const displayed = showAlts ? guild.members : guild.members.filter((m) => m.isMain !== false)

  return (
    <section style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ ...headingStyle, marginBottom: 0 }}>
          {guild.name ? `${guild.name} ` : ''}Guild Overview
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
            {guild.realm} · {guild.region.toUpperCase()}
          </span>
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAlts} onChange={(e) => setShowAlts(e.target.checked)} />
          Show alts
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {displayed.map((m) => (
          <MemberCard key={m.name} member={m} region={guild.region} realm={guild.realm} />
        ))}
      </div>
    </section>
  )
}

const containerStyle = {
  background: 'var(--card)', borderRadius: '10px', padding: '1.25rem',
  border: '1px solid #2a2a3e', marginBottom: '1.5rem',
}

const headingStyle = {
  fontSize: '1rem', fontWeight: 700, color: 'var(--frost-blue)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', marginTop: 0,
}
