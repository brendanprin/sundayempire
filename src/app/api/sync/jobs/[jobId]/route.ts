import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createSyncJobsProjection } from "@/lib/read-models/sync/sync-jobs-projection";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const leagueContext = await getActiveLeagueContext();
  if (!leagueContext) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, leagueContext.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const params = await context.params;
  const jobId = params.jobId?.trim();
  if (!jobId) {
    return apiError(400, "INVALID_REQUEST", "jobId is required.");
  }

  const projection = await createSyncJobsProjection(prisma).read({
    leagueId: leagueContext.leagueId,
    seasonId: leagueContext.seasonId,
    jobId,
  });

  if (!projection?.job) {
    return apiError(404, "SYNC_JOB_NOT_FOUND", "Sync job was not found.");
  }

  return NextResponse.json(projection);
}
