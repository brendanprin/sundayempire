# Dynasty League Tool - MVP Specification

## 1. Product Scope

### Objective
Build a local-first commissioner tool that runs a 12-team dynasty contract league using the league constitution as enforceable system rules.

### In Scope (MVP)
- League setup and rule configuration
- Team, roster, contract, and draft-pick management
- Constitution compliance validation
- Commissioner workflows (trades, cuts, contracts, season rollover)
- Core draft room (manual pick entry + available player board)

### Out of Scope (MVP)
- Real-time multi-user collaboration
- Native integration with external fantasy APIs
- Advanced simulation engine
- Public owner portal auth/permissions beyond single local admin

## 2. User Roles

- Commissioner (primary MVP user): full CRUD and enforcement controls
- Owner (future): read-heavy views with limited action permissions

## 3. Page Requirements

## 3.1 Dashboard (`/`)

### Purpose
Single-screen league operations summary.

### Required Widgets
- League snapshot: current season, cap settings, trade deadline week
- Compliance alerts by team
- Cap space by team
- Expiring contracts (next offseason)
- Recent transactions
- Draft pick ownership summary

### Acceptance Criteria
- Displays all 12 teams in cap/compliance widgets
- Alerts are generated from backend validation, not static flags
- Links route to Team, Contracts, Picks, and Commissioner pages

## 3.2 Teams List (`/teams`)

### Purpose
Commissioner overview of all franchises.

### Required Columns
- Team name
- Owner
- Roster count
- Current cap hit
- Cap space
- Compliance status
- Future picks owned (count)

### Acceptance Criteria
- Sortable by cap space, roster count, and compliance status
- Clicking a row opens Team Detail

## 3.3 Team Detail (`/teams/[teamId]`)

### Purpose
Operate one franchise view with roster/contracts context.

### Required Sections
- Starters by slot
- Bench and IR
- Active contracts
- Dead cap penalties
- Picks owned (next 3 drafts)
- Transaction history

### Actions
- Move player between roster slots
- Cut player
- Assign or edit contract
- Tag player (franchise tag validation)

### Acceptance Criteria
- Any action re-runs compliance checks
- Invalid actions return structured error messages

## 3.4 Players (`/players`)

### Purpose
Global player directory and free-agent pool.

### Required Features
- Search by name
- Filters: position, NFL team, rostered/free agent, restricted
- Sort: age, salary, years remaining, projected value
- Bulk import endpoint hook (CSV/JSON)

### Acceptance Criteria
- Free agents are identifiable in one click
- Rostered players link directly to owning team detail

## 3.5 Contracts (`/contracts`)

### Purpose
League-wide contract management.

### Required Views
- All active contracts
- Expiring this offseason
- Rookie option eligible
- Franchise-tagged
- Dead cap penalties by season

### Actions
- Create contract
- Update years/salary (admin-only)
- Exercise rookie option
- Apply franchise tag

### Acceptance Criteria
- Contract updates enforce max years and salary rules
- Every mutation records a transaction log entry

## 3.6 Draft Picks (`/picks`)

### Purpose
Track rookie and future pick ownership.

### Required Fields
- Season year
- Round
- Original owner
- Current owner
- Pick status (available, traded, used)

### Acceptance Criteria
- Pick transfers reflect immediately in both teams
- Historical ownership chain is preserved

## 3.7 Draft Room (`/draft`)

### Purpose
Run a commissioner-controlled draft session.

### Required Features
- Active draft session metadata (type, clock state, current pick)
- Available player board with filters
- Pick log
- Manual pick entry
- Optional pick-owner reassignment before selection

### Acceptance Criteria
- Pick cannot be submitted if already used
- Draft pick writes roster assignment + contract defaults when applicable

## 3.8 Trades (`/trades`)

### Purpose
Analyze and process trades with constitutional enforcement.

### Required Features
- Trade builder (assets from Team A and Team B)
- Legality check before submit
- Cap impact preview
- Post-trade roster count preview
- Trade status list (proposed, approved, processed, rejected)

### Acceptance Criteria
- Processing blocked when either team becomes illegal
- Successful process creates player/pick ownership updates + transactions

