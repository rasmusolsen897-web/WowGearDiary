# WoW Guild Planner — Codex Context

## Project Summary
A React + Vite guild management and character analysis platform for a small friend group. Members open the shared Vercel URL and see live gear, parse, and sim data for everyone in the guild. Guild roster is stored in Vercel KV (Upstash Redis) so all visitors see the same data. Writes are password-gated — guildies unlock once in Settings and their edits sync instantly.

**Whooplol** (Frost Mage, EU/Tarren Mill) is the "main" character with hardcoded sim/priority data in `src/data.json`. All other guild members get live data from the Blizzard, WCL, and Raidbots APIs only.

## Main Character (Whooplol)
- **Name:** Whooplol | **Class:** Frost Mage | **Race:** Troll
- **Server:** EU/Tarren Mill | **Level:** 90 | **Patch:** 12.0.1 Midnight
- **Avg iLvl:** 255.3 | **Catalyst Charges:** 8

## Tech Stack
- **Framework:** React 18 + Vite 5
- **Styling:** Hand-rolled CSS (no UI library) — all in `src/index.css`
- **Standalone export:** `vite-plugin-singlefile` → `dist/index.html` (self-contained, no CDN)
- **Vercel deploy:** `vite.config.vercel.js` → `dist/` served as SPA, `api/*.js` as serverless functions
- **Cloud storage (metadata):** `@vercel/kv` (Upstash Redis) — guild name/realm/region only (`wow-gear-diary:guild`)
- **Cloud storage (characters + history):** Supabase Postgres — `characters`, `ilvl_snapshots`, `sim_snapshots` tables
- **No TypeScript** — plain `.jsx` files
- **No router** — single page, conditional render between GuildOverview and CharacterView

## Build Commands
```bash
# Dev server
"/c/Program Files/nodejs/npm.cmd" run dev

# Standalone HTML (dist/index.html — fully self-contained, no server needed)
"/c/Program Files/nodejs/npm.cmd" run build

# Vercel deploy build (dist/ + api/ serverless functions)
"/c/Program Files/nodejs/npm.cmd" run build:vercel
```

**Always run both build commands after making changes.**

## Required Vercel Environment Variables
```
BLIZZARD_CLIENT_ID        Battle.net OAuth2 client ID
BLIZZARD_CLIENT_SECRET    Battle.net OAuth2 client secret
WCL_CLIENT_ID             Warcraft Logs OAuth2 client ID
WCL_CLIENT_SECRET         Warcraft Logs OAuth2 client secret
GUILD_WRITE_TOKEN         Shared password for write access to guild KV data
KV_REST_API_URL           Auto-set by Upstash Redis Vercel integration
KV_REST_API_TOKEN         Auto-set by Upstash Redis Vercel integration
SUPABASE_URL              Supabase project URL (https://xxxx.supabase.co)
SUPABASE_SERVICE_ROLE_KEY Supabase service role / secret key (server-side only, never expose to browser)
```

