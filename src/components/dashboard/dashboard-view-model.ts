import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type {
  ComplianceIssueSeverity,
} from "@prisma/client";
import type {
  DeadlineSummaryItem,
  LeagueLandingDashboardProjection,
} from "@/lib/read-models/dashboard/types";
import type { DraftHomeProjection } from "@/lib/read-models/draft/types";
import type { TradeHomeResponse } from "@/types/trade-workflow";
import type {
  DashboardActionItem,
  DashboardDeadlineCardItem,
} from "@/components/dashboard/dashboard-action-center";
import type { DashboardChangeFeedItem } from "@/components/dashboard/dashboard-change-feed";
import type { DashboardHealthSummaryItem } from "@/components/dashboard/dashboard-health-summary-row";

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not available";
  }

  return `$${value.toLocaleString()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function daysUntilLabel(daysUntilDue: number) {
  if (daysUntilDue < 0) {
    return `${Math.abs(daysUntilDue)} day(s) overdue`;
  }

  if (daysUntilDue === 0) {
    return "Due today";
  }

  return `${daysUntilDue} day(s) out`;
}

function toneForSeverity(
  severity: ComplianceIssueSeverity | null,
): "default" | "warning" | "critical" {
  if (severity === "CRITICAL" || severity === "ERROR") {
    return "critical";
  }

  if (severity === "WARNING") {
    return "warning";
  }

  return "default";
}

function toneForUrgency(
  urgency: DeadlineSummaryItem["urgency"],
): "default" | "warning" | "critical" {
  if (urgency === "overdue") {
    return "critical";
  }

  if (urgency === "today" || urgency === "soon") {
    return "warning";
  }

  return "default";
}

function rankActionTone(tone: DashboardActionItem["tone"]) {
  if (tone === "critical") {
    return 0;
  }

  if (tone === "warning") {
    return 1;
  }

  if (tone === "accent") {
    return 2;
  }

  return 3;
}

function countLabel(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function firstRelevantDeadline(
  dashboard: LeagueLandingDashboardProjection,
) {
  return (
    dashboard.deadlineSummary.upcomingDeadlines[0] ??
    dashboard.deadlineSummary.currentPhaseDeadlines[0] ??
    null
  );
}

function activeDraftSummary(draftsHome: DraftHomeProjection | null) {
  return draftsHome?.activeRookieDraft ?? draftsHome?.activeVeteranAuction?.draft ?? null;
}

function sortActions(actions: DashboardActionItem[]) {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const toneRank = rankActionTone(left.action.tone);
      const otherToneRank = rankActionTone(right.action.tone);

      if (toneRank !== otherToneRank) {
        return toneRank - otherToneRank;
      }

      return left.index - right.index;
    })
    .map(({ action }) => action);
}

export function buildDashboardActionItems(input: {
  dashboard: LeagueLandingDashboardProjection;
  draftsHome: DraftHomeProjection | null;
  tradesHome: TradeHomeResponse | null;
}): DashboardActionItem[] {
  const { dashboard, draftsHome, tradesHome } = input;
  const viewerRole = dashboard.viewer.leagueRole;
  const memberHasTeamScope = viewerRole === "MEMBER" && dashboard.viewer.hasTeamAccess;
  const actions: DashboardActionItem[] = [];
  const nextDeadline = firstRelevantDeadline(dashboard);

  if (memberHasTeamScope) {
    if (dashboard.pendingTradeActions.available) {
      const incoming = dashboard.pendingTradeActions.incomingProposalsCount;
      const awaitingProcessing = dashboard.pendingTradeActions.awaitingProcessingCount;
      const outgoing = dashboard.pendingTradeActions.outgoingProposalsCount;
      const tradeTone =
        awaitingProcessing > 0
          ? "critical"
          : incoming > 0
            ? "warning"
            : "accent";

      actions.push({
        id: "trade-review",
        eyebrow: "Trade Workflow",
        title:
          incoming > 0
            ? "Respond to incoming trade proposals"
            : awaitingProcessing > 0
              ? "Process accepted trades"
              : "Open your trade queue",
        description:
          incoming > 0 || awaitingProcessing > 0 || outgoing > 0
            ? `${countLabel(incoming, "incoming proposal")} · ${countLabel(awaitingProcessing, "accepted proposal")} ready for processing · ${countLabel(outgoing, "outgoing proposal")} still open.`
            : "No trade is blocked right now, but this remains your fastest route back to proposals, counters, and responses.",
        href: "/trades",
        ctaLabel: "Open Trades",
        tone: tradeTone,
        badge:
          incoming > 0
            ? `${incoming} incoming`
            : awaitingProcessing > 0
              ? `${awaitingProcessing} ready`
              : undefined,
        meta: dashboard.pendingTradeActions.latestProposal
          ? `Latest update: ${formatEnumLabel(dashboard.pendingTradeActions.latestProposal.status)} vs ${dashboard.pendingTradeActions.latestProposal.counterpartyTeamName}`
          : "As team manager, stay in the canonical trade workflow for every approval and counter.",
        testId: "owner-action-trade-review",
        linkTestId: "owner-action-link-trade-review",
        mobileTestId: "dashboard-mobile-action-trade-review",
      });
    }

    if (dashboard.teamDashboard) {
      const teamDashboard = dashboard.teamDashboard;
      const teamTone =
        teamDashboard.rosterCapSummary.mirrorOnly
          ? "warning"
          : toneForSeverity(teamDashboard.complianceSummary.highestSeverity);
      const teamHref =
        teamDashboard.complianceSummary.openIssueCount > 0
          ? `/teams/${teamDashboard.team.id}#compliance`
          : `/teams/${teamDashboard.team.id}`;

      actions.push({
        id: "roster-cap",
        eyebrow: "Manager Workspace",
        title:
          teamDashboard.complianceSummary.openIssueCount > 0
            ? "Resolve roster and cap blockers"
            : "Review My Roster / Cap",
        description:
          teamDashboard.complianceSummary.openIssueCount > 0
            ? `${countLabel(teamDashboard.complianceSummary.openIssueCount, "open issue")} still shape your roster and contract posture.`
            : `${formatCurrency(teamDashboard.rosterCapSummary.capSpaceHard)} hard-cap room and ${countLabel(teamDashboard.contractSummary.expiringContractsCount, "expiring contract")} are ready for review.`,
        href: teamHref,
        ctaLabel: "Open My Roster / Cap",
        tone: teamTone,
        badge:
          teamDashboard.complianceSummary.openIssueCount > 0
            ? countLabel(teamDashboard.complianceSummary.openIssueCount, "issue")
            : teamDashboard.rosterCapSummary.mirrorOnly
              ? "Mirror-only"
              : undefined,
        meta:
          teamDashboard.rosterCapSummary.mirrorOnly
            ? "Regular-season roster state stays mirror-only here while cap, contracts, and compliance remain visible."
            : "As team manager, confirm roster, cap, and contract decisions from this workspace.",
      });
    }

    if (draftsHome && (activeDraftSummary(draftsHome) || draftsHome.myRookiePicks?.available)) {
      const activeDraft = activeDraftSummary(draftsHome);
      const totalOwnedPicks =
        draftsHome.myRookiePicks?.seasons.reduce((sum, season) => sum + season.totalCount, 0) ?? 0;

      actions.push({
        id: "draft-prep",
        eyebrow: "Picks & Draft",
        title:
          activeDraft?.status === "IN_PROGRESS"
            ? "A draft session is live"
            : "Draft prep is open",
        description:
          activeDraft
            ? `${activeDraft.title} is ${formatEnumLabel(activeDraft.status).toLowerCase()} for Season ${draftsHome.season.year}.`
            : `${countLabel(totalOwnedPicks, "rookie pick")} remain in the current draft window.`,
        href: "/draft",
        ctaLabel: "Open Picks & Draft",
        tone: activeDraft?.status === "IN_PROGRESS" ? "warning" : "default",
        badge: totalOwnedPicks > 0 ? countLabel(totalOwnedPicks, "pick") : undefined,
        meta: "Review owned picks and draft posture before opening the full draft workspace.",
        testId: "owner-action-draft-prep",
        linkTestId: "owner-action-link-draft-prep",
      });
    }

    actions.push({
      id: "rules-deadlines",
      eyebrow: "Rules & Deadlines",
      title:
        nextDeadline && nextDeadline.urgency === "overdue"
          ? "A deadline already passed"
        : nextDeadline && nextDeadline.urgency === "today"
          ? "A deadline lands today"
          : "Confirm the next deadline before your next move",
      description: nextDeadline
        ? `${formatEnumLabel(nextDeadline.deadlineType)} · ${formatLeaguePhaseLabel(nextDeadline.phase)} · ${daysUntilLabel(nextDeadline.daysUntilDue)}.`
        : "No deadline is scheduled yet, but the rules screen stays authoritative for the active phase.",
      href: "/rules",
      ctaLabel: "Open Rules & Deadlines",
      tone: nextDeadline ? toneForUrgency(nextDeadline.urgency) : "default",
      badge: nextDeadline ? formatEnumLabel(nextDeadline.urgency) : undefined,
      meta: "Confirm the current phase, linked issues, and phase-specific rules before taking action.",
      testId: "owner-action-rules-deadlines",
      linkTestId: "owner-action-link-rules-deadlines",
    });

    return sortActions(actions);
  }

  if (viewerRole === "COMMISSIONER") {
    if (dashboard.setupChecklist.available && !dashboard.setupChecklist.isComplete && dashboard.setupChecklist.primaryAction) {
      actions.push({
        id: dashboard.setupChecklist.primaryAction.id,
        eyebrow: "League Setup",
        title: dashboard.setupChecklist.primaryAction.title,
        description: dashboard.setupChecklist.primaryAction.description,
        href: dashboard.setupChecklist.primaryAction.href,
        ctaLabel: dashboard.setupChecklist.primaryAction.ctaLabel,
        tone: dashboard.setupChecklist.primaryAction.tone,
        badge: `${dashboard.setupChecklist.completedItemCount}/${dashboard.setupChecklist.totalItemCount} complete`,
        meta: `Commissioner setup checklist is ${dashboard.setupChecklist.completionPercent}% complete.`,
        testId: "commissioner-action-setup-primary",
        linkTestId: "commissioner-action-link-setup-primary",
        mobileTestId: "dashboard-mobile-action-setup-primary",
      });
    }

    const reviewQueueCount = tradesHome?.summary.reviewQueue ?? 0;
    const settlementQueueCount = tradesHome?.summary.settlementQueue ?? 0;
    const activeDraft = activeDraftSummary(draftsHome);

    actions.push({
      id: "trade-approvals",
      eyebrow: "Trade Workflow",
      title:
        reviewQueueCount > 0
          ? "Approve pending trade proposals"
          : "Review commissioner trade approvals",
      description:
        reviewQueueCount > 0
          ? `${countLabel(reviewQueueCount, "proposal")} still require commissioner review.`
          : "No proposal is waiting for review, but this remains your authoritative approval queue.",
      href: "/trades",
      ctaLabel: "Open Trades",
      tone: reviewQueueCount > 0 ? "warning" : "accent",
      badge: reviewQueueCount > 0 ? `${reviewQueueCount} awaiting` : undefined,
      meta: "Open the proposal-first trade queue for review snapshots and commissioner decisions.",
      testId: "commissioner-action-trade-approvals",
      linkTestId: "commissioner-action-link-trade-approvals",
    });

    actions.push({
      id: "trade-processing",
      eyebrow: "Trade Workflow",
      title:
        settlementQueueCount > 0
          ? "Process accepted trades"
          : "Review trade settlement queue",
      description:
        settlementQueueCount > 0
          ? `${countLabel(settlementQueueCount, "proposal")} are ready for settlement.`
          : "No accepted proposal is waiting for settlement.",
      href: "/trades",
      ctaLabel: "Open Trades",
      tone: settlementQueueCount > 0 ? "critical" : "default",
      badge: settlementQueueCount > 0 ? `${settlementQueueCount} ready` : undefined,
      meta: "Stay inside the canonical trade workflow instead of reopening diagnostics or legacy utilities.",
      testId: "commissioner-action-trade-processing",
    });

    if (draftsHome) {
      const draftActionId =
        activeDraft?.status === "IN_PROGRESS" ? "draft-live" : "draft-ready";
      const draftTestId =
        activeDraft?.status === "IN_PROGRESS"
          ? "commissioner-action-draft-live"
          : "commissioner-action-draft-ready";
      const draftLinkTestId =
        activeDraft?.status === "IN_PROGRESS"
          ? "commissioner-action-link-draft-live"
          : "commissioner-action-link-draft-ready";

      actions.push({
        id: draftActionId,
        eyebrow: "Picks & Draft",
        title:
          activeDraft?.status === "IN_PROGRESS"
            ? "Run live draft operations"
            : "Confirm draft readiness",
        description:
          activeDraft
            ? `${activeDraft.title} is ${formatEnumLabel(activeDraft.status).toLowerCase()} and should stay visible from the canonical draft surface.`
            : draftsHome.setupStatus.needsDraftCreation
              ? "No rookie draft exists for the current season yet."
              : "Review rookie and veteran draft posture from the canonical draft home surface.",
        href: "/draft",
        ctaLabel: "Open Picks & Draft",
        tone: activeDraft?.status === "IN_PROGRESS" ? "warning" : "default",
        badge:
          activeDraft
            ? `${activeDraft.progress.picksMade}/${activeDraft.progress.totalPicks || 0}`
            : undefined,
        meta: "Open the draft hub for order generation, live rooms, and auction status.",
        testId: draftTestId,
        linkTestId: draftLinkTestId,
      });
    }

    actions.push({
      id: "rules-deadlines",
      eyebrow: "Rules & Deadlines",
      title:
        nextDeadline && nextDeadline.urgency === "overdue"
          ? "Rules follow-up is overdue"
          : "Keep league deadlines visible",
      description: nextDeadline
        ? `${formatEnumLabel(nextDeadline.deadlineType)} · ${daysUntilLabel(nextDeadline.daysUntilDue)}.`
        : "Open Rules & Deadlines to confirm the current phase and lifecycle posture.",
      href: "/rules",
      ctaLabel: "Open Rules & Deadlines",
      tone: nextDeadline ? toneForUrgency(nextDeadline.urgency) : "default",
      badge: nextDeadline ? formatEnumLabel(nextDeadline.urgency) : undefined,
      meta: "Use the canonical rules surface for lifecycle timing and league-wide deadline visibility.",
      testId: "commissioner-action-rules-deadlines",
      linkTestId: "commissioner-action-link-rules-deadlines",
    });

    return sortActions(actions);
  }

  actions.push(
    {
      id: "rules-deadlines",
      eyebrow: "Rules & Deadlines",
      title: "Review the next league deadline",
      description: nextDeadline
        ? `${formatEnumLabel(nextDeadline.deadlineType)} · ${daysUntilLabel(nextDeadline.daysUntilDue)}.`
        : "Open Rules & Deadlines to confirm the active phase and pending deadlines.",
      href: "/rules",
      ctaLabel: "Open Rules & Deadlines",
      tone: nextDeadline ? toneForUrgency(nextDeadline.urgency) : "default",
      badge: nextDeadline ? formatEnumLabel(nextDeadline.urgency) : undefined,
      meta: "Members without team assignment should still anchor on the authoritative rules surface first.",
      testId: "read-only-action-rules-deadlines",
      linkTestId: "read-only-action-link-rules-deadlines",
    },
    {
      id: "league-activity",
      eyebrow: "League Activity",
      title: "See what changed across the league",
      description: dashboard.activitySummary.recentActivity.length > 0
        ? `${countLabel(dashboard.activitySummary.recentActivity.length, "recent activity item")} are already visible in the feed.`
        : dashboard.activitySummary.emptyStateReason ?? "Open the activity log for the latest commissioner notes and transactions.",
      href: "/activity",
      ctaLabel: "Open League Activity",
      tone: dashboard.notificationSummary.unreadCount > 0 ? "accent" : "default",
      badge:
        dashboard.notificationSummary.unreadCount > 0
          ? countLabel(dashboard.notificationSummary.unreadCount, "unread")
          : undefined,
      meta: "Use the full feed for the complete transaction trail and commissioner notes.",
    },
    {
      id: "browse-teams",
      eyebrow: "Reference",
      title: "Browse league teams",
      description: "Open the teams directory for team-by-team posture, rosters, and franchise reads.",
      href: "/teams",
      ctaLabel: "Browse Teams",
      tone: "default",
      meta: "Reference routes stay secondary to the action center, but remain canonical for reads.",
    },
  );

  return sortActions(actions);
}

