import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createSyncIssuesQueueProjection } from "@/lib/read-models/sync/sync-issues-queue-projection";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const status = request.nextUrl.searchParams.get("status");
  const severity = request.nextUrl.searchParams.get("severity");
  const teamId = request.nextUrl.searchParams.get("teamId");

  const projection = await createSyncIssuesQueueProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    status,
    severity,
    teamId,
  });

  if (!projection) {
    return apiError(404, "SYNC_CONTEXT_NOT_FOUND", "Sync issue context could not be resolved.");
  }

  return NextResponse.json(projection);
}
