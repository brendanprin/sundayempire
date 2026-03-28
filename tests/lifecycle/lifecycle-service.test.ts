import assert from "node:assert/strict";
import test from "node:test";
import { createLifecycleService } from "@/lib/domain/lifecycle/service";

test("lifecycle service reads the active season and current-phase deadlines", async () => {
  const service = createLifecycleService({
    async getLeagueLifecycleRecord() {
      return {
        id: "league-1",
        name: "Test League",
        seasons: [
          {
            id: "season-planned",
            year: 2026,
            status: "PLANNED",
            phase: "PRESEASON_SETUP",
            openedAt: null,
            closedAt: null,
          },
          {
            id: "season-active",
            year: 2025,
            status: "ACTIVE",
            phase: "REGULAR_SEASON",
            openedAt: new Date("2025-01-01T00:00:00.000Z"),
            closedAt: null,
          },
        ],
      };
    },
    async getSeasonDeadlines() {
      return [
        {
          id: "deadline-1",
          leagueId: "league-1",
          seasonId: "season-active",
          phase: "REGULAR_SEASON",
          deadlineType: "REGULAR_SEASON_OPEN",
          scheduledAt: new Date("2025-09-01T17:00:00.000Z"),
          sourceType: "CONSTITUTION_DEFAULT",
          reminderOffsetsJson: [14, 7, 1],
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      ];
    },
    async getRecentPhaseTransitions() {
      return [
        {
          id: "transition-1",
          leagueId: "league-1",
          seasonId: "season-active",
          fromPhase: "AUCTION_MAIN_DRAFT",
          toPhase: "REGULAR_SEASON",
          initiatedByUserId: "user-1",
          initiatedByType: "COMMISSIONER",
          reason: null,
          transitionStatus: "SUCCESS",
          occurredAt: new Date("2025-08-15T17:00:00.000Z"),
          createdAt: new Date("2025-08-15T17:00:00.000Z"),
        },
      ];
    },
  } as never);

  const result = await service.readLeagueLifecycle("league-1");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.season.id, "season-active");
  assert.equal(result.data.currentPhase, "REGULAR_SEASON");
  assert.equal(result.data.nextPhase, "PLAYOFFS");
  assert.equal(result.data.deadlines.length, 1);
  assert.equal(result.data.deadlines[0]?.phase, "REGULAR_SEASON");
  assert.equal(result.data.blockers.length, 0);
});

test("lifecycle service rejects leagues without exactly one active season", async () => {
  const service = createLifecycleService({
    async getLeagueLifecycleRecord() {
      return {
        id: "league-1",
        name: "Broken League",
        seasons: [
          {
            id: "season-1",
            year: 2025,
            status: "ACTIVE",
            phase: "REGULAR_SEASON",
            openedAt: null,
            closedAt: null,
          },
          {
            id: "season-2",
            year: 2026,
            status: "ACTIVE",
            phase: "PRESEASON_SETUP",
            openedAt: null,
            closedAt: null,
          },
        ],
      };
    },
    async getSeasonDeadlines() {
      return [];
    },
    async getRecentPhaseTransitions() {
      return [];
    },
  } as never);

  const result = await service.readLeagueLifecycle("league-1");
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "ACTIVE_SEASON_NOT_RESOLVED");
});
