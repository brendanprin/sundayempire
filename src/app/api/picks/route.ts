import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isActorTeamScopedMember, requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const seasonYear = parseIntegerParam(request.nextUrl.searchParams.get("seasonYear"));
  const round = parseIntegerParam(request.nextUrl.searchParams.get("round"));
  const memberTeamId =
    auth.actor && isActorTeamScopedMember(auth.actor) ? auth.actor.teamId : null;

  const picks = await prisma.futurePick.findMany({
    where: {
      leagueId: context.leagueId,
      ...(memberTeamId ? { currentTeamId: memberTeamId } : {}),
      ...(seasonYear ? { seasonYear } : {}),
      ...(round ? { round } : {}),
    },
    include: {
      originalTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      },
      currentTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      },
    },
    orderBy: [{ seasonYear: "asc" }, { round: "asc" }, { overall: "asc" }],
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
  });
}
