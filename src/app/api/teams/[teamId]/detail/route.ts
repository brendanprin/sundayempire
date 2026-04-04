import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createTeamCapDetailProjection } from "@/lib/read-models/team/team-cap-detail-projection";

type RouteContext = {
  params: Promise<{
    teamId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

  const detail = await createTeamCapDetailProjection(prisma).read({
    teamId,
    seasonId: context.seasonId,
  });

  if (!detail) {
    return apiError(404, "TEAM_NOT_FOUND", "Team detail could not be resolved in the active league.");
  }

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    detail,
  });
}
