import type { AuthActor } from "@/lib/auth";
import type { LeaguePhase } from "@prisma/client";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { createActivitySummaryProjection } from "@/lib/read-models/dashboard/activity-summary-projection";
import { createDeadlineSummaryProjection } from "@/lib/read-models/dashboard/deadline-summary-projection";
import { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { createLeagueDashboardProjection } from "@/lib/read-models/dashboard/league-dashboard-projection";
import { createRookiePicksOwnedProjection } from "@/lib/read-models/dashboard/rookie-picks-owned-projection";
import { createTeamDashboardProjection } from "@/lib/read-models/dashboard/team-dashboard-projection";
import {
  DashboardAlertItem,
  LeagueSetupChecklistItem,
  LeagueSetupChecklistProjection,
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
    // During initial setup, contextualize deadline alerts as setup guidance rather than critical operational issues
    const isSetupPhase = input.leagueStatus.alertLevel === "setup_required";
    
    alerts.push({
      id: "deadline-overdue",
      level: isSetupPhase ? "warning" : "critical",
      title: isSetupPhase 
        ? "Setup-related deadlines need configuration."
        : "Rules & Deadlines need attention.",
      description: isSetupPhase
        ? `${input.deadlineSummary.summary.overdueCount} deadline${
            input.deadlineSummary.summary.overdueCount === 1 ? "" : "s"
          } need to be reviewed and configured as part of initial setup.`
        : `${input.deadlineSummary.summary.overdueCount} deadline${
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

const FOUNDER_SETUP_SKIP_SUMMARY = "Founder postponed team setup.";

function checklistCompletionPercent(completedItemCount: number, totalItemCount: number) {
  if (totalItemCount <= 0) {
    return 100;
  }

  return Math.round((completedItemCount / totalItemCount) * 100);
}

function derivePrimarySetupAction(input: {
  items: LeagueSetupChecklistItem[];
  seasonPhase: LeaguePhase | null;
}): LeagueSetupChecklistProjection["primaryAction"] {
  const phaseLabel = formatLeaguePhaseLabel(input.seasonPhase);
  const firstIncomplete = input.items.find((item) => item.status !== "COMPLETE");
  if (!firstIncomplete || !firstIncomplete.href || !firstIncomplete.ctaLabel) {
    return null;
  }

  const tone: "default" | "warning" | "critical" | "accent" =
    input.seasonPhase === "PRESEASON_SETUP"
      ? firstIncomplete.status === "INCOMPLETE_POSTPONED"
        ? "warning"
        : "critical"
      : "warning";

  return {
    id: `setup-${firstIncomplete.id}`,
    title: `Setup Next: ${firstIncomplete.title}`,
    description: `${firstIncomplete.description} Current phase: ${phaseLabel}.`,
    href: firstIncomplete.href,
    ctaLabel: firstIncomplete.ctaLabel,
    tone,
    phaseLabel,
  };
}

async function readSetupChecklist(client: DashboardProjectionDbClient, input: {
  leagueDashboard: LeagueLandingDashboardProjection["leagueDashboard"];
  actor: AuthActor;
  leagueId: string;
  seasonId: string;
  now: Date;
}): Promise<LeagueSetupChecklistProjection> {
  if (input.actor.leagueRole !== "COMMISSIONER") {
    return {
      available: false,
      visibleItemCount: 0,
      totalItemCount: 0,
      completedItemCount: 0,
      completionPercent: 100,
      isComplete: true,
      primaryIncompleteItemId: null,
      primaryAction: null,
      items: [],
    };
  }

  const seasonPhase = input.leagueDashboard.season?.currentPhase ?? null;
  const [founderSkipMarker, rookieDraft, pendingInviteCount] = await Promise.all([
    input.actor.teamId
      ? Promise.resolve(null)
      : client.transaction.findFirst({
          where: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            type: "COMMISSIONER_OVERRIDE",
            summary: FOUNDER_SETUP_SKIP_SUMMARY,
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            metadata: true,
          },
        }),
    client.draft.findFirst({
      where: {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        type: "ROOKIE",
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
      },
    }),
    client.leagueInvite.count({
      where: {
        leagueId: input.leagueId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: input.now,
        },
      },
    }),
  ]);

  const rookieDraftBoardEntryCount = rookieDraft
    ? await client.draftOrderEntry.count({
        where: {
          draftId: rookieDraft.id,
        },
      })
    : 0;
  const founderSkipMetadata =
    founderSkipMarker?.metadata && typeof founderSkipMarker.metadata === "object" && !Array.isArray(founderSkipMarker.metadata)
      ? (founderSkipMarker.metadata as { workflow?: unknown; action?: unknown; actorUserId?: unknown })
      : null;
  const founderSetupPostponed =
    founderSkipMetadata?.workflow === "FOUNDER_TEAM_SETUP" &&
    founderSkipMetadata?.action === "skip" &&
    founderSkipMetadata?.actorUserId === input.actor.userId;

  const founderTeamComplete = Boolean(input.actor.teamId);
  const addTeamsComplete = input.leagueDashboard.summary.teamCount >= 2;
  const inviteMembersComplete =
    input.leagueDashboard.summary.membershipCount >= 2 || pendingInviteCount > 0;
  const reviewSettingsComplete =
    (input.leagueDashboard.summary.activeRulesetVersion ?? 1) > 1 || seasonPhase !== "PRESEASON_SETUP";
  const draftPrepRequired = seasonPhase === "PRESEASON_SETUP";
  const draftPrepComplete = draftPrepRequired
    ? Boolean(rookieDraft) && rookieDraftBoardEntryCount > 0
    : true;

  const items: LeagueSetupChecklistItem[] = [
    {
      id: "founder-team-status",
      title: "Founder team status",
      description: founderTeamComplete
        ? "Founder account is linked to a team while retaining commissioner authority."
        : founderSetupPostponed
          ? "Founder team setup is postponed and still incomplete."
          : "Create or claim the founder team so commissioner + team-owner scope can coexist.",
      status: founderTeamComplete
        ? "COMPLETE"
        : founderSetupPostponed
          ? "INCOMPLETE_POSTPONED"
          : "INCOMPLETE",
      href: founderTeamComplete ? null : `/league/${input.leagueId}#founder-team-setup`,
      ctaLabel: founderTeamComplete ? null : "Complete Founder Team Setup",
      commissionerOnly: true,
    },
    {
      id: "add-teams",
      title: "Add teams",
      description: addTeamsComplete
        ? `${input.leagueDashboard.summary.teamCount} teams are already created.`
        : `Only ${input.leagueDashboard.summary.teamCount} team${input.leagueDashboard.summary.teamCount === 1 ? "" : "s"} found. Add at least one more team to start league play.`,
      status: addTeamsComplete ? "COMPLETE" : "INCOMPLETE",
      href: addTeamsComplete ? null : `/league/${input.leagueId}#setup-bootstrap-panel`,
      ctaLabel: addTeamsComplete ? null : "Add Teams",
      commissionerOnly: true,
    },
    {
      id: "invite-members",
      title: "Invite members",
      description: inviteMembersComplete
        ? pendingInviteCount > 0
          ? `${pendingInviteCount} pending invite${pendingInviteCount === 1 ? "" : "s"} sent and setup is moving.`
          : `${input.leagueDashboard.summary.membershipCount} league memberships are active.`
        : "No owner/member has joined yet beyond the founder. Send your first invite.",
      status: inviteMembersComplete ? "COMPLETE" : "INCOMPLETE",
      href: inviteMembersComplete ? null : `/league/${input.leagueId}#setup-bootstrap-panel`,
      ctaLabel: inviteMembersComplete ? null : "Invite Members",
      commissionerOnly: true,
    },
    {
      id: "review-settings-rules",
      title: "Review settings and rules",
      description: reviewSettingsComplete
        ? `Rules are reviewed for ${formatLeaguePhaseLabel(seasonPhase)}.`
        : "Review league settings and rules before opening draft operations.",
      status: reviewSettingsComplete ? "COMPLETE" : "INCOMPLETE",
      href: reviewSettingsComplete ? null : "/rules",
      ctaLabel: reviewSettingsComplete ? null : "Review Rules",
      commissionerOnly: true,
    },
    {
      id: "draft-prep-readiness",
      title: "Draft prep readiness",
      description: draftPrepComplete
        ? draftPrepRequired
          ? "Rookie draft context is created and board order is generated."
          : `Draft prep is phase-complete for ${formatLeaguePhaseLabel(seasonPhase)}.`
        : !rookieDraft
          ? "Create the rookie draft workspace for this season."
          : "Generate rookie draft board order before draft-day operations.",
      status: draftPrepComplete ? "COMPLETE" : "INCOMPLETE",
      href: draftPrepComplete ? null : "/draft",
      ctaLabel: draftPrepComplete
        ? null
        : !rookieDraft
          ? "Create Draft Setup"
          : "Generate Draft Board",
      commissionerOnly: true,
    },
  ];

  const totalItemCount = items.length;
  const completedItemCount = items.filter((item) => item.status === "COMPLETE").length;
  const firstIncompleteItem = items.find((item) => item.status !== "COMPLETE") ?? null;

  return {
    available: true,
    visibleItemCount: items.length,
    totalItemCount,
    completedItemCount,
    completionPercent: checklistCompletionPercent(completedItemCount, totalItemCount),
    isComplete: completedItemCount === totalItemCount,
    primaryIncompleteItemId: firstIncompleteItem?.id ?? null,
    primaryAction: derivePrimarySetupAction({
      items,
      seasonPhase,
    }),
    items,
  };
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

      const setupChecklist = await readSetupChecklist(client, {
        leagueDashboard,
        actor: input.actor,
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        now,
      });

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
        setupChecklist,
        generatedAt: now.toISOString(),
      };
    },
  };
}