export function buildDashboardChangeItems(
  dashboard: LeagueLandingDashboardProjection,
): DashboardChangeFeedItem[] {
  const items: DashboardChangeFeedItem[] = [];

  for (const item of dashboard.notificationSummary.items.slice(0, 2)) {
    items.push({
      id: `notification-${item.id}`,
      eyebrow: `Unread ${formatEnumLabel(item.category)}`,
      title: item.title,
      description: item.body,
      timestamp: formatDateTime(item.createdAt),
      tone:
        item.category === "compliance"
          ? "warning"
          : item.category === "commissioner"
            ? "accent"
            : "default",
    });
  }

  if (dashboard.activitySummary.commissionerNote && items.length < 3) {
    items.push({
      id: `note-${dashboard.activitySummary.commissionerNote.id}`,
      eyebrow: "Commissioner Note",
      title: dashboard.activitySummary.commissionerNote.reason,
      description:
        dashboard.activitySummary.commissionerNote.actorName
          ? `Posted by ${dashboard.activitySummary.commissionerNote.actorName}.`
          : "Recent commissioner guidance for this league scope.",
      timestamp: formatDateTime(dashboard.activitySummary.commissionerNote.createdAt),
      tone: "accent",
    });
  }

  for (const activity of dashboard.activitySummary.recentActivity) {
    if (items.length >= 3) {
      break;
    }

    items.push({
      id: `activity-${activity.id}`,
      eyebrow: "League Activity",
      title: activity.summary,
      description: [
        activity.team?.name ?? null,
        activity.player?.name ?? null,
      ]
        .filter(Boolean)
        .join(" · ") || "Recent activity in the current league scope.",
      timestamp: formatDateTime(activity.createdAt),
      tone: "default",
    });
  }

  return items;
}

