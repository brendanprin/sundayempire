import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createPlayerContractDetailProjection } from "@/lib/read-models/player/player-contract-detail-projection";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { playerId } = await routeContext.params;
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

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
