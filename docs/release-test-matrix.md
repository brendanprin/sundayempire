# MVP Release Test Matrix

## Purpose

This matrix tracks the executable regression and smoke coverage for MVP release readiness, plus the planned dress rehearsals that still need a single end-to-end harness.

## Latest Evidence Snapshot

Recorded on `2026-03-22`:

- `npm run verify:release-readiness`: passed
- `BASE_URL=http://127.0.0.1:3100 npm run fixtures:demo`: passed
- `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp`: passed
- `PORT=3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 NEW_LIFECYCLE_ENGINE=1 npm run verify:mvp-shadow`: passed
- `BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run capture:evidence`: passed
- Sprint 14 retired the legacy `smoke:phase4` and `smoke:phase5` compatibility scripts after canonical draft and trade coverage proved sufficient.

## Current Executable Gates

| Area | Workflow | Risk | Actor | Preconditions | Command or route | Expected result | Evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ops | Migration health | P0 | commissioner / operator | local DB reset or deployed DB up to date | `npm run verify:migrations` | Prisma reports no unapplied migrations | `2026-03-22 clean local reset` | passed | Stop immediately on failure. |
| Ops | Readiness baseline | P0 | operator | migration health clean | `npm run verify:release-readiness` | hygiene, build, and regression aggregate all pass | `2026-03-22 local run passed` | passed | This is the canonical non-server gate. |
| Lifecycle | Phase transition rules | P0 | commissioner | seeded league present | `npm run test:suite -- lifecycle` | lifecycle reads and transitions remain coherent |  | pending | |
| Team / roster | Team membership, roster, team state | P0 | commissioner / owner | seeded league present | `npm run test:suite -- sprint2` | team/roster state remains authoritative |  | pending | |
| Finance | Contract and ledger behavior | P0 | commissioner | seeded league present | `npm run test:suite -- sprint3` | contract finance remains stable |  | pending | |
| Compliance | Compliance, overrides, notifications | P0 | commissioner | seeded league present | `npm run test:suite -- sprint4` | compliance detection and overrides remain stable |  | pending | |
| Dashboard | Landing dashboard | P1 | commissioner / owner | seeded league present | `npm run test:suite -- sprint5` | dashboard projections remain stable |  | pending | |
| Detail / previews | Team, player, rules detail and previews | P1 | commissioner / owner | seeded league present | `npm run test:suite -- sprint6` | detail and preview read models remain stable |  | pending | |
| Trades | Proposal workflow | P0 | owner / commissioner | seeded league present | `npm run test:suite -- sprint7` | canonical proposal workflow remains stable |  | pending | No dedicated smoke script yet. |
| Rookie draft | Setup and room state | P0 | commissioner | seeded league present | `npm run test:suite -- sprint8` | rookie draft services and projections remain stable |  | pending | |
| Veteran auction | Pool, bidding, awards | P0 | commissioner / owner | seeded league present | `npm run test:suite -- sprint9` | veteran auction services remain stable |  | pending | |
| Sync | CSV/manual sync and mismatch flow | P0 | commissioner | seeded league present | `npm run test:suite -- sprint10` | sync jobs and mismatch handling remain stable |  | pending | |
| Activity / audit | Activity feed and commissioner audit | P1 | commissioner / owner | seeded league present | `npm run test:suite -- sprint11` | durable activity and audit projections remain stable |  | pending | |

## Current Smoke Coverage

Run these with:

```bash
PORT=3100 NEW_LIFECYCLE_ENGINE=1 npm run dev
```

| Area | Workflow | Risk | Actor | Preconditions | Command or route | Expected result | Evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sprint 1 | Lifecycle smoke | P0 | commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 1` | lifecycle smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 2 | Team / roster smoke | P0 | commissioner / owner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 2` | team/roster smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 3 | Contract / finance smoke | P0 | commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 3` | finance smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 6 | Detail / preview smoke | P1 | owner / commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 6` | detail smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 7 | Trade proposal smoke | P0 | owner + commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 7` | accepted, commissioner-reviewed, and commissioner-settled proposal flows pass | `2026-03-22 local run passed` | passed | Canonical Sprint 7 trade rehearsal. |
| Sprint 8 | Rookie draft smoke | P0 | commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 8` | rookie setup and room smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 9 | Veteran auction smoke | P0 | commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 9` | auction smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 10 | Sync smoke | P0 | commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 10` | sync smoke passes | `2026-03-22 local run passed` | passed | |
| Sprint 11 | Activity / audit smoke | P1 | commissioner | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 11` | activity and audit smoke passes | `2026-03-22 local run passed` | passed | |
| MVP UI | Canonical route shadow | P1 | commissioner / owner | local server on `3100` | `PORT=3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 NEW_LIFECYCLE_ENGINE=1 npm run verify:mvp-shadow` | canonical MVP routes render for owner and commissioner | `2026-03-22 local run passed` | passed | Narrow shadow lane only. |

## Dress Rehearsal Coverage

| Area | Workflow | Risk | Actor | Preconditions | Command or route | Expected result | Evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fixtures | Demo scenario enrichment | P1 | operator | local server on `3100` | `BASE_URL=http://127.0.0.1:3100 npm run fixtures:demo` | durable demo artifacts are staged on top of the stable base seed | `2026-03-22 local run passed` | passed | Post-seed fixture layer only. |
| Lifecycle | Commissioner season transition | P0 | commissioner | seeded league, clean migration state | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | phase transition updates rules, activity, and audit coherently | `2026-03-22 local run passed` | passed | Canonical Sprint 12 dress rehearsal. |
| Team detail | Dashboard -> team detail -> previews | P0 | owner | seeded league, local server | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | detail reads stay pure and previews remain non-mutating | `2026-03-22 local run passed` | passed | Included in `smoke:mvp`. |
| Trades | Build -> submit -> review | P0 | owner + commissioner | seeded proposal-ready league | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | proposal flow works through canonical Sprint 7 paths, including commissioner settlement | `2026-03-22 local run passed` | passed | Included in `smoke:mvp`. |
| Rookie draft | Setup -> room -> select/pass | P0 | commissioner | seeded rookie-eligible league | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | rookie board advances correctly | `2026-03-22 local run passed` | passed | Included in `smoke:mvp`. |
| Veteran auction | Setup -> room -> bid -> award | P0 | commissioner + owner | seeded auction-eligible league | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | auction bidding and award flow remain stable | `2026-03-22 local run passed` | passed | Included in `smoke:mvp`. |
| Sync | Run -> resolve -> escalate | P0 | commissioner | seeded mismatch fixture | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | sync queue and escalation remain deterministic | `2026-03-22 local run passed` | passed | Included in `smoke:mvp`. |
| Activity / audit | League feed and commissioner audit | P1 | owner + commissioner | real mutations from rehearsal | `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | feed and audit show expected records | `2026-03-22 local run passed` | passed | Included in `smoke:mvp`. |
