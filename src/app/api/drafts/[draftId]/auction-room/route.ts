import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { createEnhancedAuctionRoomProjection, type EnhancedAuctionRoomProjection } from "@/lib/read-models/auction/enhanced-auction-room-projection";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

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
  if (auth.response || !auth.actor) {
    return auth.response ?? apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const projection = await createEnhancedAuctionRoomProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    seasonYear: context.seasonYear,
    draftId,
    actor: {
      leagueRole: auth.actor.leagueRole,
      teamId: auth.actor.teamId,
    },
    search: request.nextUrl.searchParams.get("search"),
    status: request.nextUrl.searchParams.get("status"),
    position: request.nextUrl.searchParams.get("position"),
  });

  if (!projection) {
    return apiError(404, "AUCTION_ROOM_NOT_FOUND", "Veteran auction room could not be resolved.");
  }

  const response: EnhancedAuctionRoomProjection = projection;
  return NextResponse.json(response);
}
