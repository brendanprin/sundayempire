export type TeamListItem = {
  id: string;
  name: string;
  abbreviation: string | null;
  divisionLabel: string | null;
  owner: {
    id: string;
    name: string;
  } | null;
  rosterCount: number;
  activeCapHit: number;
  deadCapHit: number;
  totalCapHit: number;
  capSpaceSoft: number;
  capSpaceHard: number;
  complianceStatus: "ok" | "warning" | "error";
  complianceErrors?: number;
  complianceWarnings?: number;
  futurePicksOwnedCount: number;
};

export type TeamDetailSummary = {
  id: string;
  name: string;
  abbreviation: string | null;
  divisionLabel: string | null;
  owner: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  rosterCount: number;
  activeCapHit: number;
  deadCapHit: number;
  totalCapHit: number;
  capSpaceSoft: number;
  capSpaceHard: number;
  complianceStatus: "ok" | "warning" | "error";
  complianceErrors?: number;
  complianceWarnings?: number;
  compliance?: {
    status: "ok" | "warning" | "error";
    evaluatedAt: string;
    summary: {
      errors: number;
      warnings: number;
    };
    findings: {
      ruleCode: string;
      severity: "warning" | "error";
      message: string;
      context?: Record<string, unknown>;
    }[];
  };
};
