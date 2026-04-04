import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createSyncIssueDetailProjection } from "@/lib/read-models/sync/sync-issue-detail-projection";

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ issueId: string }> },
) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context: leagueContext } = access;

  const params = await routeContext.params;
  const issueId = params.issueId?.trim();
  if (!issueId) {
    return apiError(400, "INVALID_REQUEST", "issueId is required.");
  }

  const projection = await createSyncIssueDetailProjection(prisma).read({
    leagueId: leagueContext.leagueId,
    seasonId: leagueContext.seasonId,
    issueId,
  });

  if (!projection) {
    return apiError(404, "SYNC_MISMATCH_NOT_FOUND", "Sync mismatch was not found.");
  }

  return NextResponse.json(projection);
}
