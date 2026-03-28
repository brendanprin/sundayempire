export type ComplianceSeverity = "warning" | "error";

export type ComplianceStatus = "ok" | "warning" | "error";

export const RULE_CODES = {
  ROSTER_SIZE_EXCEEDED: "ROSTER_SIZE_EXCEEDED",
  ROSTER_BELOW_TARGET: "ROSTER_BELOW_TARGET",
  STARTER_COUNT_MISMATCH: "STARTER_COUNT_MISMATCH",
  STARTER_SLOT_INVALID: "STARTER_SLOT_INVALID",
  STARTER_POSITION_INVALID: "STARTER_POSITION_INVALID",
  CAP_SOFT_EXCEEDED: "CAP_SOFT_EXCEEDED",
  CAP_HARD_EXCEEDED: "CAP_HARD_EXCEEDED",
  CONTRACT_SALARY_INVALID: "CONTRACT_SALARY_INVALID",
  CONTRACT_YEARS_INVALID: "CONTRACT_YEARS_INVALID",
  CONTRACT_SUB_TEN_YEARS_INVALID: "CONTRACT_SUB_TEN_YEARS_INVALID",
  CONTRACT_REMAINING_YEARS_INVALID: "CONTRACT_REMAINING_YEARS_INVALID",
  FRANCHISE_TAG_COUNT_EXCEEDED: "FRANCHISE_TAG_COUNT_EXCEEDED",
  FRANCHISE_TAG_CONTRACT_YEARS_INVALID: "FRANCHISE_TAG_CONTRACT_YEARS_INVALID",
  IR_SLOT_EXCEEDED: "IR_SLOT_EXCEEDED",
  IR_PLAYER_INELIGIBLE: "IR_PLAYER_INELIGIBLE",
} as const;

export type RuleCode = (typeof RULE_CODES)[keyof typeof RULE_CODES];

export type RuleResult = {
  ruleCode: RuleCode;
  severity: ComplianceSeverity;
  message: string;
  teamId: string;
  context?: Record<string, unknown>;
};

export type TeamComplianceReport = {
  teamId: string;
  status: ComplianceStatus;
  evaluatedAt: string;
  findings: RuleResult[];
  summary: {
    errors: number;
    warnings: number;
  };
};

export type LeagueComplianceReport = {
  leagueId: string;
  seasonId: string;
  evaluatedAt: string;
  summary: {
    teamsEvaluated: number;
    ok: number;
    warning: number;
    error: number;
    totalFindings: number;
  };
  teams: TeamComplianceReport[];
};
