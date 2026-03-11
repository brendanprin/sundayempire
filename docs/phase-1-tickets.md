# Phase 1 Ticket Backlog (Small/Medium Stories)

## Scope
Phase 1 covers core data management:
- League, Team, Player, Contract, and Pick CRUD
- Initial pages (`/teams`, `/teams/[teamId]`, `/players`, `/contracts`, `/picks`)
- Transaction audit records on write operations

## Ticket Format
- Size: `S` (0.5-1 day), `M` (1-2 days)
- Points: Fibonacci-ish (`1`, `2`, `3`, `5`)

## Tickets

### P1-01 - Initialize Prisma Client and DB Lifecycle
- Size: `S`
- Points: `2`
- Description: Wire Prisma client singleton and baseline migration workflow for SQLite.
- Acceptance Criteria:
- `prisma/schema.prisma` is usable through app-side Prisma client import.
- Initial migration can be created and applied locally.
- A documented `db:reset` workflow exists for local development.
- Dependencies: none

### P1-02 - Seed League + Season + 12 Teams
- Size: `S`
- Points: `2`
- Description: Add deterministic seed script for one league, one active season, and 12 teams.
- Acceptance Criteria:
- Running seed creates one league and one season if missing.
- Exactly 12 teams are created with stable names/abbreviations.
- Re-running seed is idempotent (no duplicates).
- Dependencies: `P1-01`

### P1-03 - Seed Core Player Pool
- Size: `M`
- Points: `3`
- Description: Add seed routine for representative players across QB/RB/WR/TE/DST.
- Acceptance Criteria:
- Player records include name, position, NFL team, and status defaults.
- Seed can be re-run without duplicate players.
- Seed size is large enough to exercise table sorting/filtering in UI.
- Dependencies: `P1-01`

### P1-04 - Implement Transaction Logging Utility
- Size: `S`
- Points: `2`
- Description: Create a reusable service for appending `Transaction` records from write endpoints.
- Acceptance Criteria:
- Utility supports at least add/drop/contract/pick transfer event types.
- Each write includes `leagueId`, `seasonId`, `type`, `summary`, `createdAt`.
- Utility is covered by a basic unit test or integration test stub.
- Dependencies: `P1-01`

### P1-05 - Build Teams List API (`GET /api/teams`)
- Size: `S`
- Points: `2`
- Description: Return teams with owner, roster count, cap hit, cap space placeholder fields.
- Acceptance Criteria:
- Endpoint returns 12 teams from seed data.
- Response is sorted by team name by default.
- Includes fields required for Teams page table columns.
- Dependencies: `P1-02`

### P1-06 - Build Team Detail APIs
- Size: `M`
- Points: `3`
- Description: Implement `GET /api/teams/:teamId` and `GET /api/teams/:teamId/roster`.
- Acceptance Criteria:
- Team detail includes roster slots, contracts, penalties, and recent transactions.
- Missing or invalid team IDs return typed 404 errors.
- Response shape is stable and typed in shared TS types.
- Dependencies: `P1-02`, `P1-04`

### P1-07 - Build Players API (`GET /api/players`)
- Size: `M`
- Points: `3`
- Description: Implement searchable/filterable players endpoint with query params.
- Acceptance Criteria:
- Supports `search`, `position`, `nflTeam`, `isRestricted`, and rostered/free-agent filtering.
- Supports sorting by name, age, salary, years remaining.
- Endpoint response time is acceptable with seeded data.
- Dependencies: `P1-03`

### P1-08 - Build Contracts APIs (`GET /api/contracts`, `POST /api/contracts`, `PATCH /api/contracts/:id`)
- Size: `M`
- Points: `5`
- Description: Implement core contract read/write endpoints for commissioner actions.
- Acceptance Criteria:
- GET endpoint supports filters for expiring, rookie-option-eligible, and tagged contracts.
- POST creates valid contract records tied to team/player/season.
- PATCH updates salary/years and writes transaction log entries.
- Dependencies: `P1-04`, `P1-06`

### P1-09 - Build Picks APIs (`GET /api/picks`, `PATCH /api/picks/:pickId/owner`)
- Size: `M`
- Points: `3`
- Description: Implement future pick list and ownership transfer endpoint.
- Acceptance Criteria:
- Pick list includes season year, round, original owner, current owner, used state.
- Ownership transfer updates pick and appends transaction log entry.
- Invalid transfer requests return typed validation errors.
- Dependencies: `P1-04`, `P1-02`

### P1-10 - Build Teams Page (`/teams`)
- Size: `S`
- Points: `2`
- Description: Implement teams overview table from `GET /api/teams`.
- Acceptance Criteria:
- Table shows required columns from MVP spec.
- Supports client-side sorting for cap space and roster count.
- Row click routes to `/teams/[teamId]`.
- Dependencies: `P1-05`

### P1-11 - Build Team Detail Page (`/teams/[teamId]`)
- Size: `M`
- Points: `5`
- Description: Build page with roster/contracts/picks/transactions sections and empty action affordances.
- Acceptance Criteria:
- Renders starter/bench/IR groups from API data.
- Shows active contracts and penalties for selected team.
- Displays recent transaction history for selected team.
- Dependencies: `P1-06`

### P1-12 - Build Players Page (`/players`)
- Size: `M`
- Points: `3`
- Description: Implement players table with search, filter, and sorting controls.
- Acceptance Criteria:
- UI controls map to `GET /api/players` query params.
- Free agents and rostered players are visually distinguishable.
- Selecting a rostered player links to owning team.
- Dependencies: `P1-07`

### P1-13 - Build Contracts Page (`/contracts`)
- Size: `M`
- Points: `3`
- Description: Implement contract list page with common filters and basic mutation hooks.
- Acceptance Criteria:
- Can filter by expiring, rookie option eligible, and franchise tagged.
- Mutations refresh list state after success.
- Errors are surfaced in non-blocking UI notifications.
- Dependencies: `P1-08`

### P1-14 - Build Picks Page (`/picks`)
- Size: `S`
- Points: `2`
- Description: Implement pick ownership table page and transfer owner action.
- Acceptance Criteria:
- Table includes required pick fields and status.
- Owner transfer action updates UI and persists via API.
- Transfer action creates a transaction record.
- Dependencies: `P1-09`

### P1-15 - Add Write-Audit Coverage Across Phase 1 Endpoints
- Size: `M`
- Points: `3`
- Description: Ensure every Phase 1 write endpoint appends transaction records consistently.
- Acceptance Criteria:
- Contract create/update and pick transfer write transactions.
- Team roster write actions (if present) write transactions.
- A verification checklist exists in test/docs for audited endpoints.
- Dependencies: `P1-04`, `P1-08`, `P1-09`

### P1-16 - Phase 1 Integration Smoke Test
- Size: `S`
- Points: `2`
- Description: Add an end-to-end local smoke script for key commissioner flows in Phase 1.
- Acceptance Criteria:
- Script validates seeded app -> list teams -> view team -> list players -> list/update contracts -> transfer pick.
- Script exits non-zero on API failures.
- Run instructions are documented.
- Dependencies: `P1-10`, `P1-11`, `P1-12`, `P1-13`, `P1-14`, `P1-15`

## Suggested Sprint Grouping

### Sprint A
- `P1-01` to `P1-06`

### Sprint B
- `P1-07` to `P1-11`

### Sprint C
- `P1-12` to `P1-16`
