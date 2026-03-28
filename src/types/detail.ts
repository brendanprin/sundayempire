import type {
  TeamCapDetailProjection,
  PlayerContractDetailProjection,
  RulesDeadlinesProjection,
} from "@/lib/read-models/detail/types";

export type {
  TeamCapDetailProjection,
  PlayerContractDetailProjection,
  RulesDeadlinesProjection,
};

export type ImpactPreviewFinding = {
  ruleCode: string;
  severity: "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
};

export type ImpactPreviewSnapshot = {
  rosterCount: number;
  activeCapTotal: number;
  deadCapTotal: number;
  hardCapTotal: number;
  complianceStatus: "ok" | "warning" | "error";
  complianceErrors: number;
  complianceWarnings: number;
};

export type ContractImpactPreview = {
  action: "cut" | "franchise_tag" | "rookie_option";
  legal: boolean;
  blockedReason: string | null;
  target: {
    team: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    player: {
      id: string;
      name: string;
      position: string;
    };
    contract: {
      id: string;
      salary: number;
      yearsTotal: number;
      yearsRemaining: number;
      status: string;
    } | null;
  };
  before: ImpactPreviewSnapshot;
  after: ImpactPreviewSnapshot;
  delta: {
    rosterCount: number;
    activeCapTotal: number;
    deadCapTotal: number;
    hardCapTotal: number;
  };
  introducedFindings: ImpactPreviewFinding[];
  assumptions: {
    afterTradeDeadline: boolean | null;
    coverageEstimated: boolean;
  };
  details: {
    currentSeasonDeadCapCharge: number | null;
    deadCapSchedule?: {
      seasonOffset: number;
      seasonYear: number | null;
      amount: number;
    }[];
    franchiseTag?: {
      priorSalary: number;
      calculatedTopTierAverage: number;
      calculated120PercentSalary: number;
      finalTagSalary: number;
      frozenSnapshotSeasonId: string;
    };
    rookieOption?: {
      yearsToAdd: number;
      nextYearsTotal: number;
      nextYearsRemaining: number;
    };
  };
  generatedAt: string;
};
