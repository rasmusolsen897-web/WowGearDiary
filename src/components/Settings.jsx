import { useState, useEffect } from 'react'

/**
 * Settings — slide-in drawer with 3 tabs: Guild, Characters, API.
 *
 * Props:
 *   open          boolean  — controls visibility
 *   onClose       fn       — called when user clicks outside or X
 *   guild         object   — { name, region, realm, members[] }
 *   onGuildChange fn       — called with updated guild object
 */

const CLASS_OPTIONS = [
  'Death Knight', 'Demon Hunter', 'Druid', 'Evoker', 'Hunter',
  'Mage', 'Monk', 'Paladin', 'Priest', 'Rogue', 'Shaman',
  'Warlock', 'Warrior',
]

const ROLE_OPTIONS = ['dps', 'healer', 'tank']

// ── API Status Row ────────────────────────────────────────────────────────────

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
      if (res.status === 404) { setStatus('error'); setDetail('API not deployed (standalone mode)'); return }
      if (res.status === 503) { setStatus('error'); setDetail('Env vars not set in Vercel'); return }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setStatus('error'); setDetail(j.error ?? `HTTP ${res.status}`); return
      }
      setStatus('ok')
    } catch (e) {
      setStatus('error'); setDetail(e.message)
    }
  }

  const dot   = status === 'ok' ? '●' : status === 'error' ? '●' : '○'
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

// ── CharacterRow (collapsed / expanded) ─────────────────────────────────────

