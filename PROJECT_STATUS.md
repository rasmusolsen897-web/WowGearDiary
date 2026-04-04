# WowGearDiary Project Status
_Last updated: 2026-04-04_

## Current State

WowGearDiary is a working React + Vite SPA with Vercel serverless APIs, shared guild persistence, and live Blizzard/WCL integrations. Guild overview, character detail, report ingestion, progression history, and the new Droptimizer automation surface are in place, but the Raidbots Droptimizer integration is currently the main blocker and is not yet reliable enough to treat as a stable feature.

The repo also now has a lightweight engineering workflow adapted from `obra/superpowers`:

- project context in `docs/project-context.md`
- SWE rules in `docs/engineering-playbook.md`
- `npm run verify` as the default verification command
- CI enforcing the verification suite on pushes and PRs

## Architecture Snapshot

```text
Browser
  React SPA (Vite)
    GuildOverview
    CharacterView

Vercel Serverless
  /api/blizzard
  /api/wcl
  /api/guild
  /api/characters
  /api/snapshots
  /api/raidbots
  /api/raidbots-report
  /api/droptimizer-status
  /api/droptimizer-enrollment
  /api/droptimizer-enrollment/validate
  /api/droptimizer-run
  /api/cron/droptimizer

Storage
  Vercel KV for guild metadata
  Supabase for characters, snapshots, sim runs, payloads, enrollments, and automation state
```

## Healthy Areas

- Guild overview and character detail flows are implemented
- Supabase is the main persistence layer for characters and progression history
- Blizzard and Warcraft Logs integrations are broadly in place
- Stage 0.5 Droptimizer groundwork is merged: enrollment, validation, manual run, queue status, and workflow scaffolding
- The repo has a clearer contribution workflow, PR checklist, and CI baseline

## Active Gaps

### Highest priority

- Raidbots Droptimizer integration is the core active problem; after 1-2 days of effort it still does not work reliably end-to-end
- The immediate need is diagnosis and stabilization of the Droptimizer flow before additional roadmap work
- Current live validation focus is Eylac: enroll, validate exact payload, manually run, and confirm results persist correctly
- `RAIDBOTS_SESSION` remains a live dependency for cron-based automation validation
- Sim DPS snapshots are not yet posted automatically from the client when a new Raidbots result is saved

### Next quality improvements

- Add last-fetched timestamps for Blizzard and WCL data
- Add explicit refresh controls to bust per-character caches
- Invalidate WCL cache on weekly reset

### Longer-term product work

- Discord webhook summary output
- Attendance tracking
- Eventual migration away from deprecated `@vercel/kv`

## Important Decisions

- Supabase remains the source of truth for synced character rows and history
- Vercel KV remains limited to lightweight guild metadata
- The app stays a single-page React experience without routing unless product needs change
- Styling remains hand-rolled CSS
- Third-party API access stays server-side in `api/`
- `buildDroptimizerPayload(template, character)` should let the explicit character input override embedded actor/template identity

## Known Tech Debt

- `@vercel/kv` is deprecated and should eventually move to `@upstash/redis`
- Raidbots Droptimizer remains the highest-risk integration area despite existing code and tests; current implementation confidence is low until the live flow is proven
- `ProgressionCharts` fetches on each character-view mount and could use light caching if traffic grows
- Character updates currently sync the whole members array instead of a finer-grained delta

## Operational Notes

- Keep `docs/project-context.md` updated when architecture changes
- Keep `TODO.md` focused on prioritized next work, not historical notes
- Record meaningful handoff details in `docs/SESSION_LOG.md`
