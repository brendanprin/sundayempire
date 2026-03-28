import {
  AcquisitionType,
  ComplianceIssueSeverity,
  ComplianceIssueStatus,
  ContractOptionDecisionType,
  ContractStatus,
  DeadCapSourceEventType,
  LeaguePhase,
  RosterStatus,
  TeamSlotType,
  TransactionType,
  TransitionStatus,
} from "@prisma/client";
import { LegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { LifecycleBlocker } from "@/lib/domain/lifecycle/types";
import {
  DashboardProjectionSelection,
  DashboardSeasonSummary,
  DeadlineSummaryItem,
} from "@/lib/read-models/dashboard/types";
import { RulesetHistoryItem, RulesetSummary } from "@/types/rules";

export type DetailIssueSummary = {
  openIssueCount: number;
  overdueIssueCount: number;
  warningCount: number;
  errorCount: number;
  criticalCount: number;
  highestSeverity: ComplianceIssueSeverity | null;
};

export type DetailIssueItem = {
  id: string;
  severity: ComplianceIssueSeverity;
  status: ComplianceIssueStatus;
  code: string;
  title: string;
  dueAt: string | null;
};

export type TeamCapDetailProjection = {
  team: {
    id: string;
    leagueId: string;
    name: string;
    abbreviation: string | null;
    divisionLabel: string | null;
  };
  season: DashboardSeasonSummary;
  capSummary: {
    stateAvailable: boolean;
    mirrorOnly: boolean;
    rosterCount: number | null;
    rosterLimit: number | null;
    activeCapTotal: number | null;
    deadCapTotal: number | null;
    hardCapTotal: number | null;
    softCapLimit: number | null;
    hardCapLimit: number | null;
    capSpaceSoft: number | null;
    capSpaceHard: number | null;
    lastRecalculatedAt: string | null;
  };
  roster: {
    starters: TeamRosterSlotDetail[];
    bench: TeamRosterSlotDetail[];
    injuredReserve: TeamRosterSlotDetail[];
    taxi: TeamRosterSlotDetail[];
    totalCount: number;
  };
  contracts: TeamContractDetail[];
  deadCap: {
    currentSeasonTotal: number;
    futureCarryTotal: number;
    charges: TeamDeadCapChargeDetail[];
  };
  complianceSummary: DetailIssueSummary;
  topIssues: DetailIssueItem[];
  ownedPicks: TeamOwnedPickDetail[];
  recentTransactions: DetailTransactionItem[];
  availability: {
    rulesetAvailable: boolean;
    teamSeasonStateAvailable: boolean;
    rosterAssignmentCoverageComplete: boolean;
    contractHistoryAvailable: boolean;
  };
  generatedAt: string;
};

export type TeamRosterSlotDetail = {
  id: string;
  slotType: TeamSlotType;
  slotLabel: string | null;
  week: number | null;
  player: {
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
    injuryStatus: string | null;
    isRestricted: boolean;
  };
  assignment: {
    id: string;
    acquisitionType: AcquisitionType;
    rosterStatus: RosterStatus;
    effectiveAt: string;
    hostPlatformReferenceId: string | null;
  } | null;
  contract: TeamContractSummary | null;
};

export type TeamContractSummary = {
  id: string;
  status: ContractStatus;
  salary: number;
  yearsTotal: number;
  yearsRemaining: number;
  startYear: number;
  endYear: number;
  endedAt: string | null;
  isRookieContract: boolean;
  rookieOptionEligible: boolean;
  rookieOptionExercised: boolean;
  isFranchiseTag: boolean;
  ledger: {
    annualSalary: number;
    yearsRemainingAtStart: number;
    ledgerStatus: ContractStatus;
  } | null;
  franchiseTagUsage: {
    id: string;
    finalTagSalary: number;
    priorSalary: number;
  } | null;
  optionDecision: {
    id: string;
    decisionType: ContractOptionDecisionType;
    effectiveContractYearsAdded: number;
    decidedAt: string | null;
  } | null;
};

export type TeamContractDetail = TeamContractSummary & {
  player: {
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
  };
};

export type TeamDeadCapChargeDetail = {
  id: string;
  player: {
    id: string;
    name: string;
    position: string;
  };
  sourceContractId: string;
  sourceEventType: DeadCapSourceEventType;
  appliesToSeasonYear: number | null;
  systemCalculatedAmount: number;
  adjustedAmount: number | null;
  effectiveAmount: number;
  isOverride: boolean;
  overrideReason: string | null;
  createdAt: string;
};

export type TeamOwnedPickDetail = {
  id: string;
  seasonYear: number;
  round: number;
  overall: number | null;
  originalTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
};

export type DetailTransactionItem = {
  id: string;
  type: TransactionType;
  summary: string;
  createdAt: string;
  player: {
    id: string;
    name: string;
    position: string;
  } | null;
};

export type PlayerContractDetailProjection = {
  league: {
    id: string;
    name: string;
  };
  seasonSelection: DashboardProjectionSelection;
  season: DashboardSeasonSummary | null;
  player: {
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
    age: number | null;
    yearsPro: number | null;
    injuryStatus: string | null;
    isRestricted: boolean;
  };
  rosterContext: {
    team: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    slotType: TeamSlotType;
    slotLabel: string | null;
    assignment: {
      id: string;
      acquisitionType: AcquisitionType;
      rosterStatus: RosterStatus;
      effectiveAt: string;
      hostPlatformReferenceId: string | null;
    } | null;
  } | null;
  contract: (TeamContractSummary & {
    team: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    deadCapSchedule: {
      id: string;
      appliesToSeasonYear: number | null;
      sourceEventType: DeadCapSourceEventType;
      systemCalculatedAmount: number;
      adjustedAmount: number | null;
      effectiveAmount: number;
      isOverride: boolean;
      overrideReason: string | null;
      createdAt: string;
    }[];
  }) | null;
  complianceSummary: DetailIssueSummary;
  relatedIssues: DetailIssueItem[];
  recentTransactions: DetailTransactionItem[];
  availability: {
    seasonResolved: boolean;
    currentSeasonContractAvailable: boolean;
    rosterAssignmentAvailable: boolean;
    contractHistoryAvailable: boolean;
  };
  generatedAt: string;
};

export type RulesDeadlinesProjection = {
  league: {
    id: string;
    name: string;
    description: string | null;
  };
  seasonSelection: DashboardProjectionSelection;
  season: DashboardSeasonSummary | null;
  ruleset: RulesetSummary | null;
  history: RulesetHistoryItem[];
  deadlines: {
    summary: {
      totalDeadlines: number;
      currentPhaseCount: number;
      overdueCount: number;
    };
    currentPhaseDeadlines: DeadlineSummaryItem[];
    upcomingDeadlines: DeadlineSummaryItem[];
  };
  lifecycle: {
    currentPhase: LeaguePhase | null;
    legacyPhase: LegacyLeaguePhase | null;
    nextPhase: LeaguePhase | null;
    blockers: LifecycleBlocker[];
    recentTransitions: {
      id: string;
      fromPhase: LeaguePhase;
      toPhase: LeaguePhase;
      transitionStatus: TransitionStatus;
      occurredAt: string;
      reason: string | null;
    }[];
  };
  availability: {
    rulesetAvailable: boolean;
    seasonResolved: boolean;
  };
  generatedAt: string;
};
