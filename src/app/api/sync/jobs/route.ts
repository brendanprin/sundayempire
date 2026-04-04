import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createSyncJobsProjection } from "@/lib/read-models/sync/sync-jobs-projection";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context } = access;

  const statuses = request.nextUrl.searchParams.getAll("status");
  const jobTypes = request.nextUrl.searchParams.getAll("jobType");

  const projection = await createSyncJobsProjection(prisma).list({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    statuses: statuses.length > 0 ? (statuses as never) : undefined,
    jobTypes: jobTypes.length > 0 ? (jobTypes as never) : undefined,
  });

  if (!projection) {
    return apiError(404, "SYNC_CONTEXT_NOT_FOUND", "Sync job context could not be resolved.");
  }

  return NextResponse.json(projection);
}
