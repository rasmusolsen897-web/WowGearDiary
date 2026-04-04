# WoW Guild Planner — Roadmap

## Shipped

- Guild overview: member cards with live Blizzard gear, WCL parses, and Raidbots DPS
- Cloud guild roster via Vercel KV with password-gated writes
- Settings drawer: Guild / Characters / API tabs; Cloud Sync + Droptimizer queue status panel
- Character detail view: Droptimizer upgrade table, Raidbots quick sim, WCL per-boss parse, gear list
- WCL: avg parse (auto-zone), expandable per-boss breakdown
- Blizzard API: live iLvl, spec/class auto-learn, tier count badges, crafted weapon detection
- Droptimizer: server-side parse (16KB vs 500KB raw), sortable upgrade table
- Report URLs synced into guild state (shared across devices via Supabase)
- Droptimizer automation pipeline: hourly cron, queue, submit, poll, retry, store results in Supabase
- Droptimizer queue status panel in Settings
- Enrollment API + payload validation endpoint
- Manual run trigger endpoint

---

## Active: Eylac Droptimizer Flow Validation

- [ ] Set RAIDBOTS_SESSION in Vercel dashboard
- [ ] Enroll Eylac and supply validated exact payload
- [ ] Confirm end-to-end: run completes, sim_run_items populated, droptimizer_url updated
- [ ] Validate DroptimizerSection in UI shows Eylac's results correctly

---

## Up Next — Polish & Wire Remaining Plumbing

- [ ] **Sim DPS snapshot auto-post** — wire RaidbotsSection to POST /api/snapshots?type=sim when sim URL is saved and DPS loads (needs writeToken passed down from App)
- [ ] **Last-fetched timestamps** — show "fetched 3 min ago" on CharacterView and MemberCard; "Report from Apr 4" near Raidbots/Droptimizer sections
- [ ] **Refresh controls** — force-bust Blizzard + WCL cache per character without clearing all localStorage
- [ ] **WCL cache auto-invalidation** — bust on EU Tuesday 09:00 UTC so new week parses show immediately

---

## Backlog

- [ ] **Discord webhook** — weekly summary (avg parses, new loot, vault slots) to guild Discord
- [ ] **Attendance tracking** — log raid attendance per member, track % over time
