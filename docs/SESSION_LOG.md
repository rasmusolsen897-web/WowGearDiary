# Session Log

---

## Session: 2026-04-02 — Supabase Migration + Progression History

### Scope
Full Supabase backend integration: migrate character storage from KV JSON blob to Postgres, add iLvl history snapshots, wire report URLs to sync across devices, and build SVG progression charts.

### Tasks Completed
- **`api/_supabase.js`** — shared server-side Supabase client
- **`api/characters.js`** — GET/POST/DELETE characters from Supabase `characters` table; `null` return when empty triggers KV fallback + Supabase seeding in App.jsx
- **`api/snapshots.js`** — GET iLvl+sim history; POST ilvl (no auth) and sim (write token) snapshots
- **`api/blizzard.js`** — fire-and-forget iLvl snapshot write after every Blizzard character fetch
- **`src/App.jsx`** — parallel fetch of KV metadata + Supabase characters on mount; Supabase is source of truth; auto-seeds from KV on first deploy; `setGuild` now syncs to both KV and Supabase
- **`src/components/CharacterView.jsx`** — `RaidbotsSection` and `DroptimizerSection` now prefer `member.reportUrl`/`member.droptimizerUrl` (Supabase) over localStorage; call `onUpdateMember` on save to sync back; added `<ProgressionCharts>`
- **`src/components/ProgressionCharts.jsx`** — new component: SVG sparkline charts for iLvl over time and sim DPS over time, collapsible, no external chart library
- **`src/index.css`** — added chart styles (`.wcl-section`, `.chart-block`, `.chart-x-labels`, `.wcl-expand-btn`, etc.)
- **`CLAUDE.md`** — updated: Supabase added to stack, new files in structure, new env vars, updated sync flow docs
- **`PROJECT_STATUS.md`** — created (architecture snapshot, decisions, known debt)
- Both builds pass (`npm run build` + `npm run build:vercel`)
- Pushed to `origin/master` and redeployed to Vercel

### Tasks Remaining
- **Sim DPS snapshots from client** — endpoint exists, client wiring missing. In `RaidbotsSection`, add a `useEffect` on `[dps, reportUrl]` that posts `{ character_name, dps, report_url, report_type: 'raidbots', spec }` to `/api/snapshots?type=sim` when a new URL is saved and DPS loads. Needs `writeToken` passed from App → CharacterView → RaidbotsSection.
- **Last-fetched timestamps** — show "fetched N min ago" on MemberCard and CharacterView hero
- **Refresh button** — force-bust Blizzard + WCL cache per character
- **WCL reset-day cache bust** — auto-invalidate WCL localStorage on EU Tuesday 09:00 UTC
- **Discord webhook** — weekly raid summary to guild channel
- **Attendance tracking** — log raid attendance per member over time

### Blockers / Open Questions
- None blocking. Supabase is live and env vars are set in Vercel.
- User confirmed Supabase project URL and secret API key added to Vercel → redeployed.
- First iLvl snapshot row should appear in Supabase `ilvl_snapshots` on next character view load.

### Recommended Next Steps

**First task for next session:** Wire up sim DPS snapshots from the client.

In `src/components/CharacterView.jsx` → `RaidbotsSection`:
1. Pass `writeToken` from `App.jsx` → `CharacterView` → `RaidbotsSection`
2. Add a `pendingSnapshot` ref, set to `true` in `save()`
3. Add `useEffect` on `[dps]`: if `pendingSnapshot.current && dps > 0 && writeToken`, POST to `/api/snapshots?type=sim` with `{ character_name: member.name, dps, report_url: reportUrl, report_type: 'raidbots', spec: reportSpec }` and clear the ref

After that: tackle **last-fetched timestamps** — store `fetchedAt` alongside Blizzard/WCL cache entries and surface it in the UI.
