# WowGearDiary Backlog

Use this file for prioritized, still-relevant work. Move implementation details into a dated plan under `docs/plans/` once a task is ready to execute.

## Now

- [ ] Run `docs/supabase-wcl-warehouse.sql` in the production Supabase project if the warehouse tables are not live yet
- [ ] Import historical WCL raid reports through Settings and validate the stored warehouse output in Supabase
- [ ] Smoke-test `/api/wcl-imports` and `/api/guild-dashboard` against production data and confirm the homepage matches imported reports
- [ ] Polish dashboard empty states and refresh/freshness cues for sections with sparse warehouse data

## Next

- [ ] Decide whether to keep or retire legacy runtime code paths that are no longer dashboard-critical, especially `api/heroic-progress.js`
- [ ] Document a repeatable reimport workflow for log corrections or missing loot entries
- [ ] Evaluate whether roster/dashboard aggregation needs more caching or pagination once real history is loaded
- [ ] Resume Droptimizer stabilization after the WCL warehouse path is fully validated

## Later

- [ ] Add scheduled or semi-automated WCL imports if manual import proves stable
- [ ] Replace deprecated `@vercel/kv` usage with the supported Upstash Redis client
- [ ] Post weekly guild summaries to Discord
- [ ] Add deeper attendance exports or historical reporting views if the guild wants them
