import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createTradeProposalWorkflowService } from "@/lib/domain/trades/trade-proposal-service";
import { parseTradePackageRequest } from "@/lib/domain/trades/request";
import { prisma } from "@/lib/prisma";
import { createTradeProposalDetailProjection } from "@/lib/read-models/trades/trade-proposal-detail-projection";

function toMutationErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_REQUEST";

  if (code === "FORBIDDEN") {
    return apiError(403, code, "You do not have permission for this trade proposal action.");
  }
  if (code === "TEAM_NOT_FOUND" || code === "PLAYER_NOT_FOUND") {
    return apiError(404, code, "One or more trade assets could not be resolved.");
  }
  if (code === "TRADE_STATE_CONFLICT") {
    return apiError(409, code, "Trade proposal state no longer matches the requested action.");
  }

  return apiError(400, "INVALID_REQUEST", "Trade proposal payload was invalid.");
}

// Authoritative Sprint 7+ proposal workflow route.
export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
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
    const result = await createTradeProposalWorkflowService(prisma).createDraft({
      actor: auth.actor,
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
      return apiError(404, "TRADE_NOT_FOUND", "Trade proposal was created but could not be reloaded.");
    }

    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return toMutationErrorResponse(error);
  }
}
