import assert from "node:assert/strict";
import test from "node:test";
import { createTeamFinancialStateServiceWithDependencies } from "@/lib/domain/contracts/team-financial-state-service";

test("readTeamSeasonFinancials stays side-effect free", async () => {
  const calls = {
    ensureLedgerCoverage: 0,
    ensureDeadCapCoverage: 0,
  };

  const service = createTeamFinancialStateServiceWithDependencies(
    {
      contractSeasonLedger: {
        async findMany() {
          return [
            { annualSalary: 100, ledgerStatus: "ACTIVE" },
            { annualSalary: 25, ledgerStatus: "TAGGED" },
            { annualSalary: 40, ledgerStatus: "TERMINATED" },
          ];
        },
      },
      deadCapCharge: {
        async findMany() {
          return [
            { systemCalculatedAmount: 12, adjustedAmount: null },
            { systemCalculatedAmount: 8, adjustedAmount: 5 },
          ];
        },
      },
    } as never,
    {
      ledgerService: {
        async ensureTeamSeasonLedgerCoverage() {
          calls.ensureLedgerCoverage += 1;
        },
      },
      deadCapChargeService: {
        async ensureLegacyDeadCapCoverage() {
          calls.ensureDeadCapCoverage += 1;
          return { gaps: [] };
        },
      },
    },
  );

  const financials = await service.readTeamSeasonFinancials({
    teamId: "team-1",
    seasonId: "season-1",
  });

  assert.equal(financials.activeCapTotal, 125);
  assert.equal(financials.deadCapTotal, 17);
  assert.equal(financials.hardCapTotal, 142);
  assert.deepEqual(financials.backfillGaps, []);
  assert.equal(calls.ensureLedgerCoverage, 0);
  assert.equal(calls.ensureDeadCapCoverage, 0);
});

test("computeTeamSeasonFinancials still repairs coverage before reading", async () => {
  const calls = {
    ensureLedgerCoverage: 0,
    ensureDeadCapCoverage: 0,
  };

  const service = createTeamFinancialStateServiceWithDependencies(
    {
      season: {
        async findUnique() {
          return {
            id: "season-1",
            leagueId: "league-1",
          };
        },
      },
      contractSeasonLedger: {
        async findMany() {
          return [{ annualSalary: 150, ledgerStatus: "ACTIVE" }];
        },
      },
      deadCapCharge: {
        async findMany() {
          return [{ systemCalculatedAmount: 15, adjustedAmount: null }];
        },
      },
    } as never,
    {
      ledgerService: {
        async ensureTeamSeasonLedgerCoverage() {
          calls.ensureLedgerCoverage += 1;
        },
      },
      deadCapChargeService: {
        async ensureLegacyDeadCapCoverage() {
          calls.ensureDeadCapCoverage += 1;
          return { gaps: ["missing-contract-history"] };
        },
      },
    },
  );

  const financials = await service.computeTeamSeasonFinancials({
    teamId: "team-1",
    seasonId: "season-1",
  });

  assert.equal(financials.activeCapTotal, 150);
  assert.equal(financials.deadCapTotal, 15);
  assert.equal(financials.hardCapTotal, 165);
  assert.deepEqual(financials.backfillGaps, ["missing-contract-history"]);
  assert.equal(calls.ensureLedgerCoverage, 1);
  assert.equal(calls.ensureDeadCapCoverage, 1);
});
