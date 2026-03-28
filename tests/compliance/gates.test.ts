import assert from "node:assert/strict";
import test from "node:test";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { RULE_CODES } from "@/types/compliance";
import { buildBaseValidationContext } from "./fixtures";

test("compliance gate detects newly introduced hard-cap error for contract mutation", () => {
  const beforeContext = buildBaseValidationContext({
    ruleset: {
      salaryCapSoft: 245,
      salaryCapHard: 300,
    },
    contracts: [
      {
        id: "c-safe",
        salary: 120,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: false,
        player: { id: "p-1", name: "Safe Contract", position: "RB" },
      },
    ],
  });

  const afterContext = buildBaseValidationContext({
    ...beforeContext,
    contracts: [
      ...beforeContext.contracts,
      {
        id: "c-bad",
        salary: 250,
        yearsTotal: 1,
        yearsRemaining: 1,
        isFranchiseTag: false,
        player: { id: "p-2", name: "Huge Deal", position: "WR" },
      },
    ],
  });

  const beforeReport = evaluateComplianceFromContext(beforeContext);
  const afterReport = evaluateComplianceFromContext(afterContext);
  const introduced = getIntroducedErrorFindings(beforeReport, afterReport);

  assert.ok(introduced.some((finding) => finding.ruleCode === RULE_CODES.CAP_HARD_EXCEEDED));
});

test("compliance gate ignores pre-existing identical errors", () => {
  const beforeContext = buildBaseValidationContext({
    ruleset: {
      salaryCapSoft: 100,
      salaryCapHard: 120,
    },
    contracts: [
      {
        id: "c-already-bad",
        salary: 130,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: false,
        player: { id: "p-1", name: "Already Bad", position: "RB" },
      },
    ],
  });

  const afterContext = buildBaseValidationContext({
    ...beforeContext,
    contracts: [
      {
        id: "c-already-bad",
        salary: 135,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: false,
        player: { id: "p-1", name: "Already Bad", position: "RB" },
      },
    ],
  });

  const beforeReport = evaluateComplianceFromContext(beforeContext);
  const afterReport = evaluateComplianceFromContext(afterContext);
  const introduced = getIntroducedErrorFindings(beforeReport, afterReport);

  assert.equal(
    introduced.filter((finding) => finding.ruleCode === RULE_CODES.CAP_HARD_EXCEEDED).length,
    0,
  );
});