function CharacterRow({ member, mainNames, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false)

  const CLASS_COLORS = {
    'Death Knight': '#c41e3a', 'Demon Hunter': '#a330c9', 'Druid': '#ff7d0a',
    'Evoker': '#33937f', 'Hunter': '#abd473', 'Mage': '#69ccff', 'Monk': '#00ff96',
    'Paladin': '#f58cba', 'Priest': '#ffffff', 'Rogue': '#fff569', 'Shaman': '#0070de',
    'Warlock': '#9482c9', 'Warrior': '#c79c6e',
  }
  const nameColor = CLASS_COLORS[member.class] ?? 'var(--frost-blue)'

  return (
    <div style={{ marginBottom: '0.4rem' }}>
      {/* Collapsed row */}
      {!expanded && (
        <div className="char-row" style={{ borderLeftColor: nameColor }}>
          <span style={{ fontWeight: 700, color: nameColor, minWidth: 80, fontSize: '0.9rem' }}>{member.name || '—'}</span>
          {member.realName && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({member.realName})</span>}
          {!member.isMain && (
            <span style={{ fontSize: '0.68rem', color: 'var(--frost-blue)', border: '1px solid rgba(105,204,255,0.4)', borderRadius: '10px', padding: '1px 6px', whiteSpace: 'nowrap' }}>alt</span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flex: 1 }}>
            {[member.spec, member.class].filter(Boolean).join(' ') || 'No class set'} · {member.role}
          </span>
          <button
            onClick={() => setExpanded(true)}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}
          >Edit</button>
        </div>
      )}

      {/* Expanded row */}
      {expanded && (
        <div style={{ background: '#0d0d1a', borderRadius: '6px', padding: '0.75rem', border: '1px solid var(--border-bright)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <input
              value={member.name}
              onChange={(e) => onChange({ ...member, name: e.target.value })}
              placeholder="Character name"
              style={{ ...inputStyle, flex: 2, minWidth: 120 }}
            />
            <input
              value={member.realName ?? ''}
              onChange={(e) => onChange({ ...member, realName: e.target.value })}
              placeholder="Real name"
              style={{ ...inputStyle, flex: 2, minWidth: 100 }}
            />
            <input
              value={member.realm ?? ''}
              onChange={(e) => onChange({ ...member, realm: e.target.value })}
              placeholder="Realm (blank = guild default)"
              style={{ ...inputStyle, flex: 3, minWidth: 140 }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={member.class}
              onChange={(e) => onChange({ ...member, class: e.target.value })}
              style={{ ...inputStyle, width: 'auto', flex: 'none' }}
            >
              <option value="">— class —</option>
              {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={member.role}
              onChange={(e) => onChange({ ...member, role: e.target.value })}
              style={{ ...inputStyle, width: 'auto', flex: 'none' }}
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={member.isMain !== false}
                onChange={(e) => onChange({ ...member, isMain: e.target.checked })}
              />
              main
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>alt of:</span>
              <select
                value={member.altOf ?? ''}
                onChange={(e) => onChange({ ...member, altOf: e.target.value || null })}
                style={{ ...inputStyle, width: 'auto', flex: 'none' }}
              >
                <option value="">— none —</option>
                {mainNames.filter(n => n.toLowerCase() !== member.name.toLowerCase()).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
              <button onClick={() => setExpanded(false)} style={{ ...actionBtn, borderColor: 'var(--success)', color: 'var(--success)' }}>Done</button>
              <button onClick={onRemove} style={{ ...actionBtn, borderColor: '#ff4444', color: '#ff4444' }}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Character Form ────────────────────────────────────────────────────────

function AddCharForm({ mainNames, onAdd, onCancel }) {
  const [draft, setDraft] = useState({ name: '', realName: '', realm: '', class: '', role: 'dps', isMain: true, altOf: null, spec: '' })
  const [error, setError] = useState('')

  const submit = () => {
    if (!draft.name.trim()) { setError('Character name is required.'); return }
    onAdd({ ...draft, name: draft.name.trim() })
  }

  return (
    <div className="add-char-form">
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--frost-blue)', marginBottom: 4 }}>New Character</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => { setDraft(d => ({ ...d, name: e.target.value })); setError('') }}
          placeholder="Character name *"
          style={{ ...inputStyle, flex: 2, minWidth: 120 }}
        />
        <input
          value={draft.realName}
          onChange={(e) => setDraft(d => ({ ...d, realName: e.target.value }))}
          placeholder="Real name"
          style={{ ...inputStyle, flex: 2, minWidth: 100 }}
        />
        <input
          value={draft.realm}
          onChange={(e) => setDraft(d => ({ ...d, realm: e.target.value }))}
          placeholder="Realm (blank = guild default)"
          style={{ ...inputStyle, flex: 3, minWidth: 140 }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={draft.class} onChange={(e) => setDraft(d => ({ ...d, class: e.target.value }))} style={{ ...inputStyle, width: 'auto', flex: 'none' }}>
          <option value="">— class —</option>
          {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={draft.role} onChange={(e) => setDraft(d => ({ ...d, role: e.target.value }))} style={{ ...inputStyle, width: 'auto', flex: 'none' }}>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={draft.isMain} onChange={(e) => setDraft(d => ({ ...d, isMain: e.target.checked }))} />
          main
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>alt of:</span>
          <select value={draft.altOf ?? ''} onChange={(e) => setDraft(d => ({ ...d, altOf: e.target.value || null }))} style={{ ...inputStyle, width: 'auto', flex: 'none' }}>
            <option value="">— none —</option>
            {mainNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      {error && <span style={{ fontSize: '0.78rem', color: '#ff4444' }}>{error}</span>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={submit} style={{ ...actionBtn, borderColor: 'var(--frost-blue)', color: 'var(--frost-blue)', flex: 1 }}>Add Character</button>
        <button onClick={onCancel} style={{ ...actionBtn, borderColor: '#555', color: '#888' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main Settings Component ───────────────────────────────────────────────────

export default function Settings({ open, onClose, guild, onGuildChange, writeToken, onWriteTokenChange, syncError, syncStatus }) {
  const [localGuild, setLocalGuild]   = useState(guild)
  const [activeTab, setActiveTab]     = useState('guild')
  const [showAddForm, setShowAddForm] = useState(false)
  const [tokenDraft, setTokenDraft]   = useState('')
  const [unlockState, setUnlockState] = useState('idle') // 'idle' | 'checking' | 'ok' | 'wrong'

  useEffect(() => { setLocalGuild(guild) }, [guild])

  if (!open) return null

  const save = () => { onGuildChange(localGuild); onClose() }

  const handleUnlock = async () => {
    if (!tokenDraft.trim()) return
    setUnlockState('checking')
    try {
      const res = await fetch('/api/guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Write-Token': tokenDraft.trim() },
        body: JSON.stringify(localGuild),
      })
      if (res.ok) {
        onWriteTokenChange(tokenDraft.trim())
        setTokenDraft('')
        setUnlockState('ok')
      } else {
        setUnlockState('wrong')
      }
    } catch {
      setUnlockState('wrong')
    }
  }

  const handleLock = () => {
    onWriteTokenChange('')
    setUnlockState('idle')
    setTokenDraft('')
  }

  const updateMember = (i, updated) => {
    setLocalGuild(g => { const members = [...g.members]; members[i] = updated; return { ...g, members } })
  }

  const removeMember = (i) => {
    const updated = { ...localGuild, members: localGuild.members.filter((_, j) => j !== i) }
    setLocalGuild(updated)
    onGuildChange(updated)   // persist immediately
  }

  const addMember = (newMember) => {
    const updated = { ...localGuild, members: [...localGuild.members, newMember] }
    setLocalGuild(updated)
    onGuildChange(updated)   // persist immediately — don't wait for Save button
    setShowAddForm(false)
  }

  // All mains (for the altOf dropdown)
  const mainNames = localGuild.members.filter(m => m.isMain !== false).map(m => m.name).filter(Boolean)

  // Sort: mains first, then alts grouped under their main
  const sortedMembers = () => {
    const mains = localGuild.members.filter(m => m.isMain !== false)
    const alts  = localGuild.members.filter(m => m.isMain === false)
    const result = []
    mains.forEach((main, mainIdx) => {
      const originalIdx = localGuild.members.indexOf(main)
      result.push({ member: main, idx: originalIdx, isAlt: false })
      alts.filter(a => a.altOf?.toLowerCase() === main.name.toLowerCase()).forEach(alt => {
        result.push({ member: alt, idx: localGuild.members.indexOf(alt), isAlt: true })
      })
    })
    // Alts with no matching main
    alts.filter(a => !mainNames.some(n => n.toLowerCase() === (a.altOf ?? '').toLowerCase())).forEach(alt => {
      result.push({ member: alt, idx: localGuild.members.indexOf(alt), isAlt: false })
    })
    return result
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998 }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px', maxWidth: '95vw',
        background: 'var(--card)', borderLeft: '1px solid #333', zIndex: 999,
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', borderBottom: '1px solid #333',
          position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--frost-blue)' }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#e0e0e0', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #333', position: 'sticky', top: '53px', background: 'var(--card)', zIndex: 1 }}>
          {[['guild', 'Guild'], ['characters', 'Characters'], ['api', 'API']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`tab${activeTab === key ? ' active' : ''}`}
              style={{ fontSize: '0.82rem', padding: '0.6rem 1.1rem' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '1.25rem', flex: 1 }}>

          {/* ── Guild Tab ── */}
          {activeTab === 'guild' && (
            <section>
              {/* ── Cloud Sync banner — top of tab ── */}
              {writeToken ? (
                <div className={`settings-banner settings-banner--${syncStatus === 'error' ? 'error' : 'unlocked'}`}>
                  <span>🔓</span>
                  <span style={{ fontWeight: 600 }}>
                    {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? `Sync error — ${syncError}` : 'Editing enabled — changes sync to all members'}
                  </span>
                  <button onClick={handleLock} style={{ ...actionBtn, marginLeft: 'auto', borderColor: '#555', color: '#aaa', fontSize: '0.75rem' }}>
                    Lock
                  </button>
                </div>
              ) : (
                <div className="settings-banner settings-banner--locked">
                  <span>🔒</span>
                  <span style={{ flex: 1 }}>Read-only</span>
                  <input
                    type="password"
                    value={tokenDraft}
                    onChange={(e) => { setTokenDraft(e.target.value); setUnlockState('idle') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    placeholder="Guild password"
                    style={{ ...inputStyle, flex: 2, minWidth: 0 }}
                  />
                  <button
                    onClick={handleUnlock}
                    disabled={unlockState === 'checking' || !tokenDraft.trim()}
                    style={{ ...actionBtn, borderColor: 'var(--frost-blue)', color: 'var(--frost-blue)', whiteSpace: 'nowrap', opacity: (!tokenDraft.trim() || unlockState === 'checking') ? 0.5 : 1 }}
                  >
                    {unlockState === 'checking' ? '…' : 'Unlock'}
                  </button>
                  {unlockState === 'wrong' && (
                    <span style={{ fontSize: '0.78rem', color: '#ff4444', whiteSpace: 'nowrap' }}>✗ Wrong password</span>
                  )}
                </div>
              )}

              {/* ── Identity ── */}
              <h3 style={sectionTitleStyle}>Identity</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  value={localGuild.name}
                  onChange={(e) => setLocalGuild(g => ({ ...g, name: e.target.value }))}
                  placeholder="Guild name (optional)"
                  style={{ ...inputStyle, flex: 2 }}
                />
                <select
                  value={localGuild.region}
                  onChange={(e) => setLocalGuild(g => ({ ...g, region: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto', flex: 'none' }}
                >
                  {['eu', 'us', 'kr', 'tw'].map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                </select>
                <input
                  value={localGuild.realm}
                  onChange={(e) => setLocalGuild(g => ({ ...g, realm: e.target.value }))}
                  placeholder="Default realm (e.g. tarren-mill)"
                  style={{ ...inputStyle, flex: 3 }}
                />
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Individual characters can override the default realm in the Characters tab.
              </p>
            </section>
          )}

          {/* ── Characters Tab ── */}
          {activeTab === 'characters' && (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Characters ({localGuild.members.length})</h3>
                {!showAddForm && (
                  <button onClick={() => setShowAddForm(true)} style={addBtnStyle}>+ Add Character</button>
                )}
              </div>

              {showAddForm && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <AddCharForm mainNames={mainNames} onAdd={addMember} onCancel={() => setShowAddForm(false)} />
                </div>
              )}

              {sortedMembers().map(({ member, idx, isAlt }) => (
                <div key={idx} className={isAlt ? 'member-row-alt' : undefined}>
                  <CharacterRow
                    member={member}
                    mainNames={mainNames}
                    onChange={(updated) => updateMember(idx, updated)}
                    onRemove={() => removeMember(idx)}
                  />
                </div>
              ))}
            </section>
          )}

          {/* ── API Tab ── */}
          {activeTab === 'api' && (
            <section>
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
                label="Guild Sync — KV read"
                endpoint="/api/guild"
              />
            </section>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.25rem', borderTop: '1px solid #333',
          display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
          position: 'sticky', bottom: 0, background: 'var(--card)',
        }}>
          <button onClick={onClose} style={{ ...addBtnStyle, background: 'transparent', border: '1px solid #555', color: '#aaa', width: 'auto' }}>Cancel</button>
          <button onClick={save} style={{ ...addBtnStyle, background: 'var(--frost-blue)', color: '#000', fontWeight: 700, border: 'none', width: 'auto' }}>Save</button>
        </div>
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0',
  borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem',
  flex: 1, minWidth: '100px',
}

const actionBtn = {
  background: 'transparent', border: '1px solid var(--frost-blue)',
  borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer',
}

const sectionTitleStyle = {
  fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: '0.75rem', marginTop: 0,
}

const addBtnStyle = {
  background: '#1a1a2e', border: '1px solid var(--frost-blue)', color: 'var(--frost-blue)',
  borderRadius: '5px', padding: '0.35rem 0.9rem', fontSize: '0.82rem', cursor: 'pointer',
}
