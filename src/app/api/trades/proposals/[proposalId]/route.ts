import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireTradeProposalLeagueRole } from "@/lib/authorization";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createTradeProposalDetailProjection } from "@/lib/read-models/trades/trade-proposal-detail-projection";
import { createTradeProposalWorkflowService } from "@/lib/domain/trades/trade-proposal-service";
import { parseTradePackageRequest } from "@/lib/domain/trades/request";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

function toUpdateErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_REQUEST";

  if (code === "FORBIDDEN") {
    return apiError(403, code, "You do not have permission to edit this trade proposal.");
  }
  if (code === "TRADE_NOT_FOUND") {
    return apiError(404, code, "Trade proposal was not found.");
  }
  if (code === "TRADE_STATE_CONFLICT") {
    return apiError(409, code, "Only draft proposals can be edited.");
  }

  return apiError(400, "INVALID_REQUEST", "Trade proposal payload was invalid.");
}

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { proposalId } = await routeContext.params;
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

  const season = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
  });
  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  const detail = await createTradeProposalDetailProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    seasonYear: context.seasonYear,
    seasonPhase: season.phase,
    leagueName: context.leagueName,
    actor: auth.actor,
    proposalId,
  });

  if (!detail) {
    return apiError(404, "TRADE_NOT_FOUND", "Trade proposal was not found.");
  }

  return NextResponse.json(detail);
}

export async function PUT(request: NextRequest, routeContext: RouteContext) {
  const { proposalId } = await routeContext.params;
  const access = await requireTradeProposalLeagueRole(request, proposalId, ["COMMISSIONER", "MEMBER"]);
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
    const parsed = parseTradePackageRequest(await request.json().catch(() => null));
    const result = await createTradeProposalWorkflowService(prisma).updateDraft({
      actor: auth.actor,
      proposalId,
      package: {
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        proposerTeamId: parsed.proposerTeamId,
        counterpartyTeamId: parsed.counterpartyTeamId,
        proposerAssets: parsed.proposerAssets,
        counterpartyAssets: parsed.counterpartyAssets,
      },
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
    return toUpdateErrorResponse(error);
  }
}
