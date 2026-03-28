import {
  CommissionerOverrideType,
  ComplianceIssueSeverity,
  LeaguePhase,
  SeasonStatus,
  TransactionType,
} from "@prisma/client";
import { LegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";

export type DashboardAlertLevel = "normal" | "warning" | "critical" | "setup_required";

export type DashboardProjectionSelection = "active" | "explicit" | "unresolved";

export type DashboardSeasonSummary = {
  id: string;
  year: number;
  status: SeasonStatus;
  currentPhase: LeaguePhase;
  legacyPhase: LegacyLeaguePhase;
  openedAt: string | null;
  closedAt: string | null;
};

export type TeamDashboardProjection = {
  team: {
    id: string;
    leagueId: string;
    name: string;
    abbreviation: string | null;
    divisionLabel: string | null;
  };
  season: DashboardSeasonSummary;
  rosterCapSummary: {
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
  complianceSummary: {
    openIssueCount: number;
    warningCount: number;
    errorCount: number;
    criticalCount: number;
    highestSeverity: ComplianceIssueSeverity | null;
  };
  contractSummary: {
    expiringContractsCount: number;
    unresolvedRookieOptionCount: number | null;
    franchiseTagCandidateCount: number | null;
  };
  availability: {
    rulesetAvailable: boolean;
    unresolvedRookieOptionCountAvailable: boolean;
    franchiseTagCandidateCountAvailable: boolean;
  };
  generatedAt: string;
};

export type LeagueDashboardProjection = {
  league: {
    id: string;
    name: string;
    description: string | null;
  };
  seasonSelection: DashboardProjectionSelection;
  season: DashboardSeasonSummary | null;
  summary: {
    teamCount: number;
    openIssueCount: number;
    overdueIssueCount: number;
    warningCount: number;
    errorCount: number;
    criticalCount: number;
  };
  status: {
    alertLevel: DashboardAlertLevel;
    mirrorOnly: boolean;
    reason: string;
  };
  recentPhaseTransition: {
    id: string;
    fromPhase: LeaguePhase;
    toPhase: LeaguePhase;
    occurredAt: string;
    reason: string | null;
  } | null;
  generatedAt: string;
};

export type DeadlineUrgency = "overdue" | "today" | "soon" | "upcoming";

export type DeadlineSummaryItem = {
  id: string;
  deadlineType: string;
  phase: LeaguePhase;
  legacyPhase: LegacyLeaguePhase;
  scheduledAt: string;
  sourceType: string;
  reminderOffsets: number[];
  isCurrentPhase: boolean;
  openIssueCount: number;
  overdue: boolean;
  urgency: DeadlineUrgency;
  daysUntilDue: number;
};

export type DeadlineSummaryProjection = {
  league: {
    id: string;
    name: string;
  };
  seasonSelection: DashboardProjectionSelection;
  season: {
    id: string;
    year: number;
    currentPhase: LeaguePhase;
    legacyPhase: LegacyLeaguePhase;
  } | null;
  summary: {
    totalDeadlines: number;
    currentPhaseCount: number;
    overdueCount: number;
  };
  currentPhaseDeadlines: DeadlineSummaryItem[];
  upcomingDeadlines: DeadlineSummaryItem[];
  generatedAt: string;
};

export type RookiePicksOwnedProjection = {
  league: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  seasonWindow: {
    startYear: number;
    endYear: number;
  };
  seasons: {
    seasonYear: number;
    totalCount: number;
    rounds: {
      round: number;
      picks: {
        id: string;
        overall: number | null;
        originalTeam: {
          id: string;
          name: string;
          abbreviation: string | null;
        };
      }[];
    }[];
  }[];
  generatedAt: string;
};

export type ActivitySummaryProjection = {
  scope: "league" | "team";
  recentActivity: {
    id: string;
    type: TransactionType;
    summary: string;
    createdAt: string;
    team: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
    player: {
      id: string;
      name: string;
      position: string;
    } | null;
  }[];
  commissionerNote: {
    id: string;
    overrideType: CommissionerOverrideType;
    reason: string;
    createdAt: string;
    actorName: string | null;
    actorEmail: string | null;
    teamName: string | null;
  } | null;
  emptyStateReason: string | null;
  generatedAt: string;
};

export type NotificationSummaryProjection = {
  unreadCount: number;
  items: {
    id: string;
    eventType: string;
    category: "compliance" | "commissioner" | "trade" | "league";
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
  }[];
  generatedAt: string;
};

export type PendingTradeActionsSummary = {
  available: boolean;
  teamId: string | null;
  incomingProposalsCount: number;
  outgoingProposalsCount: number;
  awaitingProcessingCount: number;
  latestProposal: {
    id: string;
    status: string;
    proposedAt: string;
    updatedAt: string;
    counterpartyTeamName: string;
    notes: string | null;
  } | null;
};

export type DashboardAlertItem = {
  id: string;
  level: "normal" | "warning" | "critical";
  title: string;
  description: string;
  href: string | null;
};

export type LeagueLandingDashboardProjection = {
  viewer: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    teamId: string | null;
    teamName: string | null;
    hasTeamAccess: boolean;
  };
  leagueDashboard: LeagueDashboardProjection;
  teamDashboard: TeamDashboardProjection | null;
  deadlineSummary: DeadlineSummaryProjection;
  rookiePicksOwned: RookiePicksOwnedProjection | null;
  activitySummary: ActivitySummaryProjection;
  pendingTradeActions: PendingTradeActionsSummary;
  notificationSummary: NotificationSummaryProjection;
  alerts: DashboardAlertItem[];
  generatedAt: string;
};
