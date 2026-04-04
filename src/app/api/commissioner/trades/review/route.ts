import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createTradeProposalRepository } from "@/lib/repositories/trades/trade-proposal-repository";
import { mapTradeProposalSummary } from "@/lib/read-models/trades/shared";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context } = access;

  const season = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
  });
  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  const proposals = await createTradeProposalRepository(prisma).listBySeason({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    statuses: ["REVIEW_PENDING"],
  });

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
      phase: season.phase,
    },
    proposals: proposals.map(mapTradeProposalSummary),
  });
}

