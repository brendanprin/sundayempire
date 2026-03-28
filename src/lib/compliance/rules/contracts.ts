import { TeamValidationContext } from "@/lib/compliance/context";
import { buildRuleResult } from "@/lib/compliance/rules/shared";
import { RULE_CODES, RuleResult } from "@/types/compliance";

export function validateContractRules(context: TeamValidationContext): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const contract of context.contracts) {
    if (contract.salary < context.ruleset.minSalary) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.CONTRACT_SALARY_INVALID,
          severity: "error",
          message: `${contract.player.name} has salary ${contract.salary}, below minimum ${context.ruleset.minSalary}.`,
          context: {
            contractId: contract.id,
            playerId: contract.player.id,
            salary: contract.salary,
            minimumSalary: context.ruleset.minSalary,
          },
        }),
      );
    }

    const yearsInRange =
      contract.yearsTotal >= context.ruleset.minContractYears &&
      contract.yearsTotal <= context.ruleset.maxContractYears;

    if (!yearsInRange) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.CONTRACT_YEARS_INVALID,
          severity: "error",
          message: `${contract.player.name} has ${contract.yearsTotal} years, outside allowed range ${context.ruleset.minContractYears}-${context.ruleset.maxContractYears}.`,
          context: {
            contractId: contract.id,
            playerId: contract.player.id,
            yearsTotal: contract.yearsTotal,
            minContractYears: context.ruleset.minContractYears,
            maxContractYears: context.ruleset.maxContractYears,
          },
        }),
      );
    }

    if (
      contract.salary < 10 &&
      contract.yearsTotal > context.ruleset.maxContractYearsIfSalaryBelowTen
    ) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.CONTRACT_SUB_TEN_YEARS_INVALID,
          severity: "error",
          message: `${contract.player.name} is below $10 and exceeds max ${context.ruleset.maxContractYearsIfSalaryBelowTen}-year contract.`,
          context: {
            contractId: contract.id,
            playerId: contract.player.id,
            salary: contract.salary,
            yearsTotal: contract.yearsTotal,
            maxYearsBelowTen: context.ruleset.maxContractYearsIfSalaryBelowTen,
          },
        }),
      );
    }

    if (contract.yearsRemaining < 0 || contract.yearsRemaining > contract.yearsTotal) {
      findings.push(
        buildRuleResult({
          teamId: context.team.id,
          ruleCode: RULE_CODES.CONTRACT_REMAINING_YEARS_INVALID,
          severity: "error",
          message: `${contract.player.name} has invalid yearsRemaining (${contract.yearsRemaining}) for ${contract.yearsTotal}-year deal.`,
          context: {
            contractId: contract.id,
            playerId: contract.player.id,
            yearsTotal: contract.yearsTotal,
            yearsRemaining: contract.yearsRemaining,
          },
        }),
      );
    }
  }

  return findings;
}