## Project Structure
```
WowGearDiary/
├── AGENTS.md
├── TODO.md
├── index.html                      ← Vite entry
├── package.json
├── vercel.json                     ← Vercel SPA rewrite + build config
├── vite.config.js                  ← singlefile build
├── vite.config.vercel.js           ← Vercel deploy build
├── api/                            ← Vercel serverless functions (API proxies)
│   ├── _supabase.js                ← Shared Supabase client (service role, server-side only)
│   ├── blizzard.js                 ← Blizzard Battle.net proxy + fire-and-forget iLvl snapshot
│   ├── wcl.js                      ← WCL GraphQL proxy (OAuth2, in-memory token cache)
│   ├── guild.js                    ← Guild KV CRUD (GET open / POST password-gated)
│   ├── characters.js               ← Supabase characters CRUD (GET/POST/DELETE)
│   ├── snapshots.js                ← Supabase iLvl + sim DPS history (GET/POST)
│   ├── raidbots.js                 ← Raidbots quick sim proxy
│   └── raidbots-report.js          ← Droptimizer report parser (server-side, compact response)
├── dist/
│   └── index.html                  ← Built standalone (npm run build)
└── src/
    ├── data.json                   ← Whooplol sim/gear/priority data + guild seed roster
    ├── index.css                   ← Global styles + all CSS variables
    ├── main.jsx                    ← React root mount
    ├── App.jsx                     ← Root: guild state, cloud sync, member routing
    ├── components/
    │   ├── GuildHeader.jsx         ← Top bar: guild name, settings cog
    │   ├── GuildOverview.jsx       ← Member card grid with sort/filter/live API data
    │   ├── CharacterView.jsx       ← Per-member detail view (all sections)
    │   ├── Settings.jsx            ← Slide-in drawer (Guild / Characters / API tabs)
    │   ├── ShareButton.jsx         ← Share URL helper
    │   │
    │   │   ── Whooplol-only panels (gated by isMainChar check in CharacterView) ──
    │   ├── ProgressionCharts.jsx   ← SVG sparkline charts: iLvl + DPS over time (fetches /api/snapshots)
    │   ├── GearSlots.jsx           ← Clickable slot sidebar, filters SimTable
    │   ├── SimTable.jsx            ← Tabbed Raid/M+ sim results with filters
    │   ├── TierProgress.jsx        ← 5-slot tier tracker
    │   ├── CatalystPlanner.jsx     ← Catalyst decision engine
    │   ├── UpgradeCharts.jsx       ← DPS gain bar charts
    │   ├── WeeklyTracker.jsx       ← Boss kill checkboxes + M+ counter + vault
    │   ├── RaidBossPriority.jsx    ← Boss priority cards (high/medium/low)
    │   ├── DungeonPriority.jsx     ← M+ dungeon targeting cards
    │   └── GamePlan.jsx            ← 3-column weekly checklist
    └── hooks/
        ├── useBlizzardAPI.js       ← character gear/spec/class/iLvl, avatar URL
        ├── useWCLAPI.js            ← character parses (avgParseFromWCL, per-boss data)
        ├── useRaidbotsReport.js    ← quick sim DPS from report URL
        ├── useDroptimizerReport.js ← upgrade table from Droptimizer report URL
        ├── useStorage.js           ← localStorage + URL hash persistence hook
        ├── useRaidbotsAPI.js       ← (legacy)
        └── index.js                ← barrel exports
```

## App State (src/App.jsx)
```js
guild           // { name, region, realm, members[] } — KV → localStorage fallback
selectedMember  // null | member object — drives GuildOverview vs CharacterView
settingsOpen    // boolean
writeToken      // string — localStorage, sent as X-Write-Token header on guild POSTs
syncError       // null | string — last sync failure message
syncStatus      // 'idle' | 'syncing' | 'ok' | 'error'
```

### Guild Sync Flow
1. **Mount:** Fetches `/api/guild` (KV metadata) and `/api/characters` (Supabase) in parallel.
   - Supabase characters are used if present (source of truth, includes report URLs)
   - KV members used as fallback; if Supabase is empty and write token is set → seeds Supabase automatically
2. **Write:** `setGuild(updated)` → always writes to localStorage + POSTs to `/api/guild` (KV) AND `/api/characters` (Supabase) if token is set. 401 → sets syncError, still saved locally.
3. **Report URLs:** Stored on `member.reportUrl` / `member.droptimizerUrl` in the characters table. RaidbotsSection and DroptimizerSection prefer these over localStorage on init. On save, `onUpdateMember` is called → syncs via `setGuild`.
4. **iLvl history:** Written fire-and-forget in `api/blizzard.js` after every character fetch. One row per character per day (UPSERT).
5. **Token:** stored in `localStorage['wow-gear-diary:write-token']`. Entered once in Settings → Guild → Cloud Sync. Persists across sessions.

## API Integrations

### Blizzard (`api/blizzard.js`)
- OAuth2 client_credentials; in-memory token cache (resets on cold start, fine for burst requests)
- Returns: `avgIlvl`, `spec`, `class`, `level`, `faction`, `gear[]`, `tierCount`, `hasCraftedWeapon`, `craftedWeaponIlvl`, `avatarUrl`
- 15-min localStorage cache per character in `useBlizzardAPI`

