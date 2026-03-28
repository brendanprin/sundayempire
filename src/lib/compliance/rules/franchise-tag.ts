import { TeamValidationContext } from "@/lib/compliance/context";
import { buildRuleResult } from "@/lib/compliance/rules/shared";
import { RULE_CODES, RuleResult } from "@/types/compliance";

export function validateFranchiseTagRules(context: TeamValidationContext): RuleResult[] {
  const findings: RuleResult[] = [];
  const taggedContracts = context.contracts.filter((contract) => contract.isFranchiseTag);

  if (taggedContracts.length > context.ruleset.franchiseTagsPerTeam) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.FRANCHISE_TAG_COUNT_EXCEEDED,
        severity: "error",
        message: `${context.team.name} has ${taggedContracts.length} franchise-tagged contracts, max is ${context.ruleset.franchiseTagsPerTeam}.`,
        context: {
          taggedContracts: taggedContracts.map((contract) => contract.id),
          tagCount: taggedContracts.length,
          maxTagsAllowed: context.ruleset.franchiseTagsPerTeam,
        },
      }),
    );
  }

  for (const taggedContract of taggedContracts) {
    if (taggedContract.yearsTotal !== 1 || taggedContract.yearsRemaining > 1) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.FRANCHISE_TAG_CONTRACT_YEARS_INVALID,
          severity: "error",
          message: `${taggedContract.player.name} is tagged but does not have a valid one-year tag contract.`,
          context: {
            contractId: taggedContract.id,
            playerId: taggedContract.player.id,
            yearsTotal: taggedContract.yearsTotal,
            yearsRemaining: taggedContract.yearsRemaining,
          },
        }),
      );
    }
  }

  return findings;
}
