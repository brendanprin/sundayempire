# Dynasty League Tool - Roadmap

## Guiding Principle
Ship a commissioner-usable product early, then layer decision support after core enforcement is reliable.

## Phase 0 - Project Bootstrap

### Goals
- Initialize Next.js (App Router) + TypeScript
- Add Tailwind + shadcn/ui base components
- Add Prisma + SQLite wiring
- Create base app shell and navigation

### Deliverables
- Running local app
- Seeded local database
- Shared layout (`Dashboard`, `Teams`, `Players`, `Contracts`, `Picks`, `Draft`, `Trades`, `Rules`, `Commissioner`)

### Exit Criteria
- `npm run dev` boots UI and can read seeded data

## Phase 1 - Core Data Management

### Goals
- Implement League, Team, Player, Contract, and Pick CRUD
- Build initial pages: Teams, Team Detail, Players, Contracts, Picks
- Add transaction audit records on writes

### Deliverables
- Team overview table with cap rollups
- Team detail with roster + contracts
- Player list with search/filter
- Contract list with expiration filters
- Pick ownership table

### Exit Criteria
- Commissioner can manually maintain all core league entities in-app

## Phase 2 - Constitution Rules Engine

### Goals
- Implement rule evaluation service using active `LeagueRuleSet`
- Add compliance API and UI flags
- Block invalid mutations (roster, contract, trade)

### Deliverables
- Validation library for roster/lineup/cap/contracts/trade-window rules
- Team compliance view
- Global compliance scan endpoint

### Exit Criteria
- Illegal states are detectable and surfaced consistently across pages

## Phase 3 - Commissioner Operations

### Goals
- Build league administration workflows
- Add phase transitions and offseason rollover
- Add commissioner overrides with explicit logging

### Deliverables
- Commissioner dashboard
- Rollover endpoint/UI (contract expiration + option/tag actions)
- Manual corrections for roster/cap emergency handling

### Exit Criteria
- Commissioner can run preseason through offseason without direct DB edits

## Phase 4 - Draft Room MVP

### Goals
- Run rookie/startup draft sessions in-app
- Manage pick clock state manually
- Apply draft selections to roster/contracts

### Deliverables
- Draft session creation and board screen
- Available player board
- Pick entry + undo last pick
- Draft log and used-pick protections

### Exit Criteria
- League can complete a full rookie draft end-to-end inside the tool

## Phase 5 - Trade Workflow MVP

### Goals
- Implement trade builder + analyzer + processing
- Enforce constitutional legality before processing

### Deliverables
- Trade analyzer endpoint/UI (legality + cap/roster impact)
- Trade proposal list with statuses
- Process/reject actions with audit logs

### Exit Criteria
- Commissioner can process legal trades without manual ownership fixes

## Phase 6 - UX and Reliability

### Goals
- Improve workflow speed and resilience
- Add backup/import/export and quality checks

### Deliverables
- CSV/JSON import utilities
- Snapshot export/import
- Error boundaries and validation messaging polish
- Basic test coverage for rule engine and critical APIs

### Exit Criteria
- Local restore path exists and critical rule regressions are test-protected

## Milestone Checklist

1. M1: Core entities operational (Phase 1)
2. M2: Constitution enforcement operational (Phase 2)
3. M3: Commissioner lifecycle workflows operational (Phase 3)
4. M4: Draft fully runnable (Phase 4)
5. M5: Trades fully enforceable and processable (Phase 5)

## Backlog References

- Phase 1 ticket backlog: [docs/phase-1-tickets.md](/Users/brendanprin/workspace/personal/dynasty-football/docs/phase-1-tickets.md)

## Suggested Build Cadence

1. Week 1: Phase 0 + start Phase 1
2. Week 2: complete Phase 1
3. Week 3: Phase 2
4. Week 4: Phase 3
5. Week 5: Phase 4
6. Week 6: Phase 5 + begin Phase 6 polish
