import { useState, useEffect } from 'react'

/**
 * Settings — slide-in drawer for guild member management and API status.
 *
 * Props:
 *   open       boolean  — controls visibility
 *   onClose    fn       — called when user clicks outside or X
 *   guild      object   — { name, region, realm, members[] } from data.json
 *   onGuildChange fn    — called with updated guild object
 */

const CLASS_OPTIONS = [
  'Death Knight', 'Demon Hunter', 'Druid', 'Evoker', 'Hunter',
  'Mage', 'Monk', 'Paladin', 'Priest', 'Rogue', 'Shaman',
  'Warlock', 'Warrior',
]

const ROLE_OPTIONS = ['dps', 'healer', 'tank']

function ApiStatusRow({ label, endpoint, method = 'GET', body }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'checking' | 'ok' | 'error'
  const [detail, setDetail] = useState('')

  const check = async () => {
    setStatus('checking')
    setDetail('')
    try {
      const opts = method === 'POST'
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}
      const res = await fetch(endpoint, opts)
      if (res.status === 404) {
        setStatus('error')
        setDetail('API not deployed (standalone mode)')
        return
      }
      if (res.status === 503) {
        setStatus('error')
        setDetail('Env vars not set in Vercel')
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setStatus('error')
        setDetail(j.error ?? `HTTP ${res.status}`)
        return
      }
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setDetail(e.message)
    }
  }

  const dot = status === 'ok' ? '●' : status === 'error' ? '●' : '○'
  const color = status === 'ok' ? 'var(--success)' : status === 'error' ? '#ff4444' : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid #ffffff0d' }}>
      <span style={{ color, fontSize: '1rem', lineHeight: 1 }}>{dot}</span>
      <span style={{ flex: 1, fontSize: '0.85rem' }}>{label}</span>
      {detail && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 2 }}>{detail}</span>}
      <button
        onClick={check}
        disabled={status === 'checking'}
        style={{
          background: 'transparent', border: '1px solid var(--frost-blue)',
          color: 'var(--frost-blue)', borderRadius: '4px', padding: '0.2rem 0.6rem',
          fontSize: '0.75rem', cursor: status === 'checking' ? 'not-allowed' : 'pointer',
          opacity: status === 'checking' ? 0.5 : 1,
        }}
      >
        {status === 'checking' ? '…' : 'Test'}
      </button>
    </div>
  )
}

function MemberRow({ member, onChange, onRemove }) {
  return (
    <div style={{
      background: '#0d0d1a', borderRadius: '6px', padding: '0.75rem',
      marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
    }}>
      <input
        value={member.name}
        onChange={(e) => onChange({ ...member, name: e.target.value })}
        placeholder="Character name"
        style={inputStyle}
      />
      <select
        value={member.class}
        onChange={(e) => onChange({ ...member, class: e.target.value })}
        style={{ ...inputStyle, width: 'auto' }}
      >
        <option value="">— class —</option>
        {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={member.role}
        onChange={(e) => onChange({ ...member, role: e.target.value })}
        style={{ ...inputStyle, width: 'auto' }}
      >
        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <input
          type="checkbox"
          checked={member.isMain}
          onChange={(e) => onChange({ ...member, isMain: e.target.checked })}
        />
        main
      </label>
      <button onClick={onRemove} style={removeBtnStyle} title="Remove">✕</button>
    </div>
  )
}

const inputStyle = {
  background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0',
  borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem',
  flex: 1, minWidth: '120px',
}

const removeBtnStyle = {
  background: 'transparent', border: 'none', color: '#ff4444',
  cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.4rem',
  borderRadius: '4px',
}

export default function Settings({ open, onClose, guild, onGuildChange }) {
  const [localGuild, setLocalGuild] = useState(guild)

  // Sync when guild prop changes
  useEffect(() => { setLocalGuild(guild) }, [guild])

  if (!open) return null

  const save = () => {
    onGuildChange(localGuild)
    onClose()
  }

  const addMember = () => {
    setLocalGuild((g) => ({
      ...g,
      members: [
        ...g.members,
        { name: '', class: '', role: 'dps', isMain: true, alts: [], simc: null, notes: '' },
      ],
    }))
  }

  const updateMember = (i, updated) => {
    setLocalGuild((g) => {
      const members = [...g.members]
      members[i] = updated
      return { ...g, members }
    })
  }

  const removeMember = (i) => {
    setLocalGuild((g) => ({ ...g, members: g.members.filter((_, j) => j !== i) }))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', maxWidth: '95vw',
        background: 'var(--card)', borderLeft: '1px solid #333', zIndex: 999,
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', borderBottom: '1px solid #333', position: 'sticky', top: 0,
          background: 'var(--card)', zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--frost-blue)' }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#e0e0e0', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem', flex: 1 }}>

          {/* Guild Info */}
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Guild</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <input
                value={localGuild.name}
                onChange={(e) => setLocalGuild((g) => ({ ...g, name: e.target.value }))}
                placeholder="Guild name (optional)"
                style={{ ...inputStyle, flex: 2 }}
              />
              <select
                value={localGuild.region}
                onChange={(e) => setLocalGuild((g) => ({ ...g, region: e.target.value }))}
                style={{ ...inputStyle, width: 'auto', flex: 0 }}
              >
                {['eu', 'us', 'kr', 'tw'].map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
              </select>
              <input
                value={localGuild.realm}
                onChange={(e) => setLocalGuild((g) => ({ ...g, realm: e.target.value }))}
                placeholder="Realm (e.g. tarren-mill)"
                style={{ ...inputStyle, flex: 3 }}
              />
            </div>
          </section>

          {/* Members */}
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Members ({localGuild.members.length})</h3>
            {localGuild.members.map((m, i) => (
              <MemberRow
                key={i}
                member={m}
                onChange={(updated) => updateMember(i, updated)}
                onRemove={() => removeMember(i)}
              />
            ))}
            <button onClick={addMember} style={addBtnStyle}>+ Add member</button>
          </section>

          {/* API Status */}
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>API Status</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Secrets live in Vercel → Project Settings → Environment Variables. Never stored in the browser.
            </p>
            <ApiStatusRow
              label="Blizzard — character"
              endpoint={`/api/blizzard?action=character&region=${localGuild.region}&realm=${encodeURIComponent(localGuild.realm)}&name=${encodeURIComponent(localGuild.members[0]?.name ?? 'whooplol')}`}
            />
            <ApiStatusRow
              label="Warcraft Logs — GraphQL"
              endpoint="/api/wcl"
              method="POST"
              body={{ query: '{ worldData { zone(id: 41) { id name } } }' }}
            />
            <ApiStatusRow
              label="Raidbots — session"
              endpoint="/api/raidbots?jobId=test-ping"
            />
          </section>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.25rem', borderTop: '1px solid #333',
          display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
          position: 'sticky', bottom: 0, background: 'var(--card)',
        }}>
          <button onClick={onClose} style={{ ...addBtnStyle, background: 'transparent', border: '1px solid #555', color: '#aaa' }}>
            Cancel
          </button>
          <button onClick={save} style={{ ...addBtnStyle, background: 'var(--frost-blue)', color: '#000', fontWeight: 700, border: 'none' }}>
            Save
          </button>
        </div>
      </div>
    </>
  )
}

const sectionStyle = { marginBottom: '1.75rem' }

const sectionTitleStyle = {
  fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: '0.75rem', marginTop: 0,
}

const addBtnStyle = {
  background: '#1a1a2e', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: '5px', padding: '0.4rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer', width: '100%',
}
