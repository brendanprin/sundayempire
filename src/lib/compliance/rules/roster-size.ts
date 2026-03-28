import { TeamValidationContext } from "@/lib/compliance/context";
import { toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { buildRuleResult } from "@/lib/compliance/rules/shared";
import { RULE_CODES, RuleResult } from "@/types/compliance";

export function validateRosterSize(context: TeamValidationContext): RuleResult[] {
  const rosterCount = context.rosterSlots.length;
  const maxRosterSize = context.ruleset.rosterSize;

  const findings: RuleResult[] = [];

  if (rosterCount > maxRosterSize) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.ROSTER_SIZE_EXCEEDED,
        severity: "error",
        message: `${context.team.name} has ${rosterCount} players, exceeding roster limit of ${maxRosterSize}.`,
        context: {
          rosterCount,
          maxRosterSize,
        },
      }),
    );
  }

  if (toLegacyLeaguePhase(context.season.phase) === "PRESEASON" && rosterCount < maxRosterSize) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.ROSTER_BELOW_TARGET,
        severity: "warning",
        message: `${context.team.name} has ${rosterCount} players and is below preseason target of ${maxRosterSize}.`,
        context: {
          rosterCount,
          targetRosterSize: maxRosterSize,
          seasonPhase: context.season.phase,
        },
      }),
    );
  }

  return findings;
}
