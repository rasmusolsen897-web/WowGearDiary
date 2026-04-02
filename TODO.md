# WoW Guild Planner — Roadmap

## Shipped

- Guild overview: member cards with live Blizzard gear, WCL parses, and Raidbots DPS
- Cloud guild roster via Vercel KV (Upstash Redis) with password-gated writes
- Settings drawer: Guild / Characters / API tabs; Cloud Sync unlock with shared password
- Character detail view: Droptimizer upgrade table, Raidbots quick sim, WCL per-boss parse table, gear list
- WCL: avg parse across all bosses (auto-zone, no hardcoded zone ID), expandable per-boss breakdown
- Blizzard API: live iLvl, spec/class auto-learn, tier count badges, crafted weapon detection
- Droptimizer: server-side parse (compact 16KB response vs 500KB raw), sortable upgrade table
- Performance: React.memo, useEffect for side effects, in-memory server token cache, useMemo
- All 4 originally planned modules: useStorage, UpgradeCharts, WeeklyTracker, CatalystPlanner

---

## Up Next — Robustify persistence & transparency

The core gap: Raidbots and Droptimizer report URLs live in each browser's localStorage. A guildie on a different device sees nothing when someone else pastes a report. These need to be part of the synced guild state.

- [ ] **Sync report URLs into guild data** — move `member.reportUrl` and `member.droptimizerUrl` out of localStorage (`raidbots-url:*`, `droptimizer-url:*`) and into each member object in the guild roster. Syncs via KV automatically. One person pastes a Droptimizer link, everyone sees the upgrades.
- [ ] **Last-fetched timestamps** — store `fetchedAt` alongside cached Blizzard/WCL data. Show "fetched 3 min ago" on CharacterView hero and MemberCard; "Report from Jan 15" near Raidbots/Droptimizer sections.
- [ ] **Refresh controls** — "↺ Refresh" button on MemberCard and CharacterView hero to force-bust the Blizzard + WCL cache for that character. Currently requires waiting 15–30 min or manually clearing localStorage.
- [ ] **WCL cache invalidation on reset** — auto-bust WCL localStorage cache on EU Tuesday 09:00 UTC so parses show the new week's data without manual intervention.

---

## Backlog

- [ ] **Discord webhook** — post a weekly summary (avg parses, new loot, vault slots) to a guild Discord channel
- [ ] **Attendance tracking** — log which members attended each raid night; track attendance % per member over time
