# WoW Gear Diary — Project Status
_Last updated: 2026-04-04_

---

## Architecture Overview

Browser SPA (Vite/React) + Vercel Serverless (api/) + Supabase Postgres + Vercel KV

**API endpoints:**
- /api/blizzard, /api/wcl, /api/guild, /api/characters, /api/snapshots, /api/raidbots, /api/raidbots-report
- /api/droptimizer-status — queue/scheduler status (drives Settings panel)
- /api/droptimizer-enrollment — enroll characters into automated runs
- /api/droptimizer-enrollment/validate — validate + store exact payload
- /api/droptimizer-run — manually trigger a single character run
- /api/cron/droptimizer — hourly cron worker

**Storage:**
- Vercel KV (Upstash Redis): guild metadata only
- Supabase Postgres: characters, ilvl_snapshots, sim_snapshots, sim_runs, sim_run_items, droptimizer_payloads, droptimizer_scheduler_state, droptimizer_enrollments

---

## What's Been Built

### Core App
- App.jsx, GuildOverview, CharacterView, GuildHeader, Settings (with Droptimizer queue panel)
- RaidbotsSection, DroptimizerSection, WclSection, ProgressionCharts in CharacterView
- Whooplol-only panels: TierProgress, CatalystPlanner, GearSlots, SimTable, UpgradeCharts, WeeklyTracker, RaidBossPriority, DungeonPriority, GamePlan

### Key API files
- api/_raidbots.js — submit/poll, buildDroptimizerPayload, extractRaidbotsActorDetails
- api/_droptimizer.js — DROPTIMIZER_SCENARIOS, isExactDroptimizerPayload, buildScenarioPayload
- api/_droptimizer-automation.js — classifyDroptimizerFailure, compareQueuedCharacters, RUN_STATUSES
- api/_droptimizer-execution.js — validateEnrollmentPayload, listBatchCandidates, enrollment logic
- api/_droptimizer-store.js — all Supabase helpers, normalizeName
- api/_droptimizer-status.js — summarizeAutomationQueue, isQueueRunEligible
- api/cron/droptimizer.js — main hourly worker: seed queue, submit, poll, retry, store results

### Workflow Layer (stage 0.5 — groundwork laid, not production-active yet)
- workflow-server/api/cron/droptimizer.get.js — Nitro handler
- workflow-server/api/droptimizer-enrollment/validate.post.js
- workflow-server/api/droptimizer-run.post.js
- workflows/droptimizer-runs.js — workflow definition: submit, poll, store per character

---

## Current Focus: Eylac Droptimizer Validation

**Goal:** Validate the full cron/droptimizer automation flow end-to-end for Eylac (Subtlety Rogue, EU/Argent Dawn).

**Steps:**
1. Enroll Eylac: POST /api/droptimizer-enrollment
2. Supply exact payload: POST /api/droptimizer-enrollment/validate
3. Manual run: GET /api/cron/droptimizer?character=Eylac&scenario=raid_heroic with Bearer CRON_SECRET
4. Verify: poll /api/droptimizer-status, check sim_runs + sim_run_items in Supabase
5. Confirm characters.droptimizer_url updated for Eylac

**Blocker:** RAIDBOTS_SESSION env var still pending (set in Vercel dashboard).

---

## What's In Progress / Remaining

### Sim DPS snapshots from client — not wired
- api/snapshots.js?type=sim endpoint exists
- RaidbotsSection does not POST to it when a sim URL is saved + DPS loads
- Need: useEffect on [dps] in RaidbotsSection firing POST /api/snapshots?type=sim
- Requires writeToken passed down from App to CharacterView to RaidbotsSection

### Backlog (not started)
- Last-fetched timestamps ("fetched 3 min ago" on cards)
- Refresh button to bust Blizzard/WCL cache per character
- WCL cache auto-invalidation on EU Tuesday 09:00 UTC reset
- Discord webhook for weekly raid summary
- Attendance tracking

---

## Key Decisions

- buildDroptimizerPayload(template, character): character param takes precedence over actor in template
- Supabase over KV for history (KV is a single blob, can't query)
- Service role key server-side only
- api/characters returns null (not []) when empty — signals KV fallback needed
- SVG sparklines, no chart library
- Report URLs on members objects (synced via Supabase, shared across devices)

---

## Known Bugs / Tech Debt

- @vercel/kv deprecation warning — migrate to @upstash/redis eventually
- Sim snapshots not auto-posted from client
- ProgressionCharts fetches on every CharacterView mount (no cache)
- updateMember syncs entire members array on every Blizzard auto-learn

---

## Required Env Vars

```
BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET
WCL_CLIENT_ID / WCL_CLIENT_SECRET
GUILD_WRITE_TOKEN
KV_REST_API_URL / KV_REST_API_TOKEN
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
RAIDBOTS_SESSION                    <- PENDING (needed for droptimizer automation)
RAIDBOTS_EMAIL / RAIDBOTS_PASSWORD  (fallback if SESSION not set)
RAIDBOTS_CSRF                       (optional)
RAIDBOTS_DROPTIMIZER_RAID_JSON      (optional exact payload override for raid_heroic)
```
