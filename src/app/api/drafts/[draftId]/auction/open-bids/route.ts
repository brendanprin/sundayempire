import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createAuctionBiddingService } from "@/lib/domain/auction/auction-bidding-service";
import { createAuctionRoomProjection } from "@/lib/read-models/auction/auction-room-projection";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { AuctionOpenBidRequest, VeteranAuctionRoomResponse } from "@/types/draft";

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
  const auth = { actor: access.actor };

  const json = await parseJsonBody<AuctionOpenBidRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const poolEntryId =
    typeof body.poolEntryId === "string" && body.poolEntryId.trim() ? body.poolEntryId.trim() : null;
  const salaryAmount = Number.isInteger(body.salaryAmount) ? Number(body.salaryAmount) : null;
  const contractYears = Number.isInteger(body.contractYears) ? Number(body.contractYears) : null;
  const biddingTeamId =
    typeof body.teamId === "string" && body.teamId.trim()
      ? body.teamId.trim()
      : auth.actor.teamId;

  if (!poolEntryId || salaryAmount === null || contractYears === null || !biddingTeamId) {
    return apiError(400, "INVALID_REQUEST", "poolEntryId, salaryAmount, contractYears, and team context are required.");
  }

  const service = createAuctionBiddingService(prisma);

  try {
    await service.placeOpenBid({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId,
      poolEntryId,
      biddingTeamId,
      salaryAmount,
      contractYears,
      actor: {
        userId: auth.actor.userId,
        leagueRole: auth.actor.leagueRole,
        teamId: auth.actor.teamId,
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
      // VA-S11: Enhanced bid rejection diagnostics
      // The error now includes structured context for better frontend error handling
      // 
      // Example error response structure:
      // {
      //   status: 409,
      //   code: "AUCTION_BID_INVALID", 
      //   message: "Open bids are not allowed for this player.",
      //   context: {
      //     rejectionType: "WRONG_ENTRY_STATUS",
      //     rejectionContext: {
      //       poolEntryStatus: "AWARDED",
      //       playerName: "Player Name",
      //       bidType: "OPEN",
      //       allowedStatuses: ["ELIGIBLE", "OPEN_BIDDING", "REOPENED"]
      //     }
      //   }
      // }
      //
      // Frontend can now distinguish between rejection types:
      // - WRONG_ENTRY_STATUS: Player not available for bidding
      // - CLOSED_BID_WINDOW: Bidding window closed 
      // - INSUFFICIENT_RAISE: Bid doesn't meet minimum increment
      // - BID_VALUE_TOO_LOW: Constitutional value not high enough
      // - CAP_VIOLATION: Would exceed salary cap
      // - PLAYER_RESTRICTED: Restricted player
      // - RULE_VIOLATION: Violates salary/year rules
      return apiError(error.status, error.code, error.message, error.context);
    }

    return apiError(409, "AUCTION_BID_FAILED", "Open bid could not be placed.");
  }
}
