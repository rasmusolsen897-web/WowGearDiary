# Project Context

This document is the shared source of truth for how WowGearDiary is structured. Update it when architecture, ownership boundaries, or operating constraints change.

## Product Summary

WowGearDiary is a single-page guild dashboard for a small WoW group. It shows live character gear, parse data, sim data, and progression history while preserving a lightweight deployment model:

- browser app in `src/`
- serverless integration layer in `api/`
- shared guild metadata in Vercel KV
- character and time-series data in Supabase

Whooplol is the special-case "main" character whose static planning data lives in `src/data.json`. All other guild members rely on live API-backed data.

## Architecture

### Frontend

- `src/App.jsx` owns guild state, sync status, selected member routing, and settings visibility
- `src/components/` contains UI sections and page-level composition
- `src/hooks/` owns client-side fetching, caching, and persistence helpers
- `src/utils/` contains small shared helpers

The app is intentionally a single SPA without React Router. Navigation is conditional rendering between guild overview and character detail.

### Backend

- `api/` contains all third-party API access and server-side persistence
- underscore-prefixed modules are shared backend helpers
- `api/cron/droptimizer.js` — submit-only cron (03:00 UTC): submits sims to Raidbots, stores `simId`, exits immediately
- `api/cron/droptimizer-collect.js` — collect cron (03:00/11:00/19:00 UTC): polls running sims, persists completed results, marks stale runs as failed
- `api/_droptimizer-execution.js` — core orchestration: `startScenarioSubmission`, `pollScenarioSubmission`, `completeScenarioFromReport`, `collectPendingRuns`, `executeDirectScenario` (synchronous fallback for manual runs)

No browser code should call Blizzard, Warcraft Logs, Raidbots, or Supabase directly with secrets.

The Raidbots Droptimizer path exists in both interactive and automated forms. The cron-based submit/collect split is code-complete but should be treated as unstable until the live Eylac end-to-end flow is proven.

### Data Ownership

- `src/data.json`: Whooplol static planning data and guild seed data
- Vercel KV: guild metadata
- Supabase `characters`: synced guild members and report URLs
- Supabase snapshots and sim tables: progression history and automation outputs

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
- Keep Whooplol-only sections gated in `CharacterView.jsx`
- Treat both client build targets as required: standalone build and Vercel build

## Verification Baseline

The intended verification command is:

```bash
npm run verify
```

That command should stay green for merge-ready work unless the repo is knowingly mid-migration and the exception is documented in the PR or session notes.
