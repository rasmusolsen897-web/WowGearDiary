# WowGearDiary

WowGearDiary is a React + Vite guild management app for a small WoW friend group. It combines a single-page client, Vercel serverless APIs, and Supabase/KV-backed shared state so the guild can see live gear, parses, sims, and progression history in one place.

## Core Stack

- React 18 + Vite 5
- Vercel serverless functions in `api/`
- Supabase for character and history data
- Vercel KV for guild metadata
- Plain CSS in `src/index.css`

## Commands

```bash
npm run dev
npm test
npm run build
npm run build:vercel
npm run verify
```

`npm run verify` is the repository-level definition of done for routine changes. It runs tests plus both production build targets.

## Working Agreement

This repo now follows a lightweight SWE playbook adapted from the ideas in `obra/superpowers`:

1. Plan before changing code when the task is non-trivial.
2. Prefer small, vertical changes over broad refactors.
3. Default to test-first for behavior changes.
4. Verify before claiming success.
5. Keep docs in sync when architecture or workflow changes.

Project-specific rules and context live in the docs below instead of being duplicated in multiple agent files.

## Docs

- `docs/project-context.md` - architecture, data flow, constraints, and source-of-truth project context
- `docs/engineering-playbook.md` - adapted SWE rules, workflow, definition of done, and change hygiene
- `PROJECT_STATUS.md` - current system snapshot and known debt
- `TODO.md` - prioritized backlog
- `docs/SESSION_LOG.md` - session handoff notes

## Project Constraints

- No TypeScript migration by default
- No router unless the product shape materially changes
- No UI framework; styling stays hand-rolled CSS
- Third-party APIs must stay behind `api/` serverless functions
- `src/data.json` remains the source of truth for Whooplol-specific static data

## Environment

See `.env.example` for required variables. The important server-side secrets are Blizzard, Warcraft Logs, Supabase, and guild write-token credentials.
