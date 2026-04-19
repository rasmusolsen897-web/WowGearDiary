# Project Context

This document is the shared source of truth for how WowGearDiary is structured. Update it when architecture, ownership boundaries, or operating constraints change.

## Product Summary

WowGearDiary is a single-page guild dashboard for a small WoW group. The shipped runtime is now guild-only: the homepage is a summary dashboard for raid parses, progression, attendance, loot, and roster trends, while Settings remains the admin surface for guild edits and manual WCL report imports.

The app preserves a lightweight deployment model:

- browser app in `src/`
- serverless integration layer in `api/`
- shared guild metadata in Vercel KV
- character, warehouse, and time-series data in Supabase

`src/data.json` still exists for bootstrap/fallback seed data and legacy planning data, but the runtime app no longer routes into a per-character detail view.

## Architecture

### Frontend

- `src/App.jsx` owns guild state, sync status, and settings visibility
- `src/components/GuildHeader.jsx` renders the guild shell header and settings entry point
- `src/components/GuildOverview.jsx` renders the guild-only dashboard homepage
- `src/components/Settings.jsx` is the admin drawer for guild edits, character roster edits, API status, and manual WCL imports
- `src/hooks/` owns client-side fetching, caching, and persistence helpers
- `src/utils/` contains small shared helpers

The app is intentionally a single SPA without React Router. There is no runtime character drill-down flow.

### Backend

- `api/` contains all third-party API access and server-side persistence
- underscore-prefixed modules are shared backend helpers
- `api/guild-dashboard.js` builds the normalized guild summary payload from Supabase warehouse data plus guild metadata
- `api/wcl-imports.js` lists imported reports and performs manual WCL import/reimport writes
- `api/_wclWarehouse.js` owns WCL report normalization, persistence, and dashboard aggregation
- `api/cron/droptimizer.js` is the submit-only cron for Raidbots submissions
- `api/cron/droptimizer-collect.js` is the collect cron for polling and persisting Droptimizer results
- `api/_droptimizer-execution.js` owns Droptimizer orchestration helpers

No browser code should call Blizzard, Warcraft Logs, Raidbots, or Supabase directly with secrets.

The runtime dashboard should not depend on live browser fanout to Warcraft Logs. Stored WCL imports in Supabase are the source of truth for parse, progression, attendance, loot, and roster parse-trend views. `/api/wcl` remains legacy/admin-compatible only.

Midnight warehouse parsing is report-aware rather than globally difficulty-aware. Live Midnight reports in Warcraft Logs zone `46` (`VS / DR / MQD`) currently use heroic difficulty ID `4`, while legacy fixtures and older assumptions in the repo may still reference heroic as `5`. Older warehouse rows imported before the actor-key normalization fix should be reimported so `wcl_fight_players.actor_key` matches current roster normalization.

The Raidbots Droptimizer path exists in both interactive and automated forms. The cron-based submit/collect split is code-complete but should be treated as unstable until the live Eylac end-to-end flow is proven.

### Data Ownership

- `src/data.json`: guild seed data and legacy planning fallback data
- Vercel KV: guild metadata
- Supabase `characters`: synced guild members and admin-edited roster metadata
- Supabase `ilvl_snapshots`: Blizzard-backed iLvl history
- Supabase `wcl_reports`, `wcl_fights`, `wcl_fight_players`, `wcl_loot_events`: stored WCL warehouse facts for dashboard aggregation
- Supabase sim and automation tables: Droptimizer state and outputs

## Repository Layout

```text
src/        frontend application
api/        serverless functions and backend helpers
test/       node test suites and fixtures
docs/       architecture, workflow, SQL, and session notes
```

## Non-Negotiable Constraints

- Keep styling hand-rolled; do not introduce Tailwind, Bootstrap, or another UI framework
- Keep the SPA structure unless there is an explicit product need for routing
- Add new CSS tokens to `src/index.css` instead of scattering inline color values
- Prefer pure components; side effects belong in hooks or effect blocks
- Do not reintroduce runtime character drill-down without an explicit product decision
- Treat both client build targets as required: standalone build and Vercel build

## Verification Baseline

The intended verification command is:

```bash
npm run verify
```

That command should stay green for merge-ready work unless the repo is knowingly mid-migration and the exception is documented in the PR or session notes.
