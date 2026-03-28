import { RuleCode, RuleResult } from "@/types/compliance";

export function buildRuleResult(input: {
  teamId: string;
  ruleCode: RuleCode;
  severity: "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
}): RuleResult {
  return {
    teamId: input.teamId,
    ruleCode: input.ruleCode,
    severity: input.severity,
    message: input.message,
    context: input.context,
  };
}
