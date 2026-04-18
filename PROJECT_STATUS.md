# WowGearDiary Project Status
_Last updated: 2026-04-18_

## Current State

WowGearDiary is a working React + Vite SPA with Vercel serverless APIs, shared guild persistence, and Supabase-backed warehouse storage. The runtime experience is now guild-only: the homepage is a parchment-style dashboard that reads a single `/api/guild-dashboard` summary payload, and Settings is the admin surface for guild edits, roster edits, API checks, and manual WCL imports.

The dashboard no longer depends on live browser fanout to Warcraft Logs. Parse, progression, attendance, loot, and roster parse-trend data now come from stored WCL imports in Supabase. Blizzard-backed `ilvl_snapshots` remain the source for iLvl trend history.

## Architecture Snapshot

```text
Browser
  React SPA (Vite)
    GuildHeader
    GuildOverview
    Settings

Vercel Serverless
  /api/guild
  /api/characters
  /api/blizzard
  /api/wcl                 (legacy/admin-compatible)
  /api/wcl-imports
  /api/guild-dashboard
  /api/snapshots
  /api/raidbots
  /api/raidbots-report
  /api/droptimizer-status
  /api/droptimizer-enrollment
  /api/droptimizer-enrollment/validate
  /api/droptimizer-run
  /api/cron/droptimizer
  /api/cron/droptimizer-collect

Storage
  Vercel KV for guild metadata
  Supabase for characters, ilvl snapshots, WCL warehouse tables, sim runs, payloads, enrollments, and automation state
```

## Healthy Areas

- Guild-only dashboard runtime is implemented in `src/App.jsx`, `GuildHeader`, `GuildOverview`, and `Settings`
- Manual WCL import flow exists through `/api/wcl-imports`
- Stored WCL warehouse facts back the dashboard aggregation path
- Blizzard profile fetches still feed `ilvl_snapshots`
- Both build targets remain part of the verification baseline
- Droptimizer automation surfaces and cron paths are still present

## Active Gaps

### Highest priority

- Apply `docs/supabase-wcl-warehouse.sql` in production if it has not already been run
- Import enough historical WCL reports to populate real parse/progression history in the new warehouse tables
- Validate the manual WCL import flow against live reports in production and confirm `wcl_reports`, `wcl_fights`, `wcl_fight_players`, and `wcl_loot_events` fill correctly

### Next quality improvements

- Add better empty-state and freshness cues for warehouse-backed dashboard sections
- Decide whether to keep or retire legacy runtime dependencies such as `api/heroic-progress.js` now that the dashboard reads stored warehouse data
- Add a lightweight operational playbook for reimporting reports when WCL data changes

### Longer-term product work

- Scheduled or semi-automated WCL import sync after manual import proves stable
- Replace deprecated `@vercel/kv` usage with the supported Upstash Redis client
- Weekly Discord summary output
- Attendance exports or historical drill-down if the guild wants deeper reporting later

## Important Decisions

- Supabase is the source of truth for synced character rows, WCL warehouse facts, and historical data
- Vercel KV remains limited to lightweight guild metadata
- The app stays a single-page React experience without routing unless product needs change
- Styling remains hand-rolled CSS
- Third-party API access stays server-side in `api/`
- The runtime dashboard uses stored WCL imports, not browser fanout, for parse/progression surfaces

## Known Tech Debt

- `@vercel/kv` is deprecated and should eventually move to `@upstash/redis`
- Legacy WCL code paths still exist for admin compatibility and may need cleanup once the warehouse path is fully proven
- Droptimizer submit/collect is still a separate unstable stream of work and needs live confidence before being treated as settled
- Character updates still sync the whole members array instead of a finer-grained delta

## Operational Notes

- Keep `docs/project-context.md` updated when architecture changes
- Keep `TODO.md` focused on prioritized next work, not historical notes
- Record meaningful handoff details in `docs/SESSION_LOG.md`
