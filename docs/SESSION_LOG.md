# Session Log

---

## Session: 2026-04-18 - WCL Warehouse Revamp

### Scope

Replace request-time WCL parsing with stored WCL warehouse data in Supabase, switch the runtime to a guild-only dashboard, and add a manual WCL import workflow in Settings.

### Tasks Completed

- `api/_wclWarehouse.js` - warehouse normalization, import persistence, list shaping, and guild dashboard aggregation
- `api/wcl-imports.js` - GET import status list and POST manual import/reimport flow
- `api/guild-dashboard.js` - single dashboard payload endpoint plus frontend-facing response serialization
- `docs/supabase-wcl-warehouse.sql` - warehouse table definitions for `wcl_reports`, `wcl_fights`, `wcl_fight_players`, and `wcl_loot_events`
- `scripts/import-wcl-reports.mjs` - manual CLI helper for importing one or more WCL report URLs/codes
- `src/App.jsx` - guild-only runtime shell, no character detail rendering
- `src/components/GuildHeader.jsx` - simplified guild header shell
- `src/components/GuildOverview.jsx` - dashboard UI powered by `/api/guild-dashboard`
- `src/components/Settings.jsx` - WCL import admin panel in the API tab
- `src/index.css` - parchment/ink theme and dashboard styles
- Tests added or updated for warehouse shaping, dashboard runtime, import panel presence, and dashboard API serialization

### Verification

- Targeted Node tests for warehouse helpers and dashboard/import contracts passed locally
- Frontend runtime/source tests for the guild-only shell passed locally
- Full repo verification should continue to use `npm run verify`

### Important Notes

- The dashboard now reads stored WCL imports instead of browser fanout to WCL
- Blizzard-backed `ilvl_snapshots` remain the source of truth for iLvl trend data
- `api/_charactersSync.js` did not need warehouse cleanup changes because the WCL tables are not part of the removal list
- `src/data.json` remains as bootstrap/fallback data, not the main runtime data source for parse/progression

### Recommended Next Steps

1. Apply `docs/supabase-wcl-warehouse.sql` in production if needed
2. Import historical raid reports through Settings to seed real guild history
3. Smoke-test the live Vercel deployment with imported data and confirm each dashboard panel reflects warehouse rows

---

## Session: 2026-04-02 - Supabase Migration + Progression History

### Scope

Full Supabase backend integration: migrate character storage from KV JSON blob to Postgres, add iLvl history snapshots, wire report URLs to sync across devices, and build SVG progression charts.

### Tasks Completed

- `api/_supabase.js` - shared server-side Supabase client
- `api/characters.js` - GET/POST/DELETE characters from Supabase `characters` table; `null` return when empty triggers KV fallback and Supabase seeding in `App.jsx`
- `api/snapshots.js` - GET iLvl+sim history; POST iLvl (no auth) and sim (write token) snapshots
- `api/blizzard.js` - fire-and-forget iLvl snapshot write after every Blizzard character fetch
- `src/App.jsx` - parallel fetch of KV metadata + Supabase characters on mount; Supabase is source of truth; auto-seeds from KV on first deploy; `setGuild` syncs to both KV and Supabase
- `src/components/CharacterView.jsx` - `RaidbotsSection` and `DroptimizerSection` prefer Supabase-backed URLs over localStorage and render progression charts
- `src/components/ProgressionCharts.jsx` - SVG sparkline charts for iLvl history and sim DPS history
- `src/index.css` - chart styles for WCL/progression sections
- `PROJECT_STATUS.md` - architecture snapshot, decisions, and known debt

### Tasks Remaining

- Post sim DPS snapshots from the client after a successful saved Raidbots result
- Add last-fetched timestamps to member cards and the character hero
- Add a per-character refresh button for Blizzard + WCL caches
- Invalidate WCL local cache on weekly reset
- Add weekly Discord webhook summaries
- Track raid attendance over time

### Recommended Next Steps

Wire up sim DPS snapshots from the client first, then add freshness timestamps and explicit refresh controls.
