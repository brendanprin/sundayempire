import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { evaluateLeagueCompliance } from "@/lib/compliance/service";
import { getLeagueCommissionerIntegrity } from "@/lib/domain/league-membership/commissioner-assignment";
import { prisma } from "@/lib/prisma";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type DiagnosticStatus = "pass" | "warn" | "fail";

type DiagnosticSubsystem = {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
  remediation: {
    label: string;
    href: string;
  };
  metrics?: Record<string, number | string | boolean | null>;
};

function summarizeSubsystems(subsystems: DiagnosticSubsystem[]) {
  return {
    pass: subsystems.filter((item) => item.status === "pass").length,
    warn: subsystems.filter((item) => item.status === "warn").length,
    fail: subsystems.filter((item) => item.status === "fail").length,
  };
}

function formatTransactionType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function countByType(rows: { eventType: string; _count: { _all: number } }[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.eventType] = row._count._all;
  }
  return counts;
}

function countByStatus(rows: { status: string; _count: { _all: number } }[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row._count._all;
  }
  return counts;
}

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const checkedAt = new Date().toISOString();
  const subsystems: DiagnosticSubsystem[] = [];
  const activeSeason = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
  });

  subsystems.push({
    id: "role-access",
    label: "Role Access",
    status: "pass",
    detail: `Authenticated as commissioner ${actor?.email ?? "unknown"}.`,
    remediation: {
      label: "Review memberships",
      href: "/teams",
    },
    metrics: {
      leagueRole: actor?.leagueRole ?? null,
      teamScope: actor?.teamId ?? null,
    },
  });

  const commissionerIntegrity = await getLeagueCommissionerIntegrity(prisma, {
    leagueId: context.leagueId,
    includePendingCommissionerDesignation: true,
  });
  const integrityErrorCount = commissionerIntegrity.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const integrityWarningCount = commissionerIntegrity.issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const commissionerIntegrityStatus: DiagnosticStatus =
    commissionerIntegrity.status !== "HEALTHY" || integrityErrorCount > 0
      ? "fail"
      : integrityWarningCount > 0
        ? "warn"
        : "pass";

  subsystems.push({
    id: "commissioner-integrity",
    label: "Commissioner Integrity",
    status: commissionerIntegrityStatus,
    detail:
      commissionerIntegrity.status === "HEALTHY"
        ? integrityWarningCount > 0
          ? `Commissioner continuity is healthy with ${integrityWarningCount} warning(s) requiring follow-up.`
          : "Exactly one active commissioner is assigned."
        : commissionerIntegrity.status === "MISSING_COMMISSIONER"
          ? "No active commissioner is assigned. Governance repair is required."
          : "Conflicting active commissioner assignments were detected. Governance repair is required.",
    remediation: {
      label: "Open commissioner governance",
      href: "/settings",
    },
    metrics: {
      integrityStatus: commissionerIntegrity.status,
      activeCommissionerCount: commissionerIntegrity.activeCommissioners.length,
      issueCount: commissionerIntegrity.issues.length,
      errorCount: integrityErrorCount,
      warningCount: integrityWarningCount,
      pendingDesignation: Boolean(commissionerIntegrity.pendingCommissionerDesignation),
    },
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    subsystems.push({
      id: "database",
      label: "Database Connectivity",
      status: "pass",
      detail: "Database query probe completed successfully.",
      remediation: {
        label: "Run readiness endpoint",
        href: "/api/ready",
      },
    });
  } catch (error) {
    subsystems.push({
      id: "database",
      label: "Database Connectivity",
      status: "fail",
      detail: error instanceof Error ? error.message : "Database query probe failed.",
      remediation: {
        label: "Check app readiness",
        href: "/api/ready",
      },
    });
  }

  const proposalsByStatus = await prisma.tradeProposal.groupBy({
    by: ["status"],
    where: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      status: {
        in: ["REVIEW_PENDING", "ACCEPTED", "REVIEW_APPROVED"],
      },
    },
    _count: {
      _all: true,
    },
  });

  const pendingApprovals =
    proposalsByStatus.find((entry) => entry.status === "REVIEW_PENDING")?._count._all ?? 0;
  const pendingProcessing = proposalsByStatus
    .filter((entry) => entry.status === "ACCEPTED" || entry.status === "REVIEW_APPROVED")
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const queueBacklog = pendingApprovals + pendingProcessing;

  subsystems.push({
    id: "trade-queue",
    label: "Trade Queue Backlog",
    status: queueBacklog > 0 ? "warn" : "pass",
    detail:
      queueBacklog > 0
        ? `${queueBacklog} trade operation(s) pending commissioner review or settlement.`
        : "No commissioner trade backlog detected.",
    remediation: {
      label: "Open trades",
      href: "/trades",
    },
    metrics: {
      pendingApprovals,
      pendingProcessing,
      queueBacklog,
    },
  });

  const compliance = await evaluateLeagueCompliance({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
  });

  const complianceStatus: DiagnosticStatus =
    compliance.summary.error > 0 ? "fail" : compliance.summary.warning > 0 ? "warn" : "pass";

  subsystems.push({
    id: "league-compliance",
    label: "League Compliance Risk",
    status: complianceStatus,
    detail:
      complianceStatus === "fail"
        ? `${compliance.summary.error} team(s) currently have blocking compliance errors.`
        : complianceStatus === "warn"
          ? `${compliance.summary.warning} team(s) currently have compliance warnings.`
          : "No compliance warnings or errors detected.",
    remediation: {
      label: "Open commissioner operations",
      href: "/commissioner",
    },
    metrics: {
      teamsEvaluated: compliance.summary.teamsEvaluated,
      errors: compliance.summary.error,
      warnings: compliance.summary.warning,
      findings: compliance.summary.totalFindings,
    },
  });

  const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const [pilotEventsByType, feedbackByStatus] = await Promise.all([
    prisma.pilotEvent.groupBy({
      by: ["eventType"],
      where: {
        leagueId: context.leagueId,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      _count: { _all: true },
    }),
    prisma.pilotFeedback.groupBy({
      by: ["status"],
      where: {
        leagueId: context.leagueId,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      _count: { _all: true },
    }),
  ]);

  const eventCounts = countByType(pilotEventsByType);
  const feedbackCounts = countByStatus(feedbackByStatus);
  const tradeProposals = eventCounts[PILOT_EVENT_TYPES.TRADE_PROPOSAL_CREATED] ?? 0;
  const tradeProcessed = eventCounts[PILOT_EVENT_TYPES.TRADE_PROCESSED] ?? 0;
  const rosterActions =
    (eventCounts[PILOT_EVENT_TYPES.ROSTER_SWAP_COMPLETED] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.ROSTER_MOVE_COMPLETED] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.ROSTER_ADD_COMPLETED] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.ROSTER_DROP_COMPLETED] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.ROSTER_CUT_COMPLETED] ?? 0);
  const commissionerOps =
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_PHASE_TRANSITION] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_COMPLIANCE_SCAN] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_ROLLOVER_PREVIEW] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_ROLLOVER_APPLY] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_FIX_PREVIEW] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_FIX_APPLY] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_SNAPSHOT_PREVIEW] ?? 0) +
    (eventCounts[PILOT_EVENT_TYPES.COMMISSIONER_SNAPSHOT_APPLY] ?? 0);

  subsystems.push({
    id: "workflow-instrumentation",
    label: "Workflow Instrumentation",
    status: tradeProposals > 0 || rosterActions > 0 || commissionerOps > 0 ? "pass" : "warn",
    detail:
      tradeProposals > 0 || rosterActions > 0 || commissionerOps > 0
        ? "Core workflow telemetry events are flowing."
        : "No recent telemetry events detected in the last 7 days.",
    remediation: {
      label: "Open analytics event stream",
      href: "/api/commissioner/analytics/events",
    },
    metrics: {
      tradeProposals,
      tradeProcessed,
      rosterActions,
      commissionerOps,
      windowHours: 24 * 7,
    },
  });

  const newFeedbackCount = feedbackCounts.NEW ?? 0;
  const openFeedbackCount = newFeedbackCount + (feedbackCounts.IN_REVIEW ?? 0);
  subsystems.push({
    id: "pilot-feedback-inbox",
    label: "Pilot Feedback Inbox",
    status: newFeedbackCount > 0 ? "warn" : "pass",
    detail:
      newFeedbackCount > 0
        ? `${newFeedbackCount} new feedback report(s) waiting for triage.`
        : "No new pilot feedback reports waiting for triage.",
    remediation: {
      label: "Open feedback queue",
      href: "/api/feedback",
    },
    metrics: {
      new: newFeedbackCount,
      open: openFeedbackCount,
      closed: feedbackCounts.CLOSED ?? 0,
      total: Object.values(feedbackCounts).reduce((sum, value) => sum + value, 0),
    },
  });

  const latestTransaction = await prisma.transaction.findFirst({
    where: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      type: true,
      summary: true,
      createdAt: true,
    },
  });

  if (!latestTransaction) {
    subsystems.push({
      id: "transaction-activity",
      label: "Recent Transaction Activity",
      status: "warn",
      detail: "No transaction records were found for the active season.",
      remediation: {
        label: "Open commissioner operations",
        href: "/commissioner",
      },
    });
  } else {
    const minutesSinceLastTransaction = Math.floor(
      (Date.now() - latestTransaction.createdAt.getTime()) / (1000 * 60),
    );

    subsystems.push({
      id: "transaction-activity",
      label: "Recent Transaction Activity",
      status: minutesSinceLastTransaction > 60 * 24 * 7 ? "warn" : "pass",
      detail:
        minutesSinceLastTransaction > 60 * 24 * 7
          ? `Last transaction was ${minutesSinceLastTransaction} minutes ago.`
          : `${formatTransactionType(latestTransaction.type)} recorded ${minutesSinceLastTransaction} minutes ago.`,
      remediation: {
        label: "Open commissioner operations",
        href: "/commissioner",
      },
      metrics: {
        lastTransactionType: latestTransaction.type,
        minutesSinceLastTransaction,
      },
    });
  }

  const summary = summarizeSubsystems(subsystems);

  return NextResponse.json({
    checkedAt,
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
      phase: activeSeason?.phase ?? "UNKNOWN",
    },
    service: {
      env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
      version: process.env.APP_VERSION ?? "dev",
    },
    summary,
    queues: {
      pendingApprovals,
      pendingProcessing,
      queueBacklog,
    },
    subsystems,
  });
}
