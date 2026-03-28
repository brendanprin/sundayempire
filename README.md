# Dynasty Football

Local-first dynasty league operations software for a commissioner-run contract league. The app manages teams, rosters, contracts, picks, drafts, trades, compliance checks, commissioner actions, and snapshot recovery from a single Next.js + Prisma workspace.

## Current Status

The canonical app surface is in place through Sprint 15:

- canonical manager and commissioner flows are live across dashboard, roster/cap, player detail, trades, draft, sync, activity, rules, and commissioner operations
- post-MVP cleanup retired most prototype and compatibility-only routes, leaving only a small bounded troubleshooting surface
- release/readiness docs, smoke harnesses, demo fixtures, and evidence capture are the current operational focus

## Stack

- Next.js App Router
- React 19
- TypeScript
- Prisma
- SQLite

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create or refresh the local database:

```bash
npm run db:reset
```

3. Verify migration health before any readiness or smoke run:

```bash
npm run verify:migrations
```

If this fails, stop and fix migration state before continuing. For local development, start with `npm run db:reset` and rerun the check. Do not treat direct `prisma db execute` commands as a substitute for a clean migration state.

4. Start the app:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Basic Local Auth

- Open [`/login`](http://127.0.0.1:3000/login) to switch the active demo session.
- Pick a commissioner or owner identity and click `Sign In`.
- Use the `Switch User` control in the left sidebar to change roles later.
- E2E and API override headers (`x-dynasty-user-email`) still take precedence when explicitly provided.

## Common Commands

```bash
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:migrate -- --name <migration_name>
npm run db:seed
npm run db:reset
npm run verify:migrations
npm run verify:hygiene
npm run verify:mvp-regression
npm run verify:release-readiness
npm run test:suite -- sprint7
npm run smoke:phase -- 7
npm run capture:evidence
```

Phase smokes expect the local app server to be running. Use `npm run smoke:phase -- <phase>` for the supported lanes `1`, `2`, `3`, `6`, `7`, `8`, `9`, `10`, and `11`:

```bash
npm run smoke:phase -- 1
npm run smoke:phase -- 7
npm run smoke:mvp
npm run verify:mvp-shadow
npm run fixtures:demo
```

`smoke:mvp` is the canonical MVP dress-rehearsal entrypoint. It runs the current supported phase smokes, direct dashboard/team-detail preview checks, and the MVP Playwright shadow lane.

## Documentation

- Docs index: [docs/README.md](./docs/README.md)
- Release readiness checklist: [docs/release-readiness.md](./docs/release-readiness.md)
- Release test matrix: [docs/release-test-matrix.md](./docs/release-test-matrix.md)
- MVP readiness runbook: [docs/runbooks/mvp-readiness-runbook.md](./docs/runbooks/mvp-readiness-runbook.md)
- MVP compatibility audit: [docs/mvp-compatibility-audit.md](./docs/mvp-compatibility-audit.md)
- MVP signoff template: [docs/mvp-signoff.md](./docs/mvp-signoff.md)
- Legacy route disposition: [docs/sprint-14-legacy-route-disposition.md](./docs/sprint-14-legacy-route-disposition.md)
- UI conformance baseline: [docs/ui-conformance/sprint-13-screen-conformance-matrix.md](./docs/ui-conformance/sprint-13-screen-conformance-matrix.md)

## Product Direction

Current delivery focus:

- keep the canonical operator flows simple and obvious
- continue reducing remaining compatibility debt without reopening product scope
- keep readiness, evidence capture, and regression coverage current
