# WowGearDiary Agent Guide

Use this file as the short entrypoint, not the long-form source of truth.

## Read First

- `docs/project-context.md`
- `docs/engineering-playbook.md`
- `PROJECT_STATUS.md`

## Repo Rules

- Plan first for any non-trivial change
- Default to test-first for behavior changes
- Run `npm run verify` before claiming success
- Keep external API access in `api/`
- Do not introduce a router, TypeScript migration, or CSS framework unless the task explicitly requires it
- Update docs when architecture or workflow changes

## Project Constraints

- Single-page React app with conditional rendering
- Hand-rolled CSS only
- Whooplol static planning data lives in `src/data.json`
- Both `build` and `build:vercel` must remain healthy
