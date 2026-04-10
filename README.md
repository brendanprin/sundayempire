# SundayEmpire

Dynasty fantasy football league operations platform. Built for commissioners who run contract-based leagues — validates trades, enforces salary caps, tracks future picks, and manages the full season lifecycle.

## Features

- **Contract management** — player contracts, salary cap (soft + hard), dead cap, franchise tags, and rookie options
- **Trade compliance** — real-time rule validation before a trade is proposed or processed
- **Draft management** — rookie drafts, startup drafts, veteran auctions, and pick ownership tracking
- **Commissioner tools** — audit log, emergency fixes, roster sync, player refresh, and override controls
- **Season lifecycle** — phases from preseason through playoffs with configurable deadlines and rule sets
- **Owner portal** — team dashboard, notifications, trade inbox/history, and activity feed

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite via Prisma |
| Styling | Tailwind CSS v4 |
| Testing | Playwright (E2E + smoke) |

## Local Setup

**Prerequisites:** Node.js 20+

1. Install dependencies:

```bash
npm install
```

2. Copy and configure environment variables:

```bash
cp .env.example .env
```

3. Create or refresh the local database:

```bash
npm run db:reset
```

4. Verify migration health before any readiness or smoke run:

```bash
npm run verify:migrations
```

If this fails, stop and fix migration state before continuing. Do not use `prisma db execute` as a substitute for a clean migration state.

5. Start the app:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

6. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite path (default: `file:./dev.db`) |
| `BASE_URL` | App base URL (default: `http://127.0.0.1:3000`) |
| `DEV_AUTH_EMAIL` | Dev-mode fallback identity when auth header is omitted |
| `APP_ENV` | Deployment environment (`local`, `staging`, `production`) |
| `APP_VERSION` | App version string |

## Auth

- Open [`/login`](http://127.0.0.1:3000/login) to switch the active demo session.
- Pick a commissioner or owner identity and click `Sign In`.
- Use the `Switch User` control in the left sidebar to change roles later.
- E2E and API override headers (`x-dynasty-user-email`) take precedence when explicitly provided.

## Common Commands

```bash
# Development
npm run dev
npm run build
npm run lint

# Database
npm run db:generate
npm run db:migrate -- --name <migration_name>
npm run db:seed
npm run db:reset

# Verification
npm run verify:migrations
npm run verify:hygiene
npm run verify:mvp-regression
npm run verify:release-readiness    # Full pre-release check

# Testing
npm run test:e2e                    # All Playwright E2E tests
npm run test:e2e:ui                 # Playwright UI mode
npm run test:smoke                  # Smoke tests only

# Smoke phases (requires local app server running)
npm run smoke:phase -- <phase>      # Supported: 1, 2, 3, 6, 7, 8, 9, 10, 11
npm run smoke:mvp                   # Canonical MVP dress-rehearsal entrypoint
npm run verify:mvp-shadow

# Demo fixtures and evidence
npm run fixtures:demo
npm run capture:evidence
```

`smoke:mvp` runs the supported phase smokes, dashboard/team-detail preview checks, and the MVP Playwright shadow lane.

## Project Structure

```
src/
  app/               # Next.js App Router pages
    (account)/       # My leagues, new league
    (app)/           # Main app (dashboard, trades, contracts, draft, commissioner)
    (auth)/          # Login, invite acceptance, league selection
  components/        # Shared UI components
  lib/
    domain/          # Core business logic (contracts, trades, draft, compliance, lifecycle)
    repositories/    # Data access layer
    read-models/     # Projections for dashboard, team, player views
    compliance/      # Rule validation engine
  types/             # Shared TypeScript types
prisma/
  schema.prisma      # Database schema
  migrations/        # Migration history
  seed.ts            # Demo data seed
tests/
  e2e/               # Playwright end-to-end tests
  compliance/        # Unit tests for compliance validators and gates
```

## Key Domain Concepts

- **League** — top-level container; has teams, seasons, and a rule set
- **Season** — yearly context with a phase (`PRESEASON`, `REGULAR`, `PLAYOFFS`, `OFFSEASON`)
- **Contract** — player-to-team binding with salary, years, and rookie/franchise-tag flags
- **RosterSlot** — weekly roster assignments (starters, IR, bench)
- **FuturePick** — tradeable draft picks with original and current ownership
- **Trade** — two-team asset exchange subject to a compliance gate before settlement
- **LeagueRuleSet** — versioned configuration for cap limits, roster sizes, contract rules, and deadlines

## Documentation

- Docs index: [docs/README.md](./docs/README.md)
- Release readiness checklist: [docs/release-readiness.md](./docs/release-readiness.md)
- Release test matrix: [docs/release-test-matrix.md](./docs/release-test-matrix.md)
- MVP readiness runbook: [docs/runbooks/mvp-readiness-runbook.md](./docs/runbooks/mvp-readiness-runbook.md)
- MVP compatibility audit: [docs/mvp-compatibility-audit.md](./docs/mvp-compatibility-audit.md)
- MVP signoff template: [docs/mvp-signoff.md](./docs/mvp-signoff.md)
- Legacy route disposition: [docs/sprint-14-legacy-route-disposition.md](./docs/sprint-14-legacy-route-disposition.md)
- UI conformance baseline: [docs/ui-conformance/sprint-13-screen-conformance-matrix.md](./docs/ui-conformance/sprint-13-screen-conformance-matrix.md)
