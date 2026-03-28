import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireTradeProposalLeagueRole } from "@/lib/authorization";
import { createTradeProposalWorkflowService } from "@/lib/domain/trades/trade-proposal-service";
import { prisma } from "@/lib/prisma";
import { createTradeProposalDetailProjection } from "@/lib/read-models/trades/trade-proposal-detail-projection";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { proposalId } = await routeContext.params;
  const access = await requireTradeProposalLeagueRole(request, proposalId, [
    "COMMISSIONER", "MEMBER",
  ]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const season = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
  });
  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  try {
    const result = await createTradeProposalWorkflowService(prisma).evaluate({
      actor: auth.actor,
      proposalId,
    });

    const detail = await createTradeProposalDetailProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      seasonYear: context.seasonYear,
      seasonPhase: season.phase,
      leagueName: context.leagueName,
      actor: auth.actor,
      proposalId: result.proposalId,
    });

    if (!detail) {
      return apiError(404, "TRADE_NOT_FOUND", "Trade proposal could not be reloaded.");
    }

    return NextResponse.json(detail);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "FORBIDDEN") {
      return apiError(403, code, "You do not have permission to evaluate this proposal.");
    }
    if (code === "TRADE_NOT_FOUND") {
      return apiError(404, code, "Trade proposal was not found.");
    }
    return apiError(400, "INVALID_REQUEST", "Trade evaluation request was invalid.");
  }
}
