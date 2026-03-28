import assert from "node:assert/strict";
import test from "node:test";
import { createActivitySummaryProjection } from "@/lib/read-models/dashboard/activity-summary-projection";

test("activity summary projection reads recent team transactions and latest commissioner note", async () => {
  const projection = createActivitySummaryProjection({
    transaction: {
      async findMany() {
        return [
          {
            id: "tx-1",
            type: "CONTRACT_UPDATE",
            summary: "Updated contract terms for Player One.",
            createdAt: new Date("2026-04-02T12:00:00.000Z"),
            team: { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
            player: { id: "player-1", name: "Player One", position: "WR" },
          },
        ];
      },
    },
    commissionerOverride: {
      async findFirst() {
        return {
          id: "override-1",
          overrideType: "MANUAL_RULING",
          reason: "Approved temporary roster exception.",
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
          team: { name: "Cap Casualties" },
          actorUser: { name: "Commissioner", email: "commissioner@example.com" },
        };
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    now: new Date("2026-04-03T00:00:00.000Z"),
  });

  assert.equal(result.scope, "team");
  assert.equal(result.recentActivity.length, 1);
  assert.equal(result.recentActivity[0]?.type, "CONTRACT_UPDATE");
  assert.equal(result.commissionerNote?.reason, "Approved temporary roster exception.");
  assert.equal(result.emptyStateReason, null);
});

test("activity summary projection returns empty-state reason when no activity exists", async () => {
  const projection = createActivitySummaryProjection({
    transaction: {
      async findMany() {
        return [];
      },
    },
    commissionerOverride: {
      async findFirst() {
        return null;
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    now: new Date("2026-04-03T00:00:00.000Z"),
  });

  assert.equal(result.scope, "league");
  assert.deepEqual(result.recentActivity, []);
  assert.equal(result.commissionerNote, null);
  assert.equal(result.emptyStateReason, "No recent league activity or commissioner notes.");
});
