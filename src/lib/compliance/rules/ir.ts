import { TeamValidationContext } from "@/lib/compliance/context";
import { buildRuleResult } from "@/lib/compliance/rules/shared";
import { RULE_CODES, RuleResult } from "@/types/compliance";

const IR_ELIGIBLE_STATUSES = new Set([
  "IR",
  "INJURED_RESERVE",
  "RESERVE_INJURED",
  "RESERVE/PUP",
  "PUP",
  "OUT",
]);

function isIrEligible(injuryStatus: string | null): boolean {
  if (!injuryStatus) {
    return false;
  }

  const normalized = injuryStatus.trim().toUpperCase();
  return IR_ELIGIBLE_STATUSES.has(normalized);
}

export function validateIrRules(context: TeamValidationContext): RuleResult[] {
  const findings: RuleResult[] = [];
  const irSlots = context.rosterSlots.filter((slot) => slot.slotType === "IR");

  if (irSlots.length > context.ruleset.irSlots) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.IR_SLOT_EXCEEDED,
        severity: "error",
        message: `${context.team.name} has ${irSlots.length} players in IR slots, max is ${context.ruleset.irSlots}.`,
        context: {
          irSlotCount: irSlots.length,
          maxIrSlots: context.ruleset.irSlots,
          rosterSlotIds: irSlots.map((slot) => slot.id),
        },
      }),
    );
  }

  for (const irSlot of irSlots) {
    if (!isIrEligible(irSlot.player.injuryStatus)) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.IR_PLAYER_INELIGIBLE,
          severity: "error",
          message: `${irSlot.player.name} is in an IR slot without an IR-eligible injury status.`,
          context: {
            rosterSlotId: irSlot.id,
            playerId: irSlot.player.id,
            injuryStatus: irSlot.player.injuryStatus,
          },
        }),
      );
    }
  }

  return findings;
}
