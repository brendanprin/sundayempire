import { TeamValidationContext } from "@/lib/compliance/context";
import { buildRuleResult } from "@/lib/compliance/rules/shared";
import { RULE_CODES, RuleResult } from "@/types/compliance";

export type TeamCapComputation = {
  activeCapHit: number;
  deadCapHit: number;
  totalCapHit: number;
  capSpaceSoft: number;
  capSpaceHard: number;
};

export function computeTeamCap(context: TeamValidationContext): TeamCapComputation {
  const activeCapHit = context.contracts.reduce((total, contract) => total + contract.salary, 0);
  const deadCapHit = context.capPenalties.reduce((total, penalty) => total + penalty.amount, 0);
  const totalCapHit = activeCapHit + deadCapHit;

  return {
    activeCapHit,
    deadCapHit,
    totalCapHit,
    capSpaceSoft: context.ruleset.salaryCapSoft - totalCapHit,
    capSpaceHard: context.ruleset.salaryCapHard - totalCapHit,
  };
}

export function validateCapCompliance(context: TeamValidationContext): RuleResult[] {
  const findings: RuleResult[] = [];
  const cap = computeTeamCap(context);

  if (cap.totalCapHit > context.ruleset.salaryCapSoft) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.CAP_SOFT_EXCEEDED,
        severity: "warning",
        message: `${context.team.name} is over the soft cap (${cap.totalCapHit}/${context.ruleset.salaryCapSoft}).`,
        context: {
          ...cap,
          softCap: context.ruleset.salaryCapSoft,
        },
      }),
    );
  }

  if (cap.totalCapHit > context.ruleset.salaryCapHard) {
    findings.push(
      buildRuleResult({
        teamId: context.team.id,
        ruleCode: RULE_CODES.CAP_HARD_EXCEEDED,
        severity: "error",
        message: `${context.team.name} exceeds hard cap (${cap.totalCapHit}/${context.ruleset.salaryCapHard}).`,
        context: {
          ...cap,
          hardCap: context.ruleset.salaryCapHard,
        },
      }),
    );
  }

  return findings;
}
