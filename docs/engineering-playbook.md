# Engineering Playbook

This playbook adapts the useful parts of `obra/superpowers` to WowGearDiary without importing a heavyweight agent framework into the product repo.

## Principles

### 1. Plan before coding

For any change that is more than a tiny fix, write down:

- the user or developer problem
- the smallest acceptable solution
- the files likely to change
- how the change will be verified

For non-trivial work, save that plan under `docs/plans/YYYY-MM-DD-short-name.md`.

### 2. Prefer the smallest vertical slice

Solve one behavior end-to-end before widening scope. Avoid broad rewrites unless the rewrite is itself the task.

### 3. Test-first by default

Behavior changes should start with or accompany a failing automated test when practical. This especially applies to:

- backend helpers in `api/_*.js`
- serverless endpoints
- parsing and transformation logic
- bug fixes with a reproducible failure

If a UI change is hard to cover with the current stack, document the manual verification steps in the PR or session log instead of pretending it was fully tested.

### 4. Verify before claiming success

Do not call work done until the current change has fresh verification evidence. The default verification bar is:

```bash
npm run verify
```

If that command cannot run in the current environment, say so explicitly and record what was or was not checked.

### 5. Keep documentation close to the code

When a change affects architecture, workflow, or operational expectations, update the relevant doc in the same change:

- `docs/project-context.md` for structure and constraints
- `PROJECT_STATUS.md` for current system state and known debt
- `TODO.md` for backlog shifts
- `docs/SESSION_LOG.md` for handoff context

## Default Change Flow

1. Understand the problem and write the smallest plan that makes the approach clear.
2. Add or update a test first when behavior is changing and the code is testable.
3. Implement the minimum change needed to satisfy that behavior.
4. Run `npm run verify`.
5. Update docs if the architecture, workflow, or backlog changed.

## Code Organization Rules

- UI code belongs in `src/`
- server and integration code belongs in `api/`
- small shared helpers stay near their owning layer; only extract when reuse is real
- avoid adding abstractions before a second concrete use case exists
- prefer editing existing modules over introducing parallel patterns

## Definition of Done

A routine feature or bug fix is done when:

- the requested behavior exists
- relevant tests exist or the manual-test gap is called out plainly
- `npm run verify` passes, or any blocker is stated with evidence
- any affected docs are updated
- no secrets, machine-local settings, or generated junk were added to git
