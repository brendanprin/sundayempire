import assert from "node:assert/strict";
import test from "node:test";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";

test("team season state recalculation derives roster count and cap totals deterministically", async () => {
  const calls: {
    countWhere?: unknown;
    upsertData?: unknown;
  } = {};

  const service = createTeamSeasonStateRecalculationService({
    rosterAssignment: {
      async count(args: { where: unknown }) {
        calls.countWhere = args.where;
        return 17;
      },
    },
    teamSeasonState: {
      async upsert(args: { create: unknown; update: unknown }) {
        calls.upsertData = args;
        return args;
      },
    },
  } as never, {
    financialStateService: {
      async computeTeamSeasonFinancials() {
        return {
          activeCapTotal: 228,
          deadCapTotal: 12,
          hardCapTotal: 240,
          backfillGaps: [],
        };
      },
    },
  });

  await service.recalculateTeamSeasonState({
    teamId: "team-1",
    seasonId: "season-1",
  });

  assert.deepEqual(calls.countWhere, {
    teamId: "team-1",
    seasonId: "season-1",
    endedAt: null,
    rosterStatus: {
      in: ["ACTIVE", "IR", "MIRRORED_ONLY"],
    },
  });

  const upsertData = calls.upsertData as {
    create: {
      rosterCount: number;
      activeCapTotal: number;
      deadCapTotal: number;
      hardCapTotal: number;
    };
    update: {
      rosterCount: number;
      activeCapTotal: number;
      deadCapTotal: number;
      hardCapTotal: number;
    };
  };
  assert.equal(upsertData.create.rosterCount, 17);
  assert.equal(upsertData.create.activeCapTotal, 228);
  assert.equal(upsertData.create.deadCapTotal, 12);
  assert.equal(upsertData.create.hardCapTotal, 240);
  assert.equal(upsertData.update.rosterCount, 17);
  assert.equal(upsertData.update.activeCapTotal, 228);
  assert.equal(upsertData.update.deadCapTotal, 12);
  assert.equal(upsertData.update.hardCapTotal, 240);
});
