import { NextRequest, NextResponse } from "next/server";
import { isActorTeamScopedMember } from "@/lib/auth";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return access.response;
  }

  const { actor, context } = access;
  const params = request.nextUrl.searchParams;

  const seasonYear = parseIntegerParam(params.get("seasonYear"));
  const round = parseIntegerParam(params.get("round"));
  const memberTeamId = isActorTeamScopedMember(actor) ? actor.teamId : null;

  const rawLimit = parseInt(params.get("limit") ?? "300", 10);
  const rawOffset = parseInt(params.get("offset") ?? "0", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 1000) : 300;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

  const picks = await prisma.futurePick.findMany({
    where: {
      leagueId: context.leagueId,
      ...(memberTeamId ? { currentTeamId: memberTeamId } : {}),
      ...(seasonYear ? { seasonYear } : {}),
      ...(round ? { round } : {}),
    },
    include: {
      originalTeam: {
        select: { id: true, name: true, abbreviation: true },
      },
      currentTeam: {
        select: { id: true, name: true, abbreviation: true },
      },
    },
    orderBy: [{ seasonYear: "asc" }, { round: "asc" }, { overall: "asc" }],
    take: limit,
    skip: offset,
  });

  const normalized = picks.map((pick) => ({
    id: pick.id,
    seasonYear: pick.seasonYear,
    round: pick.round,
    overall: pick.overall,
    status: pick.isUsed ? "used" : "available",
    originalTeam: pick.originalTeam,
    currentTeam: pick.currentTeam,
  }));

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    picks: normalized,
    pagination: {
      limit,
      offset,
      hasMore: picks.length === limit,
    },
  });
}
