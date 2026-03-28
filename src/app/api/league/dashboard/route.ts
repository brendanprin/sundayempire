import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createLeagueLandingDashboardService } from "@/lib/application/dashboard/get-league-landing-dashboard";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }
  if (!auth.actor) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const dashboard = await createLeagueLandingDashboardService(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: auth.actor,
  });

  if (!dashboard) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "League landing dashboard could not be resolved.");
  }

  return NextResponse.json(dashboard);
}
