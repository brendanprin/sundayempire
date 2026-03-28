import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireActorTeamScope, requireLeagueRole } from "@/lib/auth";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import {
  formatCommissionerRulingPublishedActivity,
  formatComplianceIssueResolvedActivity,
  formatComplianceIssueWaivedActivity,
} from "@/lib/domain/activity/formatters";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    issueId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { issueId } = await routeContext.params;
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const detail = await createComplianceReadModels(prisma).readIssueDetail({
    leagueId: context.leagueId,
    issueId,
  });

  if (!detail) {
    return apiError(404, "COMPLIANCE_ISSUE_NOT_FOUND", "Compliance issue was not found.");
  }

  if (auth.actor?.leagueRole === "MEMBER" && detail.issue.teamId) {
    const scopeResponse = requireActorTeamScope(auth.actor, detail.issue.teamId);
    if (scopeResponse) {
      return scopeResponse;
    }
  }

  return NextResponse.json(detail);
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { issueId } = await routeContext.params;
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const issue = await prisma.complianceIssue.findFirst({
    where: {
      id: issueId,
      leagueId: context.leagueId,
    },
    select: {
      id: true,
      teamId: true,
      status: true,
      title: true,
    },
  });

  if (!issue) {
    return apiError(404, "COMPLIANCE_ISSUE_NOT_FOUND", "Compliance issue was not found.");
  }

  const body = (await request.json()) as {
    status?: unknown;
    notes?: unknown;
    reason?: unknown;
  };

  if (
    typeof body.status !== "string" ||
    !["OPEN", "IN_REVIEW", "RESOLVED", "WAIVED"].includes(body.status)
  ) {
    return apiError(400, "INVALID_REQUEST", "status must be OPEN, IN_REVIEW, RESOLVED, or WAIVED.");
  }

  const nextStatus = body.status as "OPEN" | "IN_REVIEW" | "RESOLVED" | "WAIVED";
  if (nextStatus === "WAIVED") {
    if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
      return apiError(400, "OVERRIDE_REASON_REQUIRED", "Waiving an issue requires a written reason.");
    }
  }

  const action = await createComplianceIssueService(prisma).appendAction({
    issueId: issue.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
    actionType: nextStatus === "RESOLVED" ? "RESOLVED" : "STATUS_CHANGED",
    summary:
      nextStatus === "WAIVED"
        ? "Commissioner waived compliance issue."
        : `Issue status changed to ${nextStatus}.`,
    notes: typeof body.notes === "string" ? body.notes : null,
    toStatus: nextStatus,
    metadata:
      nextStatus === "WAIVED"
        ? {
            reason: typeof body.reason === "string" ? body.reason.trim() : null,
          }
        : undefined,
  });

  if (nextStatus === "WAIVED") {
    const override = await createCommissionerOverrideService(prisma).recordOverride({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: issue.teamId,
      issueId: issue.id,
      complianceActionId: action.id,
      actorUserId: auth.actor?.userId ?? null,
      actorRoleSnapshot: auth.actor?.leagueRole ?? null,
      overrideType: "ISSUE_WAIVER",
      reason: (body.reason as string).trim(),
      entityType: "compliance_issue",
      entityId: issue.id,
      beforeJson: {
        status: issue.status,
      },
      afterJson: {
        status: nextStatus,
      },
      metadata: {
        title: issue.title,
      },
      notificationTitle: "Commissioner waived compliance issue",
      notificationBody: (body.reason as string).trim(),
    });
  }

  const detail = await createComplianceReadModels(prisma).readIssueDetail({
    leagueId: context.leagueId,
    issueId,
  });

  if (detail && nextStatus === "RESOLVED") {
    await createActivityPublisher(prisma).publishSafe({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actorUserId: auth.actor?.userId ?? null,
      ...formatComplianceIssueResolvedActivity({
        issueId: detail.issue.id,
        code: detail.issue.code,
        team: detail.issue.teamId && detail.issue.teamName
          ? {
              id: detail.issue.teamId,
              name: detail.issue.teamName,
            }
          : null,
      }),
    });
  }

  if (detail && nextStatus === "WAIVED") {
    const latestOverride = detail.overrides[0] ?? null;

    await createActivityPublisher(prisma).publishSafe({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actorUserId: auth.actor?.userId ?? null,
      ...formatComplianceIssueWaivedActivity({
        issueId: detail.issue.id,
        code: detail.issue.code,
        team: detail.issue.teamId && detail.issue.teamName
          ? {
              id: detail.issue.teamId,
              name: detail.issue.teamName,
            }
          : null,
        }),
    });

    if (latestOverride) {
      await createActivityPublisher(prisma).publishSafe({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        actorUserId: auth.actor?.userId ?? null,
        ...formatCommissionerRulingPublishedActivity({
          overrideId: latestOverride.id,
          overrideType: latestOverride.overrideType,
          entityType: latestOverride.entityType,
          entityId: latestOverride.entityId,
          team: detail.issue.teamId && detail.issue.teamName
            ? {
                id: detail.issue.teamId,
                name: detail.issue.teamName,
              }
            : null,
          internalReason: typeof body.reason === "string" ? body.reason.trim() : null,
          occurredAt: new Date(latestOverride.createdAt),
        }),
      });
    }
  }

  return NextResponse.json(detail);
}
