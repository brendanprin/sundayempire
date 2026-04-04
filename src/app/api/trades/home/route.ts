import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createTradesHomeProjection } from "@/lib/read-models/trades/trades-home-projection";

// Authoritative home read for the proposal-based trade workflow.
export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const season = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
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
    actor,
  });

  return NextResponse.json(payload);
}
