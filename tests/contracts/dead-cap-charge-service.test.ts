import assert from "node:assert/strict";
import test from "node:test";
import { createDeadCapChargeService } from "@/lib/domain/contracts/dead-cap-charge-service";

test("cut dead cap service creates ledger rows and compatibility penalties", async () => {
  const deadCapUpserts: unknown[] = [];
  const penaltyCreates: unknown[] = [];

  const service = createDeadCapChargeService({
    contract: {
      async findUnique() {
        return {
          id: "contract-1",
          seasonId: "season-2025",
          teamId: "team-1",
          playerId: "player-1",
          salary: 24,
          yearsRemaining: 4,
          status: "ACTIVE",
        };
      },
    },
    season: {
      async findUnique() {
        return {
          id: "season-2025",
          leagueId: "league-1",
          year: 2025,
        };
      },
      async findMany() {
        return [
          { id: "season-2025", year: 2025 },
          { id: "season-2026", year: 2026 },
          { id: "season-2027", year: 2027 },
        ];
      },
    },
    deadCapCharge: {
      async upsert(args: unknown) {
        deadCapUpserts.push(args);
        return args;
      },
    },
    capPenalty: {
      async deleteMany() {
        return { count: 0 };
      },
      async create(args: unknown) {
        penaltyCreates.push(args);
        return args;
      },
    },
  } as never);

  const result = await service.applyCutDeadCap({
    leagueId: "league-1",
    teamId: "team-1",
    seasonId: "season-2025",
    contractId: "contract-1",
    playerId: "player-1",
    playerInjuryStatus: null,
    afterTradeDeadline: false,
  });

  assert.equal(result.retired, false);
  assert.equal(result.chargeCount, 2);
  assert.equal(deadCapUpserts.length, 2);
  assert.equal(penaltyCreates.length, 2);

  const firstUpsert = deadCapUpserts[0] as {
    create: {
      appliesToSeasonId: string;
      systemCalculatedAmount: number;
    };
  };
  const secondUpsert = deadCapUpserts[1] as {
    create: {
      appliesToSeasonId: string;
      systemCalculatedAmount: number;
    };
  };
  assert.equal(firstUpsert.create.appliesToSeasonId, "season-2025");
  assert.equal(firstUpsert.create.systemCalculatedAmount, 24);
  assert.equal(secondUpsert.create.appliesToSeasonId, "season-2026");
  assert.equal(secondUpsert.create.systemCalculatedAmount, 18);
});
