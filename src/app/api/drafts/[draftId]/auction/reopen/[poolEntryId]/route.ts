import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createAuctionBiddingService } from "@/lib/domain/auction/auction-bidding-service";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    draftId: string;
    poolEntryId: string;
  }>;
};

type AuctionReopenRequest = {
  reason?: unknown;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { draftId, poolEntryId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const body = (await request.json().catch(() => ({}))) as AuctionReopenRequest;
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "";

  if (!reason) {
    return apiError(400, "INVALID_REQUEST", "reason is required for auction entry reopen.");
  }

  const service = createAuctionBiddingService(prisma);

  try {
    const result = await service.reopenAuctionEntry({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId,
      poolEntryId,
      reason,
      actor: {
        userId: auth.actor.userId,
        leagueRole: auth.actor.leagueRole,
      },
    });

    return NextResponse.json({ success: true, entryId: result.entryId });
  } catch (serviceError) {
    if (service.isActionError(serviceError)) {
      return apiError(serviceError.status, serviceError.code, serviceError.message, serviceError.context);
    }
    
    console.error("Auction reopen failed:", serviceError);
    return apiError(500, "AUCTION_REOPEN_FAILED", "Failed to reopen auction entry.");
  }
}
