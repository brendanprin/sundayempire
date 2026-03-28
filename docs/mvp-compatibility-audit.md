# MVP Compatibility And Prototype Audit

## Purpose

This document classifies the current feature flags, compatibility shims, prototype-era paths, and stale-but-retained workflows that remain in the repo at MVP signoff time.

## Feature Flags

| Flag | File | Scope | MVP status | Notes |
| --- | --- | --- | --- | --- |
| `NEW_LIFECYCLE_ENGINE` | `src/lib/feature-flags.ts` | commissioner lifecycle read surface | retained and enabled during readiness | This is still part of the canonical readiness path. It does not gate lifecycle storage or compatibility shims globally. |

## Compatibility Shims

| Shim | File | Scope | MVP gating | Notes |
| --- | --- | --- | --- | --- |
| canonical/legacy phase mapping | `src/lib/domain/lifecycle/phase-compat.ts` | older phase consumers | yes | Safe to keep for MVP; risky to remove before post-release cleanup. |
| PilotEvent notification batching | `src/app/api/notifications/route.ts` | inbox compatibility | no | `Notification` remains inbox-only, `PilotEvent` remains telemetry-only. |
| proposal-first trade dashboard summary | `src/lib/application/dashboard/get-league-landing-dashboard.ts` | dashboard trade summary | yes | Sprint 14 PR2 removed legacy trade blending; the dashboard now points only into canonical proposal flows. |

## Retained Prototype Or Legacy Paths

### Retained but non-canonical

| Surface | File or route | Why retained | MVP gating |
| --- | --- | --- | --- |
| legacy trade compatibility routes | `src/app/api/trades/*` | older tests and compatibility surface | no |
| legacy trade helper stack | `src/lib/trades.ts` | compatibility-only helper surface retained for older non-canonical trade CRUD/read lanes | no |
| `PilotEvent` telemetry routes | `src/app/api/commissioner/analytics/events/route.ts` | telemetry only | no |

### Retained and still canonical for a bounded area

| Surface | File or route | Why retained | MVP gating |
| --- | --- | --- | --- |
| legacy hygiene inventory | `scripts/verify-hygiene.ts` | still valuable for older deprecation paths, but not a complete MVP compatibility audit | yes, with limitation |

## E2E Suite Classification

| Category | Examples | MVP gating | Notes |
| --- | --- | --- | --- |
| canonical MVP shadow | `tests/e2e/mvp-shadow.spec.ts` | yes | Narrow route-render and navigation checks for current canonical surfaces. |
| legacy/prototype trade flows | `tests/e2e/trades-workflows.spec.ts` | no | Older pre-Sprint 7 trade behavior still has bounded compatibility coverage. |

## Sprint 18 Legacy Cleanup Closure

### Closed Issues (No Longer Applicable)

Sprint 18 Epic Legacy Cleanup successfully addressed language, component, and fencing gaps that made canonical UX feel operator-driven.

| Component | Previous Issue | Resolution | Evidence |
|-----------|---------------|------------|-----------|
| Rules page | "Operational Guide" pilot language | PR18-1: Updated to "League Guide" | tests/e2e/rules-deadlines-conformance.spec.ts |
| Team detail | "Team Workspace" architecture term | PR18-1: Updated to "My Team" | tests/e2e/team-roster-cap-workspace.spec.ts |
| Player detail | "Player Decision Page" internal jargon | PR18-1: Updated to "Player Detail" | tests/e2e/player-contract-detail-conformance.spec.ts |
| Trade builder | "Proposal Workflow" process language | PR18-1: Updated to "Trade Builder" | tests/e2e/trades-conformance.spec.ts |
| Trade review | Generic "Trades" vs specific function | PR18-1: Updated to "Trade Review" | tests/e2e/trades-conformance.spec.ts |
| Trades home | "Workflow Home" process language | PR18-1: Updated to "Trades" | tests/e2e/trades-conformance.spec.ts |
| Settings page | Canonical vs compatibility visual parity | PR18-2: Enhanced canonical prominence with green accent | src/app/(app)/settings/page.tsx |
| RetiredRouteFence | CanonicalRouteState vs PageHeaderBand inconsistency | PR18-2: Migrated to PageHeaderBand patterns | src/components/layout/retired-route-fence.tsx |
| CanonicalRouteState | Missing accessibility announcements | PR18-2: Added aria-live and focus management | src/components/layout/canonical-route-state.tsx |

### New Regression Prevention (Added in Sprint 18)

| Test File | Prevention Focus | Critical Guards |
|-----------|-----------------|-----------------|
| canonical-language-regression.spec.ts | Pilot/operator language return | Validates no forbidden terms in canonical routes |
| compatibility-fencing-validation.spec.ts | Compatibility overshadowing canonical | Ensures canonical routes remain primary |
| shell-component-consistency.spec.ts | Component pattern drift | Maintains PageHeaderBand ecosystem consistency |
| sprint-18-final-conformance.spec.ts | End-to-end epic objectives | Comprehensive Sprint 18 validation |

### Retained Compatibility Items (Still Valid)

| Component | Compatibility Purpose | MVP Status | Validation |

- `scripts/phase4-smoke.ts` and `scripts/phase5-smoke.ts` were removed in Sprint 14 PR3.
- `src/lib/trade-acceleration.ts`, `/api/trades/recommendations`, and `/api/trades/counter-offers` were removed in Sprint 14 PR3.
- Planning, Collaboration, and Recaps are no longer retained prototype workflows; direct links now land on retirement notices instead.
- Sprint 15 PR1 removed `/api/trades/[tradeId]/process` after commissioner settlement and audit consumers moved onto the canonical proposal path.
- Commissioner trade settlement now runs through `/api/commissioner/trades/[proposalId]/settle`, and audit filtering supports canonical `proposalId` lookups.
- Sprint 15 PR2 retired `/draft/startup` into the canonical draft launcher and removed the old `draft-workspace.tsx` startup execution surface.
- Sprint 15 PR2 retired `/api/drafts/[draftId]/selections` and `/api/drafts/[draftId]/undo` behind explicit `410` responses after cutting remaining scripts and tests over to typed rookie routes.
- Sprint 15 PR3 retired `/contracts` and `/picks` as standalone compatibility utilities by embedding contract maintenance into `Commissioner Operations` and pick ownership transfer into `Picks & Draft`.

## Known Non-Gating Test Drift

| Surface | File or route | Why retained | MVP gating |
| --- | --- | --- | --- |
| stale activity/notification expectations | `tests/e2e/activity-feed-role-visibility.spec.ts`, `tests/e2e/notification-signal-mode.spec.ts` | Event names and feed semantics changed in Sprint 11. | no |

## Guardrails

- Do not delete remaining legacy trade routes or diagnostics utility access unless their remaining compatibility consumers are migrated first.
- Do not repurpose `PilotEvent` into manager-facing activity or commissioner audit.
- Do not broaden the MVP shadow suite into a proxy for the full E2E suite. Keep it narrow and canonical.
- Treat this audit as a classification artifact, not a cleanup mandate.
