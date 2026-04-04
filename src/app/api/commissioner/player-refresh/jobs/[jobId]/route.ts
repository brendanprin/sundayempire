import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createPlayerRefreshJobDetailProjection } from "@/lib/read-models/player/player-refresh-job-detail-projection";

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ jobId: string }> },
) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context: leagueContext } = access;

  const params = await routeContext.params;
  const jobId = params.jobId?.trim();
  if (!jobId) {
    return apiError(400, "INVALID_REQUEST", "jobId is required.");
  }

  const projection = await createPlayerRefreshJobDetailProjection(prisma).read({
    leagueId: leagueContext.leagueId,
    seasonId: leagueContext.seasonId,
    jobId,
  });

  if (!projection?.job) {
    return apiError(404, "PLAYER_REFRESH_JOB_NOT_FOUND", "Player refresh job was not found.");
  }

  return NextResponse.json(projection);
}
