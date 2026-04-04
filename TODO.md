# WowGearDiary Backlog

Use this file for prioritized, still-relevant work. Move implementation details into a dated plan under `docs/plans/` once a task is ready to execute.

## Now

- [ ] Diagnose and stabilize the Raidbots Droptimizer integration end-to-end before taking on additional roadmap work
- [ ] Set `RAIDBOTS_SESSION` in Vercel and validate the Eylac flow end-to-end
- [ ] Enroll Eylac, validate an exact payload, manually run the scenario, and confirm `sim_runs`, `sim_run_items`, and `characters.droptimizer_url` update correctly
- [ ] Auto-post sim DPS snapshots from `RaidbotsSection` to `/api/snapshots?type=sim` after a successful saved sim result
- [ ] Add last-fetched timestamps for Blizzard and WCL data in both member cards and character detail
- [ ] Add per-character refresh controls that explicitly bust cached Blizzard and WCL data

## Next

- [ ] Invalidate WCL cache on weekly reset so parses refresh without manual storage clearing
- [ ] Reduce unnecessary full-roster syncs when only one member changes
- [ ] Evaluate a small cache strategy for `ProgressionCharts` if repeated fetches become noisy

## Later

- [ ] Replace deprecated `@vercel/kv` usage with the supported Upstash Redis client
- [ ] Post weekly guild summaries to Discord
- [ ] Track raid attendance over time
