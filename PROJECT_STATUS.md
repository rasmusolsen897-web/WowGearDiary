# WoW Gear Diary — Project Status
_Last updated: 2026-04-02_

---

## Architecture Overview

```
Browser
  └─ React SPA (Vite)
       ├─ GuildOverview   — member card grid, live API data, sort/filter
       └─ CharacterView   — per-member detail: gear, sims, WCL, Droptimizer, history

Vercel Serverless (api/)
  ├─ /api/blizzard        — Blizzard OAuth2 proxy → iLvl, spec, gear, avatar
  ├─ /api/wcl             — WCL GraphQL proxy → per-boss parse data
  ├─ /api/guild           — GET/POST guild metadata (name, realm, region) via KV
  ├─ /api/characters      — GET/POST/DELETE character rows via Supabase
  ├─ /api/snapshots       — GET/POST iLvl + sim DPS history via Supabase
  ├─ /api/raidbots        — Raidbots quick sim proxy
  └─ /api/raidbots-report — Droptimizer report parser (server-side, compact 16KB)

Storage
  ├─ Vercel KV (Upstash Redis)  — guild metadata only (name, realm, region)
  └─ Supabase Postgres          — characters table + ilvl_snapshots + sim_snapshots
```

**Data flow on mount:**
1. `App.jsx` fetches `/api/guild` (KV) and `/api/characters` (Supabase) in parallel
2. Supabase characters are used if present; KV members used as fallback + Supabase seeded
3. Any guild change → KV updated (metadata) + Supabase updated (characters)
4. Blizzard fetch → fire-and-forget iLvl snapshot written to `ilvl_snapshots`

---

## What's Been Built

### Core App
- `src/App.jsx` — guild state, cloud sync, member routing, Supabase + KV parallel load
- `src/components/GuildOverview.jsx` — member card grid, sort by iLvl/parse/DPS, role filter, avg parse badge
- `src/components/CharacterView.jsx` — full character detail view
- `src/components/GuildHeader.jsx` — top bar with guild name + settings cog
- `src/components/Settings.jsx` — Guild/Characters/API tabs, Cloud Sync unlock/lock with write token

### Character Detail Sections
- `RaidbotsSection` (in CharacterView) — quick sim DPS, report URL paste, syncs URL to Supabase
- `DroptimizerSection` (in CharacterView) — upgrade table, sortable, report URL synced to Supabase
- `WclSection` (in CharacterView) — avg parse badge + collapsible per-boss table
- `src/components/ProgressionCharts.jsx` — SVG sparkline charts for iLvl + sim DPS over time

### Whooplol-Only Panels (gated by `isMainChar`)
- `TierProgress`, `CatalystPlanner`, `GearSlots`, `SimTable`, `UpgradeCharts`
- `WeeklyTracker`, `RaidBossPriority`, `DungeonPriority`, `GamePlan`

### API Layer
| File | Purpose |
|---|---|
| `api/_supabase.js` | Shared Supabase client (service role, server-side only) |
| `api/characters.js` | Full CRUD for characters table; returns `null` when empty for KV fallback |
| `api/snapshots.js` | GET history + POST ilvl (no auth) / sim (write token) snapshots |
| `api/blizzard.js` | Blizzard proxy + fire-and-forget iLvl snapshot on character fetch |
| `api/guild.js` | KV guild metadata CRUD |
| `api/wcl.js` | WCL GraphQL proxy, auto-zone (no hardcoded zone ID) |

### Hooks
- `useBlizzardAPI` — character gear/spec/class/iLvl/avatar (15-min localStorage cache)
- `useWCLAPI` — parses, auto-zone, avgParseFromWCL helper (30-min cache)
- `useRaidbotsReport` — quick sim DPS from report URL (1-hour cache)
- `useDroptimizerReport` — upgrade table from Droptimizer URL (1-hour cache)
- `useStorage` — localStorage + URL hash persistence

---

## What's In Progress / Remaining

### Not yet wired: sim DPS snapshots from client
- `api/snapshots.js?type=sim` endpoint exists and works
- But the client (`CharacterView → RaidbotsSection`) does not yet POST to it when a new sim URL is saved and DPS loads
- **What's needed:** In `RaidbotsSection`, add a `useEffect` on `[dps]` that fires after URL save: `POST /api/snapshots?type=sim` with `{ character_name, dps, report_url: reportUrl, report_type: 'raidbots', spec }`
- Requires passing `writeToken` down from App → CharacterView → RaidbotsSection

### TODO.md backlog items (not started)
- Last-fetched timestamps (show "fetched 3 min ago" on CharacterView + MemberCard)
- Refresh button to bust Blizzard/WCL cache per character
- WCL cache auto-invalidation on EU Tuesday 09:00 UTC reset
- Discord webhook for weekly raid summary
- Attendance tracking

---

## Decisions Made

| Decision | Why |
|---|---|
| Supabase (Postgres) over expanding KV | KV is a single JSON blob — can't query history, fragile for multi-field updates |
| Service role key server-side only | Never expose to browser; all Supabase writes go through Vercel serverless |
| `api/characters` returns `null` when empty (not `[]`) | Lets App.jsx distinguish "Supabase configured but empty" from "data loaded" for KV fallback seeding |
| iLvl snapshots don't require write token | Blizzard gear data is public; any visitor loading a character contributes data |
| Sim snapshots DO require write token | Prevents anonymous spam; only guild members with the password can write sims |
| SVG sparklines, no chart library | Keeps bundle small; simple polyline is all we need for 30–180 data points |
| Report URLs stored on `members` objects (not separate table) | One-to-one per character, updated rarely — embedding in characters row is simplest |
| `member.reportUrl` preferred over localStorage | Supabase value is shared across devices; localStorage is per-device fallback |

---

## Known Bugs / Tech Debt

- **`@vercel/kv` deprecation warning** — the package is deprecated (Vercel KV → Upstash Redis via Marketplace). Functionally fine for now; migration involves changing import to `@upstash/redis` eventually.
- **Sim snapshots not auto-posted** — endpoint exists, client wiring missing (see above).
- **ProgressionCharts fetches on every CharacterView mount** — no caching. Fine for now (data is tiny), but could add a short-lived cache or session-level memo if it becomes chatty.
- **Report URLs initialise from `member.reportUrl` only on first render** — the `useEffect` sync handles later Supabase loads, but if the member object updates while the user is already on CharacterView, there could be a brief flash of the old URL. Acceptable for now.
- **`updateMember` in App.jsx syncs entire `guild.members` array to Supabase** on every spec/class auto-learn from Blizzard. Could debounce or batch, but calls are infrequent in practice.

---

## Environment Details

### New dependencies added
```
@supabase/supabase-js   (added this session)
```

### New Vercel env vars required
```
SUPABASE_URL                Project URL (https://xxxx.supabase.co)
SUPABASE_SERVICE_ROLE_KEY   Service role / secret API key
```

### Supabase SQL (must be run once in Supabase SQL Editor)
```sql
CREATE TABLE characters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  class text DEFAULT '', spec text DEFAULT '',
  role text DEFAULT 'dps', is_main boolean DEFAULT true,
  realm text DEFAULT '', alt_of text,
  report_url text, droptimizer_url text,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE ilvl_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  character_name text NOT NULL, avg_ilvl numeric NOT NULL,
  snapped_at date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (character_name, snapped_at)
);
CREATE TABLE sim_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  character_name text NOT NULL, dps integer NOT NULL,
  report_url text, report_type text, spec text,
  simmed_at timestamptz DEFAULT now()
);
```
