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
  const access = await requireTradeLeagueRole(request, tradeId, ["COMMISSIONER", "MEMBER"]);
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

  if (auth.actor?.leagueRole === "MEMBER") {
    if (!auth.actor.teamId) {
      return apiError(
        403,
        "FORBIDDEN",
        "Member account is not assigned to a team for trade mutations.",
      );
    }

    if (trade.teamAId !== auth.actor.teamId && trade.teamBId !== auth.actor.teamId) {
      return apiError(
        403,
        "FORBIDDEN",
        "Members can only accept trades involving their assigned team.",
      );
    }
  }

  if (trade.status !== "PROPOSED") {
    return apiError(
      409,
      "TRADE_STATUS_INVALID",
      "Only proposed trades can be accepted.",
      {
        tradeId: trade.id,
        status: trade.status,
      },
    );
  }

  const accepted = await prisma.$transaction(async (tx) => {
    const updatedTrade = await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        status: "APPROVED",
      },
      include: tradeInclude,
    });

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Accepted trade between ${updatedTrade.teamA.name} and ${updatedTrade.teamB.name}.`,
      audit: {
        actor: auditActorFromRequestActor(auth.actor ?? null),
        source: "api/trades/[tradeId]/accept POST",
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
        acceptedByRole: auth.actor?.leagueRole,
        acceptedByTeamId: auth.actor?.teamId ?? null,
      },
    });

    await recordPilotEventSafe(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.TRADE_ACCEPTED,
      eventCategory: "trade",
      eventStep: "approval",
      status: "success",
      entityType: "trade",
      entityId: updatedTrade.id,
      ...requestTelemetry(request),
      context: {
        previousStatus: trade.status,
        nextStatus: updatedTrade.status,
        teamAId: updatedTrade.teamA.id,
        teamBId: updatedTrade.teamB.id,
        acceptedByRole: auth.actor?.leagueRole ?? null,
      },
    });

    return updatedTrade;
  });

  return NextResponse.json({
    trade: toTradeSummary(accepted),
  });
}
