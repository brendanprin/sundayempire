import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import { formatSyncMismatchEscalatedActivity } from "@/lib/domain/activity/formatters";
import { prisma } from "@/lib/prisma";
import { createSyncIssueDetailProjection } from "@/lib/read-models/sync/sync-issue-detail-projection";
import { parseJsonBody } from "@/lib/request";
import { createSyncResolutionService } from "@/lib/domain/sync/sync-resolution-service";

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ issueId: string }> },
) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { actor, context: leagueContext } = access;

  const params = await routeContext.params;
  const issueId = params.issueId?.trim();
  if (!issueId) {
    return apiError(400, "INVALID_REQUEST", "issueId is required.");
  }

  const json = await parseJsonBody<{ reason?: unknown }>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  try {
    await createSyncResolutionService(prisma).escalateToCompliance({
      mismatchId: issueId,
      reason: typeof body.reason === "string" ? body.reason : null,
      actorUserId: actor?.userId ?? null,
      actorRoleSnapshot: actor?.leagueRole ?? null,
      actor: actor
        ? {
            email: actor.email,
            leagueRole: actor.leagueRole,
            teamId: actor.teamId,
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
      actorUserId: actor?.userId ?? null,
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
