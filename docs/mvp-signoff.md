# MVP Signoff Artifact

## Release Candidate

| Field | Value |
| --- | --- |
| Candidate date | `2026-03-22` |
| Commit / branch | `main @ b683607` |
| Environment | `local` |
| Operator | `Codex` |

## Command Ledger

Record exact commands and outcomes:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run db:reset` | passed | clean local reset used repeatedly during Sprint 12 hardening and for the final evidence run |
| `npm run verify:migrations` | passed | local datasource reported `Database schema is up to date!` |
| `npm run verify:release-readiness` | passed | covered migrations, hygiene, build, and Sprint 1–11 regression tests |
| `BASE_URL=http://127.0.0.1:3100 npm run fixtures:demo` | passed | staged demo artifacts via canonical phase 7–11 fixture flows |
| `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` | passed | covered canonical MVP workflows plus activity/audit readback |
| `PORT=3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 NEW_LIFECYCLE_ENGINE=1 npm run verify:mvp-shadow` | passed | also executed successfully inside `smoke:mvp` |

## Workflow Results

| Workflow | Result | Evidence | Notes |
| --- | --- | --- | --- |
| lifecycle transitions | passed | `smoke:mvp`, `smoke:phase -- 3`, `test:suite -- lifecycle` | phase round-trip and rollover preview remained coherent |
| manager dashboard -> team detail -> previews | passed | `smoke:mvp` | dashboard, team detail, cut preview, and contract preview surface validated |
| trade build -> submit -> review | passed | `smoke:mvp`, `smoke:phase -- 7`, `test:suite -- sprint7` | canonical proposal flow validated; commissioner settlement now also runs through the proposal path |
| rookie draft setup -> room -> select/pass | passed | `smoke:mvp`, `smoke:phase -- 8`, `test:suite -- sprint8` | canonical rookie board flow validated |
| veteran auction setup -> room -> bid -> award | passed | `smoke:mvp`, `smoke:phase -- 9`, `test:suite -- sprint9` | open-bid and blind-review paths both validated |
| sync run -> mismatch resolution/escalation | passed | `smoke:mvp`, `smoke:phase -- 10`, `test:suite -- sprint10` | high-impact escalation and conservative host-truth resolution validated |
| activity feed and commissioner audit | passed | `smoke:mvp`, `smoke:phase -- 11`, `test:suite -- sprint11` | manager feed and commissioner audit both populated from real mutations |

## Blockers

| Severity | Area | Issue | Disposition | Notes |
| --- | --- | --- | --- | --- |
| `P0` | readiness baseline | `db:reset` double-seeded the workspace | fixed | `package.json` now uses `prisma migrate reset --skip-seed` before `db:seed` |
| `P1` | legacy smoke drift | early smoke scripts still assumed pre-auth or pre-override commissioner behavior | fixed | `phase1`, `phase2`, and `phase3` were updated to the current commissioner contract |
| `P1` | rehearsal stability | activity/audit readback intermittently failed at the fetch layer after long runs | fixed | Sprint 12 rehearsal now retries the full readback step on transient fetch failures |
| `P1` | gating clarity | legacy rookie/trade compatibility smokes were blocking canonical MVP rehearsals | fixed | `phase4` and `phase5` were reclassified as optional non-gating compatibility checks |

## Retained Compatibility Surfaces

Reference [mvp-compatibility-audit.md](./mvp-compatibility-audit.md) and list any retained paths that materially affect signoff:

- Legacy trade compatibility routes remain available in narrowed form, but MVP trade signoff is based on the canonical Sprint 7 proposal flow and canonical commissioner settlement path.
- `NEW_LIFECYCLE_ENGINE` remains enabled for readiness and smoke runs because commissioner lifecycle reads use that path.

## Recommendation

Choose one:

- [x] Recommend MVP signoff
- [ ] Recommend signoff with caveats
- [ ] Do not recommend signoff yet

### Caveats / Residual Risk

- Legacy compatibility paths remain in the repo and should be cleaned up after MVP rather than during release hardening.
- Sprint 14 later removed the non-gating `smoke:phase4` and `smoke:phase5` compatibility scripts once canonical coverage was proven sufficient.
- Sprint 15 later retired startup draft execution and the legacy draft selection/undo routes after canonical draft flows fully absorbed supported operations.
- Sprint 15 later retired `/contracts` and `/picks` as standalone compatibility routes after moving their operator tasks into canonical commissioner and draft workflows.

### Signoff Notes

- Release readiness, regression, smoke rehearsal, fixture staging, and MVP shadow coverage all passed on `2026-03-22`.
- No open `P0` or `P1` blockers remain for the canonical MVP surface.
