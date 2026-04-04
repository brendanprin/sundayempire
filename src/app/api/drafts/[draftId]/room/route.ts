import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
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
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

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
