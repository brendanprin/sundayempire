import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createRookieSelectionService } from "@/lib/domain/draft/rookie-selection-service";
import { prisma } from "@/lib/prisma";
import { RookieDraftActionResponse, RookieDraftSelectActionRequest } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const actor = access.actor;

  const body = (await request.json().catch(() => ({}))) as RookieDraftSelectActionRequest;
  const playerId = typeof body.playerId === "string" && body.playerId.trim() ? body.playerId.trim() : null;
  if (!playerId) {
    return apiError(400, "INVALID_REQUEST", "playerId is required.");
  }

  const ruleset = await prisma.leagueRuleSet.findFirst({
    where: {
      leagueId: context.leagueId,
      isActive: true,
    },
    select: {
      rookieBaseYears: true,
    },
    orderBy: [{ version: "desc" }],
  });

  if (!ruleset) {
    return apiError(404, "RULESET_NOT_FOUND", "Active league ruleset was not found.");
  }

  const service = createRookieSelectionService();

  try {
    const result = await service.select({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      seasonYear: context.seasonYear,
      draftId,
      playerId,
      ruleset,
      actor: {
        userId: actor.userId,
        leagueRole: actor.leagueRole,
        teamId: actor.teamId,
      },
    });

    const response: RookieDraftActionResponse = {
      draft: result.draft,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (service.isActionError(error)) {
      return apiError(error.status, error.code, error.message, error.context);
    }

    return apiError(409, "DRAFT_ACTION_FAILED", "Rookie draft selection could not be completed.");
  }
}
