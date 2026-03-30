import {
  ComplianceIssueSeverity,
  ComplianceIssueStatus,
  LeaguePhase,
  PrismaClient,
  Prisma,
} from "@prisma/client";
import { getStrictActiveSeason } from "@/lib/domain/lifecycle/season-selection";
import { toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import {
  DashboardAlertLevel,
  DashboardProjectionSelection,
  DashboardSeasonSummary,
  DeadlineUrgency,
} from "@/lib/read-models/dashboard/types";

export type DashboardProjectionDbClient = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_ISSUE_STATUSES: ComplianceIssueStatus[] = ["OPEN", "IN_REVIEW"];

export function openIssueStatuses() {
  return OPEN_ISSUE_STATUSES;
}

export function isOpenIssueStatus(status: ComplianceIssueStatus) {
  return OPEN_ISSUE_STATUSES.includes(status);
}

export function summarizeIssueSeverities(
  issues: {
    severity: ComplianceIssueSeverity;
    dueAt: Date | null;
  }[],
  now: Date,
) : {
  openIssueCount: number;
  warningCount: number;
  errorCount: number;
  criticalCount: number;
  highestSeverity: ComplianceIssueSeverity | null;
  overdueCount: number;
} {
  let warningCount = 0;
  let errorCount = 0;
  let criticalCount = 0;
  let overdueCount = 0;

  for (const issue of issues) {
    if (issue.severity === "WARNING") {
      warningCount += 1;
    } else if (issue.severity === "ERROR") {
      errorCount += 1;
    } else if (issue.severity === "CRITICAL") {
      criticalCount += 1;
    }

    if (issue.dueAt && issue.dueAt.getTime() < now.getTime()) {
      overdueCount += 1;
    }
  }

  const highestSeverity: ComplianceIssueSeverity | null =
    criticalCount > 0 ? "CRITICAL" : errorCount > 0 ? "ERROR" : warningCount > 0 ? "WARNING" : null;

  return {
    openIssueCount: issues.length,
    warningCount,
    errorCount,
    criticalCount,
    highestSeverity,
    overdueCount,
  };
}

export function deriveLeagueAlertStatus(input: {
  seasonResolved: boolean;
  highestSeverity: ComplianceIssueSeverity | null;
  overdueCount: number;
  openIssueCount: number;
}) {
  if (!input.seasonResolved) {
    return {
      alertLevel: "setup_required" as DashboardAlertLevel,
      reason: "Active season could not be resolved from lifecycle state.",
    };
  }

  if (input.highestSeverity === "CRITICAL" || input.highestSeverity === "ERROR" || input.overdueCount > 0) {
    const issueCount = input.overdueCount > 0 ? input.overdueCount : input.openIssueCount;
    return {
      alertLevel: "critical" as DashboardAlertLevel,
      reason:
        input.overdueCount > 0
          ? `${issueCount} compliance issue${issueCount === 1 ? "" : "s"} overdue.`
          : `${issueCount} open compliance issue${issueCount === 1 ? "" : "s"} require attention.`,
    };
  }

  if (input.openIssueCount > 0) {
    return {
      alertLevel: "warning" as DashboardAlertLevel,
      reason: `${input.openIssueCount} open compliance issue${input.openIssueCount === 1 ? "" : "s"} on the board.`,
    };
  }

  return {
    alertLevel: "normal" as DashboardAlertLevel,
    reason: "League is operating without open compliance blockers.",
  };
}

export function normalizeReminderOffsets(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
}

export function calculateDeadlineUrgency(scheduledAt: Date, now: Date): {
  urgency: DeadlineUrgency;
  overdue: boolean;
  daysUntilDue: number;
} {
  const diffMs = scheduledAt.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(diffMs / DAY_MS);

  if (diffMs < 0) {
    return {
      urgency: "overdue",
      overdue: true,
      daysUntilDue,
    };
  }

  if (diffMs <= DAY_MS) {
    return {
      urgency: "today",
      overdue: false,
      daysUntilDue,
    };
  }

  if (diffMs <= 7 * DAY_MS) {
    return {
      urgency: "soon",
      overdue: false,
      daysUntilDue,
    };
  }

  return {
    urgency: "upcoming",
    overdue: false,
    daysUntilDue,
  };
}

export function calculateContextAwareDeadlineUrgency(
  scheduledAt: Date,
  sourceType: string,
  leagueCreatedAt: Date,
  now: Date,
): {
  urgency: DeadlineUrgency;
  overdue: boolean;
  daysUntilDue: number;
} {
  const diffMs = scheduledAt.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(diffMs / DAY_MS);
  
  // Check if this is a default placeholder that predates league creation
  const deadlinePreDatesLeague = scheduledAt.getTime() < leagueCreatedAt.getTime();
  const isDefaultPlaceholder = sourceType === "CONSTITUTION_DEFAULT" && deadlinePreDatesLeague;

  if (diffMs < 0) {
    // Only mark as overdue if this is a real configured deadline, not a default placeholder
    if (isDefaultPlaceholder) {
      return {
        urgency: "upcoming",
        overdue: false,
        daysUntilDue,
      };
    }
    
    return {
      urgency: "overdue",
      overdue: true,
      daysUntilDue,
    };
  }

  if (diffMs <= DAY_MS) {
    return {
      urgency: "today",
      overdue: false,
      daysUntilDue,
    };
  }

  if (diffMs <= 7 * DAY_MS) {
    return {
      urgency: "soon",
      overdue: false,
      daysUntilDue,
    };
  }

  return {
    urgency: "upcoming",
    overdue: false,
    daysUntilDue,
  };
}

export function compareDeadlinesByUrgency(
  left: { urgency: DeadlineUrgency; scheduledAt: string; deadlineType: string },
  right: { urgency: DeadlineUrgency; scheduledAt: string; deadlineType: string },
) {
  const rank: Record<DeadlineUrgency, number> = {
    overdue: 0,
    today: 1,
    soon: 2,
    upcoming: 3,
  };

  const urgencyDelta = rank[left.urgency] - rank[right.urgency];
  if (urgencyDelta !== 0) {
    return urgencyDelta;
  }

  const timeDelta = new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }

  return left.deadlineType.localeCompare(right.deadlineType);
}

