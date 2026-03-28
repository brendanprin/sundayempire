import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createAuctionBiddingService } from "@/lib/domain/auction/auction-bidding-service";
import { prisma } from "@/lib/prisma";
import { AuctionStatusSyncResponse } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const service = createAuctionBiddingService(prisma);

  try {
    const result = await service.syncAuctionState({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId,
      actorUserId: auth.actor.userId,
      actorRoleSnapshot: auth.actor.leagueRole,
    });

    const response: AuctionStatusSyncResponse = {
      ok: true,
      summary: {
        awardsCreated: result.awardsCreated,
        expiredCount: result.expiredCount,
        reviewRequiredCount: result.reviewRequiredCount,
        completed: result.completed,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (service.isActionError(error)) {
      return apiError(error.status, error.code, error.message, error.context);
    }

    return apiError(409, "AUCTION_STATUS_SYNC_FAILED", "Auction status sync could not be completed.");
  }
}
