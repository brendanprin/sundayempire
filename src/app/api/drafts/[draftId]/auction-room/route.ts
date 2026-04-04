import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createEnhancedAuctionRoomProjection, type EnhancedAuctionRoomProjection } from "@/lib/read-models/auction/enhanced-auction-room-projection";
import { prisma } from "@/lib/prisma";

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

  const projection = await createEnhancedAuctionRoomProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    seasonYear: context.seasonYear,
    draftId,
    actor: {
      leagueRole: actor.leagueRole,
      teamId: actor.teamId,
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