export function buildDashboardDeadlineCards(
  dashboard: LeagueLandingDashboardProjection,
): DashboardDeadlineCardItem[] {
  return dashboard.deadlineSummary.upcomingDeadlines.slice(0, 3).map((deadline) => ({
    id: deadline.id,
    title: formatEnumLabel(deadline.deadlineType),
    subtitle: `${formatLeaguePhaseLabel(deadline.phase)} · ${formatDate(deadline.scheduledAt)}`,
    detail: `${countLabel(deadline.openIssueCount, "linked issue")} · ${daysUntilLabel(deadline.daysUntilDue)}`,
    badge: formatEnumLabel(deadline.urgency),
    tone: toneForUrgency(deadline.urgency),
  }));
}

export function buildDashboardHealthItems(input: {
  dashboard: LeagueLandingDashboardProjection;
  draftsHome: DraftHomeProjection | null;
  tradesHome: TradeHomeResponse | null;
}): DashboardHealthSummaryItem[] {
  const { dashboard, draftsHome, tradesHome } = input;
  const items: DashboardHealthSummaryItem[] = [];
  const nextDeadline = firstRelevantDeadline(dashboard);
  const leagueTone =
    dashboard.leagueDashboard.status.alertLevel === "critical"
      ? "critical"
      : dashboard.leagueDashboard.status.alertLevel === "warning" ||
          dashboard.leagueDashboard.status.alertLevel === "setup_required"
        ? "warning"
        : "default";

  items.push({
    id: "league-health",
    eyebrow: "League Watch",
    title: "League Health",
    value: String(dashboard.leagueDashboard.summary.openIssueCount),
    detail: dashboard.leagueDashboard.summary.openIssueCount > 0
      ? `Requires your attention — blocking league progress`
      : `All systems operational across the league`,
    tone: leagueTone,
    testId: "dashboard-league-standings",
    actionHref: dashboard.leagueDashboard.summary.openIssueCount > 0 ? "/commissioner" : undefined,
    actionLabel: dashboard.leagueDashboard.summary.openIssueCount > 0 ? "Review Issues" : undefined,
  });

  if (dashboard.viewer.leagueRole === "MEMBER" && dashboard.viewer.hasTeamAccess && dashboard.teamDashboard) {
    items.push({
      id: "team-health",
      eyebrow: "My Team",
      title: "Team Health",
      value:
        dashboard.teamDashboard.complianceSummary.openIssueCount > 0
          ? String(dashboard.teamDashboard.complianceSummary.openIssueCount)
          : formatCurrency(dashboard.teamDashboard.rosterCapSummary.capSpaceHard),
      detail:
        dashboard.teamDashboard.complianceSummary.openIssueCount > 0
          ? `Compliance issues blocking your roster moves`
          : dashboard.teamDashboard.contractSummary.expiringContractsCount > 0
          ? `Decision deadlines approaching — review contracts` 
          : `Team ready for roster improvements`,
      tone:
        dashboard.teamDashboard.rosterCapSummary.mirrorOnly
          ? "warning"
          : toneForSeverity(dashboard.teamDashboard.complianceSummary.highestSeverity),
      actionHref: dashboard.teamDashboard.complianceSummary.openIssueCount > 0 
        ? `/teams/${dashboard.teamDashboard.team.id}`
        : dashboard.teamDashboard.contractSummary.expiringContractsCount > 0
        ? `/contracts`
        : undefined,
      actionLabel: dashboard.teamDashboard.complianceSummary.openIssueCount > 0 
        ? "Fix Issues"
        : dashboard.teamDashboard.contractSummary.expiringContractsCount > 0
        ? "Review Contracts"
        : undefined,
    });
  } else if (dashboard.viewer.leagueRole === "COMMISSIONER") {
    const queueCount =
      (tradesHome?.summary.reviewQueue ?? 0) + (tradesHome?.summary.settlementQueue ?? 0);

    items.push({
      id: "trade-queue",
      eyebrow: "Commissioner Queue",
      title: "Trade Queue",
      value: String(queueCount),
      detail: queueCount > 0 
        ? `Trade decisions waiting for your approval`
        : `No trade activity requires your attention`,
      tone: queueCount > 0 ? "warning" : "default",
      actionHref: queueCount > 0 ? "/trades" : undefined,
      actionLabel: queueCount > 0 ? "Review Trades" : undefined,
    });
  } else {
    items.push({
      id: "updates",
      eyebrow: "League View",
      title: "Unread Updates",
      value: String(dashboard.notificationSummary.unreadCount),
      detail:
        dashboard.notificationSummary.unreadCount > 0
          ? `New league activity needs your review`
          : "You're caught up on all league activity",
      tone: dashboard.notificationSummary.unreadCount > 0 ? "accent" : "default",
      actionHref: dashboard.notificationSummary.unreadCount > 0 ? "/activity" : undefined,
      actionLabel: dashboard.notificationSummary.unreadCount > 0 ? "View Activity" : undefined,
    });
  }

  items.push({
    id: "rules",
    eyebrow: "Rules & Deadlines",
    title: "Current Phase",
    value: formatLeaguePhaseLabel(dashboard.leagueDashboard.season?.currentPhase ?? null),
    detail: nextDeadline
      ? nextDeadline.daysUntilDue <= 7
        ? "Deadline approaching — plan your moves now"
        : "Next deadline scheduled for this phase"
      : "League schedule is stable right now",
    tone: nextDeadline ? toneForUrgency(nextDeadline.urgency) : "default",
    testId: "dashboard-league-rules",
    actionHref: "/rules",
    actionLabel: "View Rules",
  });

  const activeDraft = activeDraftSummary(draftsHome);
  items.push({
    id: "updates-summary",
    eyebrow: "Recent Change",
    title: "Unread in App",
    value: String(dashboard.notificationSummary.unreadCount),
    detail: activeDraft
      ? `Active draft requires your participation`
      : dashboard.activitySummary.recentActivity.length > 0
        ? `Recent activity may affect your strategy`
        : "No recent changes to track",
    tone: dashboard.notificationSummary.unreadCount > 0 ? "accent" : "default",
    actionHref: activeDraft 
      ? `/draft/session/${activeDraft.id}`
      : dashboard.activitySummary.recentActivity.length > 0 
      ? "/activity"
      : undefined,
    actionLabel: activeDraft 
      ? "Join Draft"
      : dashboard.activitySummary.recentActivity.length > 0 
      ? "Review Activity"
      : undefined,
  });

  return items;
}

export function dashboardScopeLabel(viewer: LeagueLandingDashboardProjection["viewer"]) {
  if (viewer.leagueRole === "COMMISSIONER") {
    return viewer.hasTeamAccess ? "Commissioner + Team scope" : "Commissioner scope";
  }

  if (viewer.hasTeamAccess) {
    return "Member + Team scope";
  }

  return "Member scope";
}
