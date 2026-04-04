import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createAuctionBiddingService } from "@/lib/domain/auction/auction-bidding-service";
import { createAuctionRoomProjection } from "@/lib/read-models/auction/auction-room-projection";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { AuctionReviewRequest, VeteranAuctionRoomResponse } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
    entryId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { draftId, entryId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const json = await parseJsonBody<AuctionReviewRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const winningBidId =
    typeof body.winningBidId === "string" && body.winningBidId.trim() ? body.winningBidId.trim() : null;
  const reason = typeof body.reason === "string" ? body.reason : "";

  if (!winningBidId) {
    return apiError(400, "INVALID_REQUEST", "winningBidId is required.");
  }

  const service = createAuctionBiddingService(prisma);

  try {
    await service.reviewBlindTie({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId,
      poolEntryId: entryId,
      winningBidId,
      reason,
      actor: {
        userId: auth.actor.userId,
        leagueRole: auth.actor.leagueRole,
      },
    });

    const projection = await createAuctionRoomProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      seasonYear: context.seasonYear,
      draftId,
      actor: {
        leagueRole: auth.actor.leagueRole,
        teamId: auth.actor.teamId,
      },
    });

    if (!projection) {
      return apiError(404, "AUCTION_ROOM_NOT_FOUND", "Veteran auction room could not be resolved.");
    }

    const response: VeteranAuctionRoomResponse = projection;
    return NextResponse.json(response);
  } catch (error) {
    if (service.isActionError(error)) {
      return apiError(error.status, error.code, error.message, error.context);
    }

    return apiError(409, "AUCTION_REVIEW_FAILED", "Auction review could not be completed.");
  }
}
