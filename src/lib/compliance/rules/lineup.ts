import { TeamValidationContext } from "@/lib/compliance/context";
import { buildRuleResult } from "@/lib/compliance/rules/shared";
import { RULE_CODES, RuleResult } from "@/types/compliance";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

function makeSlotLabels(prefix: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [prefix];
  }
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function getExpectedStarterSlotCounts(context: TeamValidationContext): Record<string, number> {
  const labels = [
    ...makeSlotLabels("QB", context.ruleset.starterQb),
    ...makeSlotLabels("QB_FLEX", context.ruleset.starterQbFlex),
    ...makeSlotLabels("RB", context.ruleset.starterRb),
    ...makeSlotLabels("WR", context.ruleset.starterWr),
    ...makeSlotLabels("TE", context.ruleset.starterTe),
    ...makeSlotLabels("FLEX", context.ruleset.starterFlex),
    ...makeSlotLabels("DST", context.ruleset.starterDst),
  ];

  return labels.reduce<Record<string, number>>((accumulator, label) => {
    accumulator[label] = 1;
    return accumulator;
  }, {});
}

function allowedPositionsForSlotLabel(slotLabel: string): Position[] {
  if (slotLabel === "QB_FLEX" || slotLabel.startsWith("QB_FLEX")) {
    return ["QB", "RB", "WR", "TE"];
  }
  if (slotLabel === "QB" || /^QB\d+$/.test(slotLabel)) {
    return ["QB"];
  }
  if (slotLabel === "RB" || /^RB\d+$/.test(slotLabel)) {
    return ["RB"];
  }
  if (slotLabel === "WR" || /^WR\d+$/.test(slotLabel)) {
    return ["WR"];
  }
  if (slotLabel === "TE" || /^TE\d+$/.test(slotLabel)) {
    return ["TE"];
  }
  if (slotLabel === "FLEX" || /^FLEX\d+$/.test(slotLabel)) {
    return ["RB", "WR", "TE"];
  }
  if (slotLabel === "DST" || /^DST\d+$/.test(slotLabel)) {
    return ["DST"];
  }
  return [];
}

function expectedStarterTotal(context: TeamValidationContext): number {
  return (
    context.ruleset.starterQb +
    context.ruleset.starterQbFlex +
    context.ruleset.starterRb +
    context.ruleset.starterWr +
    context.ruleset.starterTe +
    context.ruleset.starterFlex +
    context.ruleset.starterDst
  );
}

export function validateStartingLineup(context: TeamValidationContext): RuleResult[] {
  const findings: RuleResult[] = [];
  const starters = context.rosterSlots.filter((slot) => slot.slotType === "STARTER");
  const expectedStarterSlotCounts = getExpectedStarterSlotCounts(context);
  const requiredStarterCount = expectedStarterTotal(context);

  if (starters.length !== requiredStarterCount) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.STARTER_COUNT_MISMATCH,
        severity: "error",
        message: `${context.team.name} has ${starters.length} starters, expected ${requiredStarterCount}.`,
        context: {
          starterCount: starters.length,
          requiredStarterCount,
        },
      }),
    );
  }

  const startersByLabel = new Map<string, number>();
  for (const starter of starters) {
    if (!starter.slotLabel) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.STARTER_SLOT_INVALID,
          severity: "error",
          message: `${starter.player.name} is a starter without a slot label.`,
          context: {
            rosterSlotId: starter.id,
            playerId: starter.player.id,
          },
        }),
      );
      continue;
    }

    startersByLabel.set(starter.slotLabel, (startersByLabel.get(starter.slotLabel) ?? 0) + 1);

    const allowedPositions = allowedPositionsForSlotLabel(starter.slotLabel);
    if (allowedPositions.length === 0) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.STARTER_SLOT_INVALID,
          severity: "error",
          message: `${context.team.name} has invalid starter slot label "${starter.slotLabel}".`,
          context: {
            rosterSlotId: starter.id,
            slotLabel: starter.slotLabel,
          },
        }),
      );
      continue;
    }

    if (!allowedPositions.includes(starter.player.position)) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.STARTER_POSITION_INVALID,
          severity: "error",
          message: `${starter.player.name} (${starter.player.position}) is not eligible for ${starter.slotLabel}.`,
          context: {
            rosterSlotId: starter.id,
            slotLabel: starter.slotLabel,
            playerId: starter.player.id,
            playerPosition: starter.player.position,
            allowedPositions,
          },
        }),
      );
    }
  }

  for (const [slotLabel, expectedCount] of Object.entries(expectedStarterSlotCounts)) {
    const actualCount = startersByLabel.get(slotLabel) ?? 0;
    if (actualCount !== expectedCount) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.STARTER_SLOT_INVALID,
          severity: "error",
          message: `${context.team.name} has ${actualCount} instances of ${slotLabel}, expected ${expectedCount}.`,
          context: {
            slotLabel,
            expectedCount,
            actualCount,
          },
        }),
      );
    }
  }

  return findings;
}
