import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createTradesHomeProjection } from "@/lib/read-models/trades/trades-home-projection";

// Authoritative home read for the proposal-based trade workflow.
export async function GET(request: NextRequest) {
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

  const payload = await createTradesHomeProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    seasonYear: context.seasonYear,
    seasonPhase: season.phase,
    leagueName: context.leagueName,
    actor: auth.actor,
  });

  return NextResponse.json(payload);
}
