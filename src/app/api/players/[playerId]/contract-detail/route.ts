import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createPlayerContractDetailProjection } from "@/lib/read-models/player/player-contract-detail-projection";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { playerId } = await routeContext.params;
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, [
    "COMMISSIONER", "MEMBER",
  ]);
  if (auth.response) {
    return auth.response;
  }

  const detail = await createPlayerContractDetailProjection(prisma).read({
    leagueId: context.leagueId,
    playerId,
    seasonId: context.seasonId,
  });

  if (!detail) {
    return apiError(404, "PLAYER_NOT_FOUND", "Player detail could not be resolved in the active league.");
  }

  return NextResponse.json(detail);
}
