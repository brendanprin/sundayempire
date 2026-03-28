import assert from "node:assert/strict";
import test from "node:test";
import { ContractStatus } from "@prisma/client";
import { computeActiveCapTotal } from "@/lib/domain/contracts/active-cap-calculator";
import {
  computeDeadCapSchedule,
  computeDeadCapTotal,
} from "@/lib/domain/contracts/dead-cap-calculator";
import { computeFranchiseTagSalary } from "@/lib/domain/contracts/franchise-tag-calculator";
import { computeHardCapTotal } from "@/lib/domain/contracts/hard-cap-calculator";

test("active, dead, and hard cap calculators use authoritative ledgered values", () => {
  const activeCapTotal = computeActiveCapTotal([
    { annualSalary: 25, ledgerStatus: ContractStatus.ACTIVE },
    { annualSalary: 18, ledgerStatus: ContractStatus.TAGGED },
    { annualSalary: 14, ledgerStatus: ContractStatus.EXPIRED },
  ]);
  const deadCapTotal = computeDeadCapTotal([
    { systemCalculatedAmount: 10, adjustedAmount: null },
    { systemCalculatedAmount: 6, adjustedAmount: 8 },
  ]);

  assert.equal(activeCapTotal, 43);
  assert.equal(deadCapTotal, 18);
  assert.equal(computeHardCapTotal(activeCapTotal, deadCapTotal), 61);
});

test("dead cap calculator shifts timing after the trade deadline", () => {
  assert.deepEqual(
    computeDeadCapSchedule({
      annualSalary: 20,
      yearsRemaining: 3,
      afterTradeDeadline: false,
      retired: false,
    }),
    [
      { seasonOffset: 0, amount: 20 },
      { seasonOffset: 1, amount: 10 },
    ],
  );

  assert.deepEqual(
    computeDeadCapSchedule({
      annualSalary: 20,
      yearsRemaining: 3,
      afterTradeDeadline: true,
      retired: false,
    }),
    [
      { seasonOffset: 1, amount: 20 },
      { seasonOffset: 2, amount: 10 },
    ],
  );
});

test("franchise tag calculator uses the higher of top-tier average or 120 percent of prior salary", () => {
  const result = computeFranchiseTagSalary({
    position: "WR",
    priorSalary: 17,
    comparableSalaries: [31, 29, 28, 26, 24, 22, 21, 20, 19, 18, 16],
  });

  assert.equal(result.calculatedTopTierAverage, 25);
  assert.equal(result.calculated120PercentSalary, 21);
  assert.equal(result.finalTagSalary, 25);
});
