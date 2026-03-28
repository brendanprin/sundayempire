# MVP Release Readiness Checklist

## Purpose

This checklist captures the MVP readiness baseline assembled in Sprint 12 and kept current afterward. It defines the hard gates, current regression and smoke evidence, retained compatibility surfaces, and the final signoff recommendation.

## Release Candidate Metadata

Fill this in for each release candidate:

| Field | Value |
| --- | --- |
| Candidate date | `2026-03-22` |
| Commit / branch | `main @ b683607` |
| Environment | `local` |
| Prisma datasource | `file:./dev.db` |
| Runbook owner | `Codex` |

## P0 Release Gates

These gates must pass before any MVP signoff discussion.

- [x] `npm run db:reset`
- [x] `npm run verify:migrations`
- [x] `npm run verify:hygiene`
- [x] `npm run build`
- [x] `npm run verify:mvp-regression`
- [x] `npm run verify:mvp-shadow`

### Migration Health Rule

Migration status is a hard release gate.

- If `npm run verify:migrations` fails, stop immediately.
- On local development databases, run `npm run db:reset` and retry once.
- If migration status still fails after a clean reset, log a `P0` blocker and do not continue with signoff or smoke execution.
- Do not treat `prisma db execute` as a substitute for a clean migration history. Direct SQL can unblock a local scratch database, but it does not satisfy release readiness.

## Current Regression Gates

- [x] `npm run test:suite -- lifecycle`
- [x] `npm run test:suite -- sprint2`
- [x] `npm run test:suite -- sprint3`
- [x] `npm run test:suite -- sprint4`
- [x] `npm run test:suite -- sprint5`
- [x] `npm run test:suite -- sprint6`
- [x] `npm run test:suite -- sprint7`
- [x] `npm run test:suite -- sprint8`
- [x] `npm run test:suite -- sprint9`
- [x] `npm run test:suite -- sprint10`
- [x] `npm run test:suite -- sprint11`

The canonical aggregate command is `npm run verify:mvp-regression`.

## Current Smoke Gates

Run these with the app server up on `http://127.0.0.1:3100`:

```bash
PORT=3100 NEW_LIFECYCLE_ENGINE=1 npm run dev
```

Then execute:

- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 1`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 2`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 3`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 6`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 7`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 8`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 9`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 10`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:phase -- 11`
- [x] `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp`
- [x] `PORT=3100 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 NEW_LIFECYCLE_ENGINE=1 npm run verify:mvp-shadow`

## Dress Rehearsal Gates

These are now covered by the Sprint 12 rehearsal harness and supporting fixture pass.

- [x] lifecycle transitions
- [x] manager dashboard -> team detail -> previews
- [x] trade build -> submit -> review
- [x] rookie draft setup -> room -> select/pass
- [x] veteran auction setup -> room -> bid -> award
- [x] sync run -> mismatch resolution/escalation
- [x] activity feed and commissioner audit visibility
- [x] `BASE_URL=http://127.0.0.1:3100 npm run fixtures:demo`

## Retained Compatibility Surfaces

These paths are intentionally retained for MVP compatibility or low-risk deferment. They are not the canonical release surface unless stated otherwise.

| Surface | Status | MVP gating | Notes |
| --- | --- | --- | --- |
| Legacy trade compatibility routes under `/api/trades/*` | retained partially | no | `/api/trades/[tradeId]/process` was removed in Sprint 15 PR1; commissioner settlement/audit now use canonical proposal routes. |
| `PilotEvent` telemetry stream | retained | no | Telemetry only, not manager activity history. |
| Notification compatibility batching | retained | no | Inbox-only signal, not history source. |
| `NEW_LIFECYCLE_ENGINE` flag | retained | yes for commissioner lifecycle reads | Enable during readiness and smoke runs to match canonical behavior. |

See also [mvp-compatibility-audit.md](./mvp-compatibility-audit.md) for the current safe-to-retain vs non-gating legacy inventory.

## Blocker Log

| Severity | Workflow / area | Issue | Owner | Disposition | Notes |
| --- | --- | --- | --- | --- | --- |
| `P0` | readiness baseline | `db:reset` double-seeded the local DB | Codex | fixed | `package.json` now uses `prisma migrate reset --skip-seed` before `db:seed`. |
| `P1` | early smoke scripts | `phase1-3` assumed pre-auth commissioner mutations and omitted required reasons | Codex | fixed | Updated to use the seeded commissioner and active league context. |
| `P1` | canonical trade rehearsal | `phase7` assumed only straight-through accepted proposals | Codex | fixed | Rehearsal now handles both direct acceptance and review-pending submit states safely. |
| `P1` | rehearsal gating | legacy rookie/trade process smokes (`phase4`, `phase5`) were blocking canonical MVP paths | Codex | fixed | They were first reclassified as non-gating, then removed in Sprint 14 after canonical coverage proved sufficient. |
| `P1` | post-rehearsal reads | final activity/audit readback intermittently hit fetch-level failures after long smoke runs | Codex | fixed | Sprint 12 rehearsal now retries the full activity/audit visibility step on transient fetch errors. |

## Final Recommendation

Choose one:

- [x] Recommend MVP signoff
- [ ] Recommend signoff with caveats
- [ ] Do not recommend signoff yet

### Residual Risks

- Legacy compatibility paths remain in the repo by design, especially the remaining non-canonical `/api/trades/*` lanes plus the retained `/diagnostics` utility. They are classified as non-gating and should be cleaned up post-MVP rather than during release hardening.
- Sprint 14 removed the old `smoke:phase4` and `smoke:phase5` compatibility scripts after canonical draft and trade coverage proved sufficient.
- Sprint 15 later retired startup draft execution and the legacy draft selection/undo routes once canonical rookie and auction flows fully covered supported draft operations.
- Sprint 15 later retired `/contracts` and `/picks` as standalone utilities by moving their operator tasks into `Commissioner Operations` and `Picks & Draft`.

### Signoff Notes

- `npm run verify:release-readiness` passed on `2026-03-22`.
- `BASE_URL=http://127.0.0.1:3100 npm run fixtures:demo` passed on `2026-03-22`.
- `BASE_URL=http://127.0.0.1:3100 npm run smoke:mvp` passed on `2026-03-22`.
