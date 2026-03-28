import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createSyncIssueDetailProjection } from "@/lib/read-models/sync/sync-issue-detail-projection";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ issueId: string }> },
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
