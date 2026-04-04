# WowGearDiary Claude Context

Start with these docs instead of maintaining duplicated project lore here:

- `docs/project-context.md`
- `docs/engineering-playbook.md`
- `PROJECT_STATUS.md`

## Operating Rules

- Clarify and plan before broad changes
- Favor small, vertical slices over refactors for their own sake
- Use test-first thinking for behavior changes when practical
- Verify with `npm run verify` before calling work complete
- Keep docs aligned with architectural or workflow changes

## Project-Specific Guardrails

- No router by default
- No CSS framework by default
- No direct browser calls to third-party APIs with secrets
- Keep Whooplol-specific static data in `src/data.json`