## 3.9 Rules (`/rules`)

### Purpose
Structured constitution settings editor.

### Editable Groups
- Roster/lineup
- Salary cap and waiver restrictions
- Contracts and rookie options
- Trade windows and deadlines
- IR settings

### Acceptance Criteria
- Rule updates are versioned
- Validation logic reads latest active rule set

## 3.10 Commissioner (`/commissioner`)

### Purpose
Administrative workflows.

### Required Tools
- Run compliance scan (all teams)
- Force roster/cap correction
- Advance league phase (preseason, regular, playoffs, offseason)
- Run offseason rollover (expire contracts, process deadlines)
- Import/export snapshots

### Acceptance Criteria
- Every admin action is logged with timestamp and payload summary

## 4. Rules Engine Requirements

### Must Enforce in MVP
- Roster size max (default 17)
- Lineup slot legality
- Salary cap soft/hard thresholds
- Waiver bid restrictions at/above soft cap
- Contract year bounds (1-4; sub-$10 max 3 years)
- Rookie contract + option behavior
- Franchise tag constraints
- Trade deadline window
- IR eligibility flags and slot count

### Validation Output Contract
Each check returns:
- `ruleCode`
- `severity` (`error` or `warning`)
- `message`
- `teamId` (nullable for global checks)
- `context` JSON

## 5. Initial API Endpoints (v1)

## 5.1 League and Rules
- `GET /api/league` - fetch league + current season summary
- `PATCH /api/league` - update league metadata
- `GET /api/rules` - fetch active rule set
- `PATCH /api/rules` - update and version rule set

## 5.2 Teams and Rosters
- `GET /api/teams` - list teams with cap/compliance rollups
- `POST /api/teams` - create team
- `GET /api/teams/:teamId` - team detail
- `GET /api/teams/:teamId/roster` - roster + slots + contracts
- `PATCH /api/teams/:teamId/roster` - slot moves, add/drop
- `GET /api/teams/:teamId/compliance` - latest validation results

## 5.3 Players
- `GET /api/players` - searchable player list
- `POST /api/players/import` - import players from CSV/JSON payload
- `PATCH /api/players/:playerId` - update player metadata/status

## 5.4 Contracts and Cap
- `GET /api/contracts` - contracts with filters
- `POST /api/contracts` - assign contract
- `PATCH /api/contracts/:contractId` - modify contract
- `POST /api/contracts/:contractId/exercise-option` - apply rookie option
- `POST /api/contracts/:contractId/franchise-tag` - apply tag
- `GET /api/cap/teams/:teamId` - cap detail (active + dead cap)

## 5.5 Picks and Draft
- `GET /api/picks` - list pick ownership
- `PATCH /api/picks/:pickId/owner` - transfer ownership
- `POST /api/drafts` - create draft session
- `GET /api/drafts/:draftId` - draft board state
- `POST /api/drafts/:draftId/picks` - submit pick
- `POST /api/drafts/:draftId/undo` - commissioner undo last pick

## 5.6 Trades
- `POST /api/trades/analyze` - legality + cap/roster impact only
- `POST /api/trades` - create proposal
- `GET /api/trades` - list trades
- `POST /api/trades/:tradeId/process` - execute approved trade
- `POST /api/trades/:tradeId/reject` - reject proposal

## 5.7 Commissioner Operations
- `POST /api/commissioner/compliance/run` - run league-wide scan
- `POST /api/commissioner/rollover` - offseason rollover workflow
- `GET /api/transactions` - global audit log

## 6. Non-Functional Requirements

- Local-first: app runs fully offline with SQLite
- Deterministic validation: same input always yields same compliance result
- Auditability: every mutation writes transaction log
- Recoverability: export/import database snapshot from commissioner tools

## 7. MVP Exit Criteria

MVP is complete when:
- Commissioner can create and maintain league/team/player/contract data
- App can detect and report illegal team states
- Commissioner can run rookie draft workflow end-to-end
- Trades can be analyzed and processed with enforcement
- Offseason rollover executes without manual DB editing
