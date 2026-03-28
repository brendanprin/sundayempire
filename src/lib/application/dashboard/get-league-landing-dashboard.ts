import type { AuthActor } from "@/lib/auth";
import { createActivitySummaryProjection } from "@/lib/read-models/dashboard/activity-summary-projection";
import { createDeadlineSummaryProjection } from "@/lib/read-models/dashboard/deadline-summary-projection";
import { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { createLeagueDashboardProjection } from "@/lib/read-models/dashboard/league-dashboard-projection";
import { createRookiePicksOwnedProjection } from "@/lib/read-models/dashboard/rookie-picks-owned-projection";
import { createTeamDashboardProjection } from "@/lib/read-models/dashboard/team-dashboard-projection";
import {
  DashboardAlertItem,
  LeagueLandingDashboardProjection,
  NotificationSummaryProjection,
  PendingTradeActionsSummary,
} from "@/lib/read-models/dashboard/types";
import { createNotificationSummaryReadModel } from "@/lib/read-models/notifications/notification-summary";
import { prisma } from "@/lib/prisma";

function buildAlerts(input: {
  leagueStatus: LeagueLandingDashboardProjection["leagueDashboard"]["status"];
  teamDashboard: LeagueLandingDashboardProjection["teamDashboard"];
  deadlineSummary: LeagueLandingDashboardProjection["deadlineSummary"];
  pendingTradeActions: PendingTradeActionsSummary;
  notificationSummary: NotificationSummaryProjection;
}): DashboardAlertItem[] {
  const alerts: DashboardAlertItem[] = [];

  if (input.leagueStatus.alertLevel !== "normal") {
    alerts.push({
      id: "league-status",
      level: input.leagueStatus.alertLevel === "setup_required" ? "warning" : input.leagueStatus.alertLevel,
      title: input.leagueStatus.mirrorOnly ? "Mirror-only roster guidance is active." : "League setup needs attention.",
      description: input.leagueStatus.reason,
      href: input.leagueStatus.mirrorOnly
        ? (input.teamDashboard ? `/teams/${input.teamDashboard.team.id}` : "/teams")
        : "/commissioner",
    });
  }

  if (input.teamDashboard?.complianceSummary.highestSeverity) {
    const level =
      input.teamDashboard.complianceSummary.highestSeverity === "CRITICAL" ||
      input.teamDashboard.complianceSummary.highestSeverity === "ERROR"
        ? "critical"
        : "warning";
    alerts.push({
      id: "team-compliance",
      level,
      title: "My Roster / Cap needs follow-up.",
      description: `${input.teamDashboard.complianceSummary.openIssueCount} open compliance issue${
        input.teamDashboard.complianceSummary.openIssueCount === 1 ? "" : "s"
      } are tied to your roster or contract state.`,
      href: `/teams/${input.teamDashboard.team.id}`,
    });
  }

  if (input.deadlineSummary.summary.overdueCount > 0) {
    alerts.push({
      id: "deadline-overdue",
      level: "critical",
      title: "Rules & Deadlines need attention.",
      description: `${input.deadlineSummary.summary.overdueCount} deadline${
        input.deadlineSummary.summary.overdueCount === 1 ? "" : "s"
      } have passed and still need action.`,
      href: "/rules",
    });
  } else if (input.deadlineSummary.upcomingDeadlines.some((deadline) => deadline.urgency === "today")) {
    alerts.push({
      id: "deadline-today",
      level: "warning",
      title: "A league deadline lands today.",
      description: "Review upcoming league deadlines before making roster or contract moves.",
      href: "/rules",
    });
  }

  if (
    input.pendingTradeActions.available &&
    (input.pendingTradeActions.incomingProposalsCount > 0 || input.pendingTradeActions.awaitingProcessingCount > 0)
  ) {
    alerts.push({
      id: "trade-actions",
      level: input.pendingTradeActions.awaitingProcessingCount > 0 ? "critical" : "warning",
      title: "Trade proposals are waiting.",
      description: `${input.pendingTradeActions.incomingProposalsCount} incoming proposal${
        input.pendingTradeActions.incomingProposalsCount === 1 ? "" : "s"
      } and ${input.pendingTradeActions.awaitingProcessingCount} accepted proposal${
        input.pendingTradeActions.awaitingProcessingCount === 1 ? "" : "s"
      } are tied to your team.`,
      href: "/trades",
    });
  }

  if (input.notificationSummary.unreadCount > 0) {
    alerts.push({
      id: "notifications",
      level: "normal",
      title: "Unread notifications are waiting.",
      description: `${input.notificationSummary.unreadCount} unread notification${
        input.notificationSummary.unreadCount === 1 ? "" : "s"
      } are ready in your league inbox.`,
      href: null,
    });
  }

  return alerts.slice(0, 4);
}

async function readPendingTradeActions(
  client: DashboardProjectionDbClient,
  input: {
    leagueId: string;
    seasonId: string;
    teamId: string | null;
  },
): Promise<PendingTradeActionsSummary> {
  if (!input.teamId) {
    return {
      available: false,
      teamId: null,
      incomingProposalsCount: 0,
      outgoingProposalsCount: 0,
      awaitingProcessingCount: 0,
      latestProposal: null,
    };
  }

  const [
    newIncomingCount,
    newOutgoingCount,
    newAwaitingCount,
    latestProposal,
  ] = await Promise.all([
    client.tradeProposal.count({
      where: {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        counterpartyTeamId: input.teamId,
        status: "SUBMITTED",
      },
    }),
    client.tradeProposal.count({
      where: {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        proposerTeamId: input.teamId,
        status: "SUBMITTED",
      },
    }),
    client.tradeProposal.count({
      where: {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        status: {
          in: ["ACCEPTED", "REVIEW_APPROVED"],
        },
        OR: [{ proposerTeamId: input.teamId }, { counterpartyTeamId: input.teamId }],
      },
    }),
    client.tradeProposal.findFirst({
      where: {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        status: {
          in: ["SUBMITTED", "REVIEW_PENDING", "ACCEPTED", "REVIEW_APPROVED"],
        },
        OR: [{ proposerTeamId: input.teamId }, { counterpartyTeamId: input.teamId }],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        proposerTeamId: true,
        proposerTeam: {
          select: {
            name: true,
          },
        },
        counterpartyTeam: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const latestProposalSummary = latestProposal
    ? {
        id: latestProposal.id,
        status: latestProposal.status,
        proposedAt: latestProposal.createdAt.toISOString(),
        updatedAt: latestProposal.updatedAt.toISOString(),
        counterpartyTeamName:
          latestProposal.proposerTeamId === input.teamId
            ? latestProposal.counterpartyTeam.name
            : latestProposal.proposerTeam.name,
        notes: null,
      }
    : null;

  return {
    available: true,
    teamId: input.teamId,
    incomingProposalsCount: newIncomingCount,
    outgoingProposalsCount: newOutgoingCount,
    awaitingProcessingCount: newAwaitingCount,
    latestProposal: latestProposalSummary,
  };
}

export function createLeagueLandingDashboardService(client: DashboardProjectionDbClient = prisma) {
  const teamDashboardProjection = createTeamDashboardProjection(client);
  const leagueDashboardProjection = createLeagueDashboardProjection(client);
  const deadlineSummaryProjection = createDeadlineSummaryProjection(client);
  const rookiePicksProjection = createRookiePicksOwnedProjection(client);
  const activitySummaryProjection = createActivitySummaryProjection(client);
  const notificationSummaryReadModel = createNotificationSummaryReadModel(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      actor: AuthActor;
      now?: Date;
    }): Promise<LeagueLandingDashboardProjection | null> {
      const now = input.now ?? new Date();

      const [leagueDashboard, deadlineSummary, teamDashboard, rookiePicksOwned, pendingTradeActions, activitySummary, notificationSummary] =
        await Promise.all([
          leagueDashboardProjection.read({
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            now,
          }),
          deadlineSummaryProjection.read({
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            limit: 4,
            now,
          }),
          input.actor.teamId
            ? teamDashboardProjection.read({
                teamId: input.actor.teamId,
                seasonId: input.seasonId,
                now,
              })
            : Promise.resolve(null),
          input.actor.teamId
            ? rookiePicksProjection.read({
                leagueId: input.leagueId,
                seasonId: input.seasonId,
                teamId: input.actor.teamId,
                horizonYears: 2,
                now,
              })
            : Promise.resolve(null),
          readPendingTradeActions(client, {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: input.actor.teamId,
          }),
          activitySummaryProjection.read({
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: input.actor.teamId,
            limit: 5,
            now,
          }),
          notificationSummaryReadModel.read({
            leagueId: input.leagueId,
            recipientUserId: input.actor.userId,
            limit: 5,
            now,
          }),
        ]);

      if (!leagueDashboard || !deadlineSummary) {
        return null;
      }

      return {
        viewer: {
          leagueRole: input.actor.leagueRole,
          teamId: input.actor.teamId,
          teamName: input.actor.teamName,
          hasTeamAccess: Boolean(input.actor.teamId),
        },
        leagueDashboard,
        teamDashboard,
        deadlineSummary,
        rookiePicksOwned,
        activitySummary,
        pendingTradeActions,
        notificationSummary,
        alerts: buildAlerts({
          leagueStatus: leagueDashboard.status,
          teamDashboard,
          deadlineSummary,
          pendingTradeActions,
          notificationSummary,
        }),
        generatedAt: now.toISOString(),
      };
    },
  };
}
