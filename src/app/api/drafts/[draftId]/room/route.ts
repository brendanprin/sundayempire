import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createRookieDraftRoomProjection } from "@/lib/read-models/draft/rookie-draft-room-projection";
import { RookieDraftRoomResponse } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, [
    "COMMISSIONER", "MEMBER",
  ]);
  if (auth.response) {
    return auth.response;
  }
  if (!auth.actor) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }
  const actor = auth.actor;

  const params = request.nextUrl.searchParams;
  const projection = await createRookieDraftRoomProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    seasonYear: context.seasonYear,
    draftId,
    actor: {
      leagueRole: actor.leagueRole,
      teamId: actor.teamId,
    },
    search: params.get("search"),
    position: params.get("position"),
    tier: params.get("tier"),
    sortBy: params.get("sortBy"),
    sortDir: params.get("sortDir"),
    availableOnly: params.get("availableOnly") === "true",
  });

  if (!projection) {
    return apiError(404, "DRAFT_NOT_FOUND", "Rookie draft room was not found.");
  }

  const response: RookieDraftRoomResponse = projection;
  return NextResponse.json(response);
}
