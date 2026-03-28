import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import { formatSyncMismatchEscalatedActivity } from "@/lib/domain/activity/formatters";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createSyncIssueDetailProjection } from "@/lib/read-models/sync/sync-issue-detail-projection";
import { createSyncResolutionService } from "@/lib/domain/sync/sync-resolution-service";

export async function POST(
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

  const body = (await request.json().catch(() => ({}))) as {
    reason?: unknown;
  };

  try {
    await createSyncResolutionService(prisma).escalateToCompliance({
      mismatchId: issueId,
      reason: typeof body.reason === "string" ? body.reason : null,
      actorUserId: auth.actor?.userId ?? null,
      actorRoleSnapshot: auth.actor?.leagueRole ?? null,
      actor: auth.actor
        ? {
            email: auth.actor.email,
            leagueRole: auth.actor.leagueRole,
            teamId: auth.actor.teamId,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to escalate sync mismatch.";
    if (message === "SYNC_MISMATCH_NOT_FOUND") {
      return apiError(404, "SYNC_MISMATCH_NOT_FOUND", "Sync mismatch was not found.");
    }
    if (message === "SYNC_MISMATCH_STATE_CONFLICT") {
      return apiError(409, "SYNC_MISMATCH_STATE_CONFLICT", "Sync mismatch is not open for escalation.");
    }
    if (message === "SYNC_MISMATCH_NOT_ESCALATABLE") {
      return apiError(400, "SYNC_MISMATCH_NOT_ESCALATABLE", "Only high-impact open mismatches can escalate to compliance.");
    }
    return apiError(400, "SYNC_ESCALATION_FAILED", message);
  }

  const projection = await createSyncIssueDetailProjection(prisma).read({
    leagueId: leagueContext.leagueId,
    seasonId: leagueContext.seasonId,
    issueId,
  });

  if (projection) {
    await createActivityPublisher(prisma).publishSafe({
      leagueId: leagueContext.leagueId,
      seasonId: leagueContext.seasonId,
      actorUserId: auth.actor?.userId ?? null,
      ...formatSyncMismatchEscalatedActivity({
        mismatchId: projection.mismatch.id,
        mismatchType: projection.mismatch.mismatchType,
        severity: projection.mismatch.severity,
        team: projection.mismatch.team
          ? {
              id: projection.mismatch.team.id,
              name: projection.mismatch.team.name,
            }
          : null,
        complianceIssueId: projection.mismatch.complianceIssue?.id ?? null,
        occurredAt: projection.mismatch.resolvedAt
          ? new Date(projection.mismatch.resolvedAt)
          : null,
      }),
    });
  }

  return NextResponse.json({ issue: projection });
}
