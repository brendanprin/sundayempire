import assert from "node:assert/strict";
import test from "node:test";
import { validateCapCompliance } from "@/lib/compliance/rules/cap";
import { validateContractRules } from "@/lib/compliance/rules/contracts";
import { validateFranchiseTagRules } from "@/lib/compliance/rules/franchise-tag";
import { validateIrRules } from "@/lib/compliance/rules/ir";
import { validateStartingLineup } from "@/lib/compliance/rules/lineup";
import { validateRosterSize } from "@/lib/compliance/rules/roster-size";
import { RULE_CODES } from "@/types/compliance";
import { buildBaseValidationContext } from "./fixtures";

test("validateRosterSize returns error when roster exceeds max", () => {
  const context = buildBaseValidationContext({
    ruleset: {
      rosterSize: 1,
    },
    rosterSlots: [
      {
        id: "rs-1",
        slotType: "BENCH",
        slotLabel: "BENCH1",
        player: { id: "p-1", name: "Player 1", position: "RB", injuryStatus: null },
      },
      {
        id: "rs-2",
        slotType: "BENCH",
        slotLabel: "BENCH2",
        player: { id: "p-2", name: "Player 2", position: "WR", injuryStatus: null },
      },
    ],
  });

  const findings = validateRosterSize(context);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleCode, RULE_CODES.ROSTER_SIZE_EXCEEDED);
});

test("validateStartingLineup catches invalid player position for starter slot", () => {
  const context = buildBaseValidationContext({
    rosterSlots: [
      {
        id: "slot-qb",
        slotType: "STARTER",
        slotLabel: "QB",
        player: { id: "p-1", name: "WR Wrong Slot", position: "WR", injuryStatus: null },
      },
    ],
  });

  const findings = validateStartingLineup(context);
  assert.ok(findings.some((finding) => finding.ruleCode === RULE_CODES.STARTER_POSITION_INVALID));
});

test("validateCapCompliance returns warning and error when both caps are exceeded", () => {
  const context = buildBaseValidationContext({
    ruleset: {
      salaryCapSoft: 100,
      salaryCapHard: 120,
    },
    contracts: [
      {
        id: "c-1",
        salary: 80,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: false,
        player: { id: "p-1", name: "Cap One", position: "RB" },
      },
      {
        id: "c-2",
        salary: 70,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: false,
        player: { id: "p-2", name: "Cap Two", position: "WR" },
      },
    ],
  });

  const findings = validateCapCompliance(context);
  assert.ok(findings.some((finding) => finding.ruleCode === RULE_CODES.CAP_SOFT_EXCEEDED));
  assert.ok(findings.some((finding) => finding.ruleCode === RULE_CODES.CAP_HARD_EXCEEDED));
});

test("validateContractRules catches sub-$10 overlength contracts", () => {
  const context = buildBaseValidationContext({
    contracts: [
      {
        id: "c-sub10",
        salary: 5,
        yearsTotal: 4,
        yearsRemaining: 4,
        isFranchiseTag: false,
        player: { id: "p-1", name: "Sub Ten", position: "RB" },
      },
    ],
  });

  const findings = validateContractRules(context);
  assert.ok(
    findings.some((finding) => finding.ruleCode === RULE_CODES.CONTRACT_SUB_TEN_YEARS_INVALID),
  );
});

test("validateFranchiseTagRules catches excess tags and invalid tag years", () => {
  const context = buildBaseValidationContext({
    contracts: [
      {
        id: "c-tag-1",
        salary: 20,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: true,
        player: { id: "p-1", name: "Tag One", position: "RB" },
      },
      {
        id: "c-tag-2",
        salary: 22,
        yearsTotal: 1,
        yearsRemaining: 1,
        isFranchiseTag: true,
        player: { id: "p-2", name: "Tag Two", position: "WR" },
      },
    ],
  });

  const findings = validateFranchiseTagRules(context);
  assert.ok(
    findings.some((finding) => finding.ruleCode === RULE_CODES.FRANCHISE_TAG_COUNT_EXCEEDED),
  );
  assert.ok(
    findings.some(
      (finding) => finding.ruleCode === RULE_CODES.FRANCHISE_TAG_CONTRACT_YEARS_INVALID,
    ),
  );
});

test("validateIrRules catches IR ineligible players", () => {
  const context = buildBaseValidationContext({
    rosterSlots: [
      {
        id: "ir-slot-1",
        slotType: "IR",
        slotLabel: "IR1",
        player: { id: "p-1", name: "Healthy Player", position: "RB", injuryStatus: null },
      },
    ],
  });

  const findings = validateIrRules(context);
  assert.ok(findings.some((finding) => finding.ruleCode === RULE_CODES.IR_PLAYER_INELIGIBLE));
});
