import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { analyzeTradeProposal, parseTradeRequest } from "@/lib/trades";
import { TradeAnalyzeRequest, TradeAnalyzeResponse } from "@/types/trade";

export async function POST(request: NextRequest) {
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const season = await prisma.season.findUnique({
    where: {
      id: context.seasonId,
    },
    select: {
      phase: true,
    },
  });

  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  const body = (await request.json().catch(() => ({}))) as TradeAnalyzeRequest;
  const parsed = parseTradeRequest(body);

  if (!parsed.request) {
    return apiError(400, "INVALID_TRADE_REQUEST", "Trade request payload is invalid.", {
      findings: parsed.findings,
    });
  }
  if (
    auth.actor?.leagueRole === "MEMBER" &&
    auth.actor.teamId &&
    parsed.request.teamAId !== auth.actor.teamId &&
    parsed.request.teamBId !== auth.actor.teamId
  ) {
    return apiError(
      403,
      "FORBIDDEN",
      "Members can only analyze trades involving their assigned team.",
    );
  }

  if (auth.actor?.leagueRole === "MEMBER" && !auth.actor.teamId) {
    return apiError(
      403,
      "FORBIDDEN",
      "Member account is not assigned to a team for trade analysis.",
    );
  }

  const analysis = await analyzeTradeProposal(
    {
      league: context,
      seasonPhase: season.phase,
    },
    parsed.request,
  );

  const response: TradeAnalyzeResponse = {
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
      phase: season.phase,
    },
    trade: analysis.trade,
    legal: analysis.legal,
    findings: analysis.findings,
    assets: analysis.assets,
    impact: analysis.impact,
  };

  return NextResponse.json(response);
}
