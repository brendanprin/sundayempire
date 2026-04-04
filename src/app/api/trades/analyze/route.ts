import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { analyzeTradeProposal, parseTradeRequest } from "@/lib/trades";
import { parseJsonBody } from "@/lib/request";
import { TradeAnalyzeRequest, TradeAnalyzeResponse } from "@/types/trade";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

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

  const json = await parseJsonBody<TradeAnalyzeRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const parsed = parseTradeRequest(body);

  if (!parsed.request) {
    return apiError(400, "INVALID_TRADE_REQUEST", "Trade request payload is invalid.", {
      findings: parsed.findings,
    });
  }
  if (
    actor?.leagueRole === "MEMBER" &&
    actor.teamId &&
    parsed.request.teamAId !== actor.teamId &&
    parsed.request.teamBId !== actor.teamId
  ) {
    return apiError(
      403,
      "FORBIDDEN",
      "Members can only analyze trades involving their assigned team.",
    );
  }

  if (actor?.leagueRole === "MEMBER" && !actor.teamId) {
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
