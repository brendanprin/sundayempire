import assert from "node:assert/strict";
import test from "node:test";
import { createRookieOptionService } from "@/lib/domain/contracts/rookie-option-service";

test("rookie option service records the exercised decision and syncs the current season ledger", async () => {
  const optionDecisions: unknown[] = [];
  const createdLedgers: unknown[] = [];

  let contract = {
    id: "contract-1",
    seasonId: "season-1",
    teamId: "team-1",
    playerId: "player-1",
    salary: 5,
    yearsTotal: 1,
    yearsRemaining: 1,
    endYear: 2025,
    rookieOptionEligible: true,
    rookieOptionExercised: false,
    isFranchiseTag: false,
    status: "EXPIRING",
    player: {
      id: "player-1",
      name: "Rookie Player",
    },
    team: {
      id: "team-1",
      name: "Northside Night Owls",
    },
    endedAt: null,
  };

  const service = createRookieOptionService({
    contract: {
      async findUnique() {
        return contract;
      },
      async update(args: {
        data: {
          yearsTotal: number;
          yearsRemaining: number;
          endYear: number;
          rookieOptionEligible: boolean;
          rookieOptionExercised: boolean;
          status: string;
        };
      }) {
        contract = {
          ...contract,
          ...args.data,
        };
        return contract;
      },
    },
    contractOptionDecision: {
      async upsert(args: unknown) {
        optionDecisions.push(args);
        return args;
      },
    },
    contractSeasonLedger: {
      async findUnique() {
        return null;
      },
      async create(args: unknown) {
        createdLedgers.push(args);
        return args;
      },
    },
  } as never);

  const updated = await service.exerciseOption({
    contractId: "contract-1",
    yearsToAdd: 2,
    maxContractYears: 4,
    decidedByUserId: "user-1",
  });

  assert.equal(updated.yearsTotal, 3);
  assert.equal(updated.yearsRemaining, 3);
  assert.equal(updated.rookieOptionExercised, true);
  assert.equal(updated.rookieOptionEligible, false);
  assert.equal(optionDecisions.length, 1);
  assert.equal(createdLedgers.length, 1);
});
