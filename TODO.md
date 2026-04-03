# WoW Guild Planner - Roadmap

## Shipped

- Guild overview: member cards with live Blizzard gear, WCL parses, and Raidbots DPS
- Cloud guild roster via Vercel KV (Upstash Redis) with password-gated writes
- Settings drawer: Guild / Characters / API tabs; Cloud Sync unlock with shared password
- Character detail view: Droptimizer upgrade table, Raidbots quick sim, WCL per-boss parse table, gear list
- WCL: avg parse across all bosses (auto-zone, no hardcoded zone ID), expandable per-boss breakdown
- Blizzard API: live iLvl, spec/class auto-learn, tier count badges, crafted weapon detection
- Droptimizer: server-side parse (compact 16KB response vs 500KB raw), sortable upgrade table
- Shared report URLs: Raidbots + Droptimizer links now live on synced member records, including migration from old browser-only storage
- Freshness controls: Blizzard/WCL/report sections show fetched times and allow manual refresh
- WCL weekly reset handling: cached parses auto-expire after the Tuesday 09:00 UTC EU reset
- Performance: React.memo, useEffect for side effects, in-memory server token cache, useMemo
- All 4 originally planned modules: useStorage, UpgradeCharts, WeeklyTracker, CatalystPlanner

---

## Up Next - Reliability & automation polish

- [ ] **Automation health timeline** - surface the last successful automated Droptimizer run per character, plus the latest failure reason/retry time when a queued run stalls.
- [ ] **Character sync feedback** - show which member fields were learned from APIs recently (class/spec/role/report links) so guildies can tell what changed automatically.
- [ ] **Snapshot backfill tools** - add a safe one-click way to store a fresh sim snapshot after saving a report URL, even when the report was already cached locally.

---

## Backlog

- [ ] **Discord webhook** - post a weekly summary (avg parses, new loot, vault slots) to a guild Discord channel
- [ ] **Attendance tracking** - log which members attended each raid night; track attendance % per member over time
