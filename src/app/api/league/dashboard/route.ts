import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createLeagueLandingDashboardService } from "@/lib/application/dashboard/get-league-landing-dashboard";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const dashboard = await createLeagueLandingDashboardService(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor,
  });

  if (!dashboard) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "League landing dashboard could not be resolved.");
  }

  return NextResponse.json(dashboard);
}
