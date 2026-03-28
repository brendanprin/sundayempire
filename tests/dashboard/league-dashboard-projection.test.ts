import assert from "node:assert/strict";
import test from "node:test";
import { createLeagueDashboardProjection } from "@/lib/read-models/dashboard/league-dashboard-projection";

test("league dashboard projection summarizes active season and open issue severity", async () => {
  const projection = createLeagueDashboardProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: "Primary workspace",
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "TAG_OPTION_COMPLIANCE",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    team: {
      async count() {
        return 12;
      },
    },
    complianceIssue: {
      async findMany() {
        return [
          {
            severity: "WARNING",
            dueAt: new Date("2026-04-20T00:00:00.000Z"),
          },
          {
            severity: "CRITICAL",
            dueAt: new Date("2026-04-10T00:00:00.000Z"),
          },
        ];
      },
    },
    leaguePhaseTransition: {
      async findFirst() {
        return {
          id: "transition-1",
          fromPhase: "OFFSEASON_ROLLOVER",
          toPhase: "TAG_OPTION_COMPLIANCE",
          occurredAt: new Date("2026-03-01T00:00:00.000Z"),
          reason: "Window opened",
        };
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "active");
  assert.equal(result.season?.currentPhase, "TAG_OPTION_COMPLIANCE");
  assert.equal(result.status.alertLevel, "critical");
  assert.equal(result.status.mirrorOnly, false);
  assert.equal(result.summary.teamCount, 12);
  assert.equal(result.summary.openIssueCount, 2);
  assert.equal(result.summary.overdueIssueCount, 1);
  assert.equal(result.summary.criticalCount, 1);
  assert.equal(result.recentPhaseTransition?.toPhase, "TAG_OPTION_COMPLIANCE");
});

test("league dashboard projection is empty-state safe when active season is unresolved", async () => {
  const projection = createLeagueDashboardProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Unresolved League",
          description: null,
          seasons: [
            {
              id: "season-old",
              year: 2025,
              status: "COMPLETED",
              phase: "PLAYOFFS",
              openedAt: null,
              closedAt: null,
            },
            {
              id: "season-next",
              year: 2026,
              status: "PLANNED",
              phase: "PRESEASON_SETUP",
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    team: {
      async count() {
        return 10;
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    now: new Date("2026-01-10T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "unresolved");
  assert.equal(result.season, null);
  assert.equal(result.status.alertLevel, "setup_required");
  assert.equal(result.status.mirrorOnly, false);
  assert.equal(result.summary.teamCount, 10);
  assert.equal(result.summary.openIssueCount, 0);
  assert.equal(result.recentPhaseTransition, null);
});