### Warcraft Logs (`api/wcl.js`)
- OAuth2 client_credentials; in-memory token cache
- Hook: `useCharacterParses(name, realm, region, zoneID=null)` — `null` tells WCL to auto-select the character's most recent tier
- `avgParseFromWCL(wclData)` — averages `rankPercent` across Heroic (preferred) or Normal bosses with ≥1 kill
- `zoneRankings` is a JSON scalar — `encounter.name`, `totalKills`, `bestAmount`, `zone.name` all come back without needing GraphQL sub-field selection
- Per-boss expandable table in `CharacterView` via `WclSection` component
- 30-min localStorage cache per character

### Raidbots (`api/raidbots.js` + `api/raidbots-report.js`)
- `api/raidbots-report.js`: server-side Droptimizer parser → compact ~16KB normalized shape (avoids sending 500–800KB raw JSON to client)
- Droptimizer shape: `{ type, characterName, spec, baseDps, difficulty, upgrades: [{ itemId, name, slot, itemLevel, dpsDelta, dpsPct, source }] }`
- 1-hour localStorage cache for Droptimizer reports
- Report URLs currently stored per-member in localStorage (migration to guild object planned — see TODO.md)

### Guild KV (`api/guild.js`)
- `GET /api/guild` — returns guild JSON, no auth. Returns `null` (not error) if KV not configured.
- `POST /api/guild` — writes guild JSON, requires `X-Write-Token: <GUILD_WRITE_TOKEN>` header
- 503 if `KV_REST_API_URL` not set; 401 on wrong token

## Data Shape (src/data.json)
```
character    — Whooplol's name, class, race, server, level, patch, avgIlvl, catalystCharges
gear[]       — slot, item, ilvl, tierSlot (bool), hasTier (bool)
raidSim[]    — item, slot, ilvl, dps (%), source, tier (bool), catalyst (bool)
mythicSim[]  — item, slot, ilvl, dps (%), source, dungeon, catalyst (bool)
raidBossPriority[] — boss, priority ('high'|'medium'|'low'), drops[]
dungeonPriority[]  — dungeon, drops (count), note
gamePlan     — thisWeek[], thursday[], afterRaid[]
guild        — { name, region, realm, members[] }
             — members[]: { name, class, spec, role, isMain, realm, altOf }
```

## Color System (CSS Variables — defined in src/index.css)
| Variable | Hex | Use |
|---|---|---|
| `--frost-blue` | `#69ccff` | Primary accent, titles, active states |
| `--epic-purple` | `#a335ee` | Tier set, epic quality items |
| `--rare-blue` | `#0070dd` | Rare quality, medium priority |
| `--legendary-orange` | `#ff8000` | Catalyst charges, legendary items |
| `--bg` | `#0d0d18` | Page background |
| `--card` | `#1a1a2e` | Card backgrounds |
| `--success` | `#4cff91` | High DPS gains (≥2%) |
| `--warning` | `#ffd700` | Medium DPS gains (1–1.9%) |

## iLvl Color Rules
- ≥272: `--legendary-orange`
- ≥263: `--epic-purple`
- ≥250: `--rare-blue`
- ≥232: `--uncommon-green` (`#1eff00`)
- <232: `--text-muted`

## Parse Badge Colors (`parseBadgeColor(pct)`)
- ≥95%: `#e268a8` (pink)
- ≥75%: `#ff8000` (orange)
- ≥50%: `#1eff00` (green)
- ≥25%: `#0070dd` (blue)
- <25%: `#9d9d9d` (gray)

## Agent Guidelines
- **Always run `npm run build` AND `npm run build:vercel`** after any code change — both must pass
- **Never add external CSS frameworks** (Tailwind, Bootstrap) — hand-rolled CSS only
- **Never add a router** — SPA with conditional render, no routing needed
- **Keep components pure** — props in, JSX out. Side effects only in hooks
- **Color additions** go in `src/index.css` as CSS variables, not inline styles
- **New components** go in `src/components/` and must be imported where used
- **Data changes** go in `src/data.json` only — no hardcoded data in components
- **API proxies** go in `api/` — never call third-party APIs directly from the browser (CORS + secret leaking)
- **Whooplol-only panels** are gated behind `isMainChar` in `CharacterView.jsx` — keep them there
- **setState during render is forbidden** — always wrap in `useEffect` for side effects that update parent state
- **Inline style objects** in render bodies cause unnecessary re-renders — extract to module-level `const` at bottom of file
- **`React.memo`** list items that run hooks (e.g. MemberCard) to prevent cascade re-renders on parent state changes
