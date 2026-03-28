import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";
import { PILOT_EVENT_CATEGORIES, PILOT_EVENT_TYPES } from "@/types/pilot";

function toCountMap<T extends { _count: { _all: number } }>(
  rows: T[],
  getKey: (row: T) => string,
) {
  return Object.fromEntries(rows.map((row) => [getKey(row), row._count._all]));
}

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const sinceHours = Math.min(parseIntegerParam(request.nextUrl.searchParams.get("sinceHours")) ?? 24 * 7, 24 * 30);
  if (sinceHours < 1) {
    return apiError(400, "INVALID_REQUEST", "sinceHours must be a positive integer.");
  }

  const limit = Math.min(parseIntegerParam(request.nextUrl.searchParams.get("limit")) ?? 200, 500);
  if (limit < 1) {
    return apiError(400, "INVALID_REQUEST", "limit must be a positive integer.");
  }

  const category = request.nextUrl.searchParams.get("category");
  if (category && !PILOT_EVENT_CATEGORIES.includes(category as (typeof PILOT_EVENT_CATEGORIES)[number])) {
    return apiError(400, "INVALID_REQUEST", "category filter is invalid.");
  }

  const eventType = request.nextUrl.searchParams.get("eventType");
  const entityId = request.nextUrl.searchParams.get("entityId");
  const from = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const where = {
    leagueId: context.leagueId,
    createdAt: {
      gte: from,
    },
    ...(category ? { eventCategory: category } : {}),
    ...(eventType ? { eventType } : {}),
    ...(entityId ? { entityId } : {}),
  };

  const [events, byTypeRows, byCategoryRows, feedbackByStatus] = await Promise.all([
    prisma.pilotEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        eventCategory: true,
        eventStep: true,
        status: true,
        entityType: true,
        entityId: true,
        pagePath: true,
        actorEmail: true,
        actorRole: true,
        actorTeamId: true,
        requestPath: true,
        requestMethod: true,
        context: true,
        createdAt: true,
      },
    }),
    prisma.pilotEvent.groupBy({
      by: ["eventType"],
      where,
      _count: { _all: true },
    }),
    prisma.pilotEvent.groupBy({
      by: ["eventCategory"],
      where,
      _count: { _all: true },
    }),
    prisma.pilotFeedback.groupBy({
      by: ["status"],
      where: {
        leagueId: context.leagueId,
        createdAt: {
          gte: from,
        },
      },
      _count: { _all: true },
    }),
  ]);

  const byType = toCountMap(byTypeRows, (row) => row.eventType);
  const byCategory = toCountMap(byCategoryRows, (row) => row.eventCategory);
  const feedbackStatusCounts = toCountMap(feedbackByStatus, (row) => row.status);

  const tradeProposed = byType[PILOT_EVENT_TYPES.TRADE_PROPOSAL_CREATED] ?? 0;
  const tradeAccepted = byType[PILOT_EVENT_TYPES.TRADE_ACCEPTED] ?? 0;
  const tradeProcessed = byType[PILOT_EVENT_TYPES.TRADE_PROCESSED] ?? 0;
  const tradeRejected = byType[PILOT_EVENT_TYPES.TRADE_REJECTED] ?? 0;

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    window: {
      from: from.toISOString(),
      to: new Date().toISOString(),
      sinceHours,
    },
    filters: {
      category: category ?? null,
      eventType: eventType ?? null,
      entityId: entityId ?? null,
      limit,
    },
    totals: {
      events: events.length,
      byType,
      byCategory,
    },
    funnels: {
      trade: {
        proposed: tradeProposed,
        accepted: tradeAccepted,
        processed: tradeProcessed,
        rejected: tradeRejected,
        dropOffBeforeAcceptance: Math.max(tradeProposed - tradeAccepted - tradeRejected, 0),
        dropOffBeforeProcessing: Math.max(tradeAccepted - tradeProcessed, 0),
      },
      roster: {
        swap: byType[PILOT_EVENT_TYPES.ROSTER_SWAP_COMPLETED] ?? 0,
        move: byType[PILOT_EVENT_TYPES.ROSTER_MOVE_COMPLETED] ?? 0,
        add: byType[PILOT_EVENT_TYPES.ROSTER_ADD_COMPLETED] ?? 0,
        drop: byType[PILOT_EVENT_TYPES.ROSTER_DROP_COMPLETED] ?? 0,
        cut: byType[PILOT_EVENT_TYPES.ROSTER_CUT_COMPLETED] ?? 0,
      },
      commissioner: {
        phaseTransition: byType[PILOT_EVENT_TYPES.COMMISSIONER_PHASE_TRANSITION] ?? 0,
        complianceScan: byType[PILOT_EVENT_TYPES.COMMISSIONER_COMPLIANCE_SCAN] ?? 0,
        rolloverPreview: byType[PILOT_EVENT_TYPES.COMMISSIONER_ROLLOVER_PREVIEW] ?? 0,
        rolloverApply: byType[PILOT_EVENT_TYPES.COMMISSIONER_ROLLOVER_APPLY] ?? 0,
        fixPreview: byType[PILOT_EVENT_TYPES.COMMISSIONER_FIX_PREVIEW] ?? 0,
        fixApply: byType[PILOT_EVENT_TYPES.COMMISSIONER_FIX_APPLY] ?? 0,
        snapshotPreview: byType[PILOT_EVENT_TYPES.COMMISSIONER_SNAPSHOT_PREVIEW] ?? 0,
        snapshotApply: byType[PILOT_EVENT_TYPES.COMMISSIONER_SNAPSHOT_APPLY] ?? 0,
      },
      ui: {
        navLinkSelected: byType[PILOT_EVENT_TYPES.UI_NAV_LINK_SELECTED] ?? 0,
        dashboardViewed: byType[PILOT_EVENT_TYPES.UI_DASHBOARD_VIEWED] ?? 0,
        dashboardActionSelected: byType[PILOT_EVENT_TYPES.UI_DASHBOARD_ACTION_SELECTED] ?? 0,
        dashboardFirstAction: byType[PILOT_EVENT_TYPES.UI_DASHBOARD_FIRST_ACTION] ?? 0,
        leagueDirectoryViewed: byType[PILOT_EVENT_TYPES.UI_LEAGUE_DIRECTORY_VIEWED] ?? 0,
        leagueSelected: byType[PILOT_EVENT_TYPES.UI_LEAGUE_SELECTED] ?? 0,
        leagueHomeViewed: byType[PILOT_EVENT_TYPES.UI_LEAGUE_HOME_VIEWED] ?? 0,
        leagueHomeFirstAction: byType[PILOT_EVENT_TYPES.UI_LEAGUE_HOME_FIRST_ACTION] ?? 0,
        leagueSwitched: byType[PILOT_EVENT_TYPES.UI_LEAGUE_SWITCHED] ?? 0,
        teamBrowseViewed: byType[PILOT_EVENT_TYPES.UI_TEAM_BROWSE_VIEWED] ?? 0,
        teamBlockedMutation: byType[PILOT_EVENT_TYPES.UI_TEAM_BLOCKED_MUTATION] ?? 0,
        teamFollowupNavigated: byType[PILOT_EVENT_TYPES.UI_TEAM_FOLLOWUP_NAVIGATED] ?? 0,
        draftLauncherViewed: byType[PILOT_EVENT_TYPES.UI_DRAFT_LAUNCHER_VIEWED] ?? 0,
        draftTypeSelected: byType[PILOT_EVENT_TYPES.UI_DRAFT_TYPE_SELECTED] ?? 0,
        draftTypeViewed: byType[PILOT_EVENT_TYPES.UI_DRAFT_TYPE_VIEWED] ?? 0,
        draftSessionSelected: byType[PILOT_EVENT_TYPES.UI_DRAFT_SESSION_SELECTED] ?? 0,
        draftLifecycleAction: byType[PILOT_EVENT_TYPES.UI_DRAFT_LIFECYCLE_ACTION] ?? 0,
        authLoginViewed: byType[PILOT_EVENT_TYPES.UI_AUTH_LOGIN_VIEWED] ?? 0,
        authMagicLinkRequested: byType[PILOT_EVENT_TYPES.UI_AUTH_MAGIC_LINK_REQUESTED] ?? 0,
        authSignInSuccess: byType[PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_SUCCESS] ?? 0,
        authSignInFailure: byType[PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_FAILURE] ?? 0,
        authSessionReset: byType[PILOT_EVENT_TYPES.UI_AUTH_SESSION_RESET] ?? 0,
        authReturnToRedirect: byType[PILOT_EVENT_TYPES.UI_AUTH_RETURN_TO_REDIRECT] ?? 0,
      },
    },
    feedback: {
      total: Object.values(feedbackStatusCounts).reduce((sum, value) => sum + value, 0),
      byStatus: feedbackStatusCounts,
    },
    events,
  });
}
