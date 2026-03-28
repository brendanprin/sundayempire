import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireTradeLeagueRole } from "@/lib/authorization";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { toTradeSummary, tradeInclude } from "@/lib/trades";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type RouteContext = {
  params: Promise<{
    tradeId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { tradeId } = await routeContext.params;
  const access = await requireTradeLeagueRole(request, tradeId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const auth = { actor: access.actor };

  const trade = await prisma.trade.findFirst({
    where: {
      id: tradeId,
      leagueId: context.leagueId,
      seasonId: context.seasonId,
    },
    include: tradeInclude,
  });

  if (!trade) {
    return apiError(404, "TRADE_NOT_FOUND", "Trade was not found in the active season.", {
      tradeId,
    });
  }

  if (trade.status !== "PROPOSED" && trade.status !== "APPROVED") {
    return apiError(
      409,
      "TRADE_STATUS_INVALID",
      "Only proposed or approved trades can be rejected.",
      {
        tradeId: trade.id,
        status: trade.status,
      },
    );
  }

  const rejected = await prisma.$transaction(async (tx) => {
    const updatedTrade = await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        status: "REJECTED",
      },
      include: tradeInclude,
    });

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Rejected trade between ${updatedTrade.teamA.name} and ${updatedTrade.teamB.name}.`,
      audit: {
        actor: auditActorFromRequestActor(auth.actor ?? null),
        source: "api/trades/[tradeId]/reject POST",
        entities: {
          tradeId: updatedTrade.id,
          teamAId: updatedTrade.teamA.id,
          teamBId: updatedTrade.teamB.id,
          assetCount: updatedTrade.assets.length,
        },
        before: {
          status: trade.status,
        },
        after: {
          status: updatedTrade.status,
        },
      },
      metadata: {
        rejectedFromStatus: trade.status,
      },
    });

    await recordPilotEventSafe(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.TRADE_REJECTED,
      eventCategory: "trade",
      eventStep: "resolution",
      status: "success",
      entityType: "trade",
      entityId: updatedTrade.id,
      ...requestTelemetry(request),
      context: {
        previousStatus: trade.status,
        nextStatus: updatedTrade.status,
        teamAId: updatedTrade.teamA.id,
        teamBId: updatedTrade.teamB.id,
      },
    });

    return updatedTrade;
  });

  return NextResponse.json({
    trade: toTradeSummary(rejected),
  });
}
