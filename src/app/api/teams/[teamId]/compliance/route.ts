import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { evaluateTeamCompliance } from "@/lib/compliance/service";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    teamId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
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

  const compliance = await evaluateTeamCompliance({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId,
  });

  if (!compliance) {
    return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
      teamId,
    });
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
    teamId,
    compliance,
    issues: queue.issues.filter((issue) => issue.teamId === teamId),
    remediationRecords: queue.remediationRecords.filter((record) => record.teamId === teamId),
  });
}
