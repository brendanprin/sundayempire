# MVP Readiness Runbook

## Purpose

Use this runbook for the current MVP readiness checks. It defines the required command order, the hard stop on migration health, and the current smoke command inventory.

## Prerequisites

- dependencies installed with `npm install`
- local workspace at the candidate commit
- no pending schema edits or uncommitted migration changes

## 1. Reset And Seed

Start from a clean local database:

```bash
npm run db:reset
```

This keeps the base demo seed stable. Do not hand-edit the database before readiness checks.

## 2. Verify Migration Health

Run:

```bash
npm run verify:migrations
```

Rules:

- This is a `P0` gate.
- If it fails, stop immediately.
- First recovery step for local work is another clean `npm run db:reset`.
- If it still fails after a clean reset, log a blocker and do not continue with build, regression, or smoke checks.
- Do not use direct `prisma db execute` commands as a substitute for clean migration state. They can modify a local scratch database, but they do not satisfy release readiness.

## 3. Run The Non-Server Baseline

Run the aggregate baseline:

```bash
npm run verify:release-readiness
```

This currently covers:

- `npm run verify:migrations`
- `npm run verify:hygiene`
- `npm run build`
- `npm run verify:mvp-regression`

This does not yet include server-backed smoke runs or the Playwright shadow lane.

If this fails, record the blocker in [release-readiness.md](../release-readiness.md) and stop triage there before starting smoke runs.

## 4. Start The App For Smoke Runs

Use the canonical local server command:

```bash
PORT=3100 NEW_LIFECYCLE_ENGINE=1 npm run dev
```

Notes:

- `NEW_LIFECYCLE_ENGINE` should remain enabled during readiness checks because commissioner lifecycle reads use that path.
- Smoke scripts assume the app is reachable at `http://127.0.0.1:3100` unless `BASE_URL` is overridden.

## 5. Run Current Smoke Commands

```bash
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 1
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 2
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 3
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 6
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 7
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 8
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 9
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 10
BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 11
BASE_URL=http://127.0.0.1:3100 npm run fixtures:demo
BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp
PORT=3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 NEW_LIFECYCLE_ENGINE=1 npm run verify:mvp-shadow
```

Legacy compatibility smokes `smoke:phase4` and `smoke:phase5` were retired in Sprint 14 after canonical draft and trade coverage proved sufficient.

## 6. Record Evidence

Update:

- [release-readiness.md](../release-readiness.md)
- [release-test-matrix.md](../release-test-matrix.md)

Record:

- exact commands run
- pass/fail status
- notable warnings
- blockers opened

Optional current evidence bundle:

```bash
BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run capture:evidence
```

This writes the current review pack to `artifacts/current-review/evidence` by default. Override `EVIDENCE_SLUG` if you need a sprint-specific folder.

## 7. Blocker Handling

Use these rules:

- `P0`: stop signoff work, fix immediately, rerun the affected baseline and smoke coverage
- `P1`: fix in Sprint 12 if small and clearly release-relevant; otherwise document as a caveat
- `P2+`: document and defer unless it blocks a canonical MVP workflow

## 8. What This Runbook Does Not Do Yet

- It does not add or remove legacy compatibility paths.
- It does not replace the base seed with scenario-heavy fixtures.
- It does not make the full legacy Playwright suite a release gate.

Legacy/prototype retention is tracked separately in [mvp-compatibility-audit.md](../mvp-compatibility-audit.md).
