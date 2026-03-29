# WoW Frost Mage Gear Upgrade Planner — Claude Context

## Project Summary
A React + Vite single-page dashboard for **Whooplol** (Frost Mage, EU/Tarren Mill) to track gear upgrade priorities, simulate DPS gains, and plan the weekly WoW grind. Outputs a fully self-contained standalone HTML via `vite-plugin-singlefile`.

## Character
- **Name:** Whooplol | **Class:** Frost Mage | **Race:** Troll
- **Server:** EU/Tarren Mill | **Level:** 90 | **Patch:** 12.0.1 Midnight
- **Avg iLvl:** 255.3 | **Catalyst Charges:** 8

## Tech Stack
- **Framework:** React 18 + Vite 5
- **Styling:** Hand-rolled CSS (no UI library) — all in `src/index.css`
- **Standalone export:** `vite-plugin-singlefile` → `dist/index.html` (self-contained, no CDN)
- **No TypeScript** — plain `.jsx` files
- **No router** — single page, all state in `App.jsx` via `useState`

## Build Commands
```bash
# Dev server (requires Node in PATH — use full path on Windows if needed)
"/c/Program Files/nodejs/npm.cmd" run dev

# Production build (produces dist/index.html — fully standalone)
"/c/Program Files/nodejs/npm.cmd" run build
```

## Color System (CSS Variables — defined in src/index.css)
| Variable | Hex | Use |
|---|---|---|
| `--frost-blue` | `#69ccff` | Primary accent, titles, active states |
| `--epic-purple` | `#a335ee` | Tier set, epic quality items |
| `--rare-blue` | `#0070dd` | Rare quality, medium priority |
| `--legendary-orange` | `#ff8000` | Catalyst charges, legendary items |
| `--bg` | `#0d0d18` | Page background |
| `--card` | `#1a1a2e` | Card backgrounds |
| `--success` | `#4cff91` | High DPS gains (≥2%) |
| `--warning` | `#ffd700` | Medium DPS gains (1–1.9%) |

## iLvl Color Rules
- ≥272: `--legendary-orange`
- ≥263: `--epic-purple`
- ≥250: `--rare-blue`
- ≥232: `--uncommon-green` (`#1eff00`)
- <232: `--text-muted`

## Project Structure
```
WowGearDiary/
├── CLAUDE.md                 ← You are here
├── index.html                ← Vite entry
├── package.json
├── vite.config.js            ← includes viteSingleFile plugin
├── whooplol-planner.html     ← CDN-based standalone (no build needed)
├── dist/
│   └── index.html            ← Built standalone (run npm run build)
└── src/
    ├── data.json             ← ALL character/gear/sim data lives here
    ├── index.css             ← Global styles + all CSS variables
    ├── main.jsx              ← React root mount
    ├── App.jsx               ← Layout + all shared state
    └── components/
        ├── CharacterHeader.jsx    ← Name, class, server, iLvl, catalyst pips
        ├── TierProgress.jsx       ← 5-slot tier tracker (Head/Shoulder/Chest/Hands/Legs)
        ├── GearSlots.jsx          ← Clickable sidebar — filters SimTable by slot
        ├── SimTable.jsx           ← Tabbed Raid/M+ sim results with filters
        ├── RaidBossPriority.jsx   ← Boss priority cards (high/medium/low)
        ├── DungeonPriority.jsx    ← M+ dungeon targeting cards
        └── GamePlan.jsx           ← 3-column weekly checklist
```

## App State (src/App.jsx)
```js
const [activeTab, setActiveTab] = useState('raid')      // 'raid' | 'mythic'
const [selectedSlot, setSelectedSlot] = useState(null)  // gear slot name string
const [typeFilter, setTypeFilter] = useState('all')      // 'all' | 'tier' | 'trinket'
const [raidOnly, setRaidOnly] = useState(false)
const [showCatalyst, setShowCatalyst] = useState(true)
```

## Data Shape (src/data.json)
Key top-level keys:
- `character` — name, class, race, server, level, patch, avgIlvl, catalystCharges
- `gear[]` — slot, item, ilvl, tierSlot (bool), hasTier (bool)
- `raidSim[]` — item, slot, ilvl, dps (%), source, tier (bool), catalyst (bool)
- `mythicSim[]` — item, slot, ilvl, dps (%), source, dungeon, catalyst (bool)
- `raidBossPriority[]` — boss, priority ('high'|'medium'|'low'), drops[]
- `dungeonPriority[]` — dungeon, drops (count), note
- `gamePlan` — thisWeek[], thursday[], afterRaid[]

## Planned Extensions (Upcoming Agent Work)

### Module D — Persistence + URL State
- New file: `src/hooks/useStorage.js` — localStorage hook + URL hash encoding
- Saves: activeTab, selectedSlot, typeFilter, raidOnly, showCatalyst, lootLog, weeklyReset
- URL format: `#tab=raid&slot=Head&filter=tier`
- **This should be built first** — other modules depend on it

### Module C — Charts & Visuals
- New file: `src/components/UpgradeCharts.jsx`
- DPS% gain bar chart by slot (pure CSS bars, no chart library)
- iLvl by slot vs best available upgrade (from raidSim/mythicSim)
- Added as a collapsible section below SimTable

### Module A — Weekly Reset Tracker
- New file: `src/components/WeeklyTracker.jsx`
- Boss kill checkboxes (from raidBossPriority data)
- M+ run counter per dungeon
- Vault slot tracker (3 slots: raid/m+/world)
- Countdown to weekly reset (Tuesday 09:00 UTC for EU)
- Persisted via useStorage hook

### Module B — Catalyst Decision Engine
- New file: `src/components/CatalystPlanner.jsx`
- Reads current tier count from gear[] hasTier fields
- Reads catalyst charges from character.catalystCharges
- Ranks non-tier slots by: (sim DPS gain if tier) × (current ilvl gap)
- Outputs: "Catalyst X next — gains Y% DPS, gets you to 2pc"
- Persisted via useStorage hook

### Shareability / Hosting
- Target: Vercel deployment for permanent shareable URL
- Friends can view (read-only) the same dashboard
- No backend needed — static deploy of dist/index.html

### Warcraft Logs Integration (researched, approved)
- Official GraphQL API: `https://www.warcraftlogs.com/api/v2/client`
- Auth: OAuth2 client credentials
- Use case: Pull recent parse history for Whooplol, display in dashboard
- Requires: WCL API client ID + secret (stored in .env, not committed)

### Raidbots Integration (researched)
- No public API exists for sim submission
- Deep-link only: `https://www.raidbots.com/simbot/quick?region=eu&realm=tarren-mill&name=Whooplol`
- Add "Open in Raidbots" button to CharacterHeader

## Agent Guidelines
- **Always run `npm run build` after changes** to verify the standalone HTML still works
- **Never add external CSS frameworks** (Tailwind, Bootstrap, etc.) — hand-rolled CSS only
- **Never add a router** — this is a single-page app, no routing needed
- **Keep components pure** — props in, JSX out. Side effects only in hooks
- **Color additions** go in `src/index.css` as CSS variables, not inline styles
- **New components** go in `src/components/` and must be imported in `App.jsx`
- **Data changes** go in `src/data.json` only — no hardcoded data in components
- **Test the build** — run `npm run build` and confirm `dist/index.html` opens in a browser
