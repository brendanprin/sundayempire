import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const queue = await createComplianceReadModels(prisma).readComplianceQueue({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
  });

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    queue,
  });
}