export function buildDashboardSeasonSummary(season: {
  id: string;
  year: number;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  phase: LeaguePhase;
  openedAt: Date | null;
  closedAt: Date | null;
}): DashboardSeasonSummary {
  return {
    id: season.id,
    year: season.year,
    status: season.status,
    currentPhase: season.phase,
    legacyPhase: toLegacyLeaguePhase(season.phase),
    openedAt: season.openedAt?.toISOString() ?? null,
    closedAt: season.closedAt?.toISOString() ?? null,
  };
}

export async function resolveLeagueSeasonContext(
  client: DashboardProjectionDbClient,
  input: {
    leagueId: string;
    seasonId?: string;
  },
) {
  const league = await client.league.findUnique({
    where: { id: input.leagueId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      seasons: {
        orderBy: { year: "desc" },
        select: {
          id: true,
          year: true,
          status: true,
          phase: true,
          openedAt: true,
          closedAt: true,
        },
      },
    },
  });

  if (!league) {
    return null;
  }

  if (input.seasonId) {
    const explicitSeason = league.seasons.find((season) => season.id === input.seasonId) ?? null;
    return {
      league,
      season: explicitSeason,
      seasonSelection: explicitSeason ? ("explicit" as DashboardProjectionSelection) : ("unresolved" as DashboardProjectionSelection),
    };
  }

  const activeSeason = getStrictActiveSeason(league.seasons);
  return {
    league,
    season: activeSeason,
    seasonSelection: activeSeason ? ("active" as DashboardProjectionSelection) : ("unresolved" as DashboardProjectionSelection),
  };
}
