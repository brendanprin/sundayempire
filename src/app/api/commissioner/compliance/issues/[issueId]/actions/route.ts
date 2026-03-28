import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireActorTeamScope, requireLeagueRole } from "@/lib/auth";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    issueId: string;
  }>;
};

function isRemediationStepArray(value: unknown): value is Array<{
  id: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
}> {
  return Array.isArray(value) && value.every((step) => {
    if (typeof step !== "object" || step === null) {
      return false;
    }

    const typed = step as Record<string, unknown>;
    return (
      typeof typed.id === "string" &&
      typeof typed.label === "string" &&
      typeof typed.completed === "boolean" &&
      (typed.completedAt === null || typeof typed.completedAt === "string")
    );
  });
}

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { issueId } = await routeContext.params;
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
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
    },
  });

  if (!issue) {
    return apiError(404, "COMPLIANCE_ISSUE_NOT_FOUND", "Compliance issue was not found.");
  }

  if (auth.actor?.leagueRole === "MEMBER") {
    if (!issue.teamId) {
      return apiError(403, "FORBIDDEN", "Members can only act on team-scoped compliance issues.");
    }
    const scopeResponse = requireActorTeamScope(auth.actor, issue.teamId);
    if (scopeResponse) {
      return scopeResponse;
    }
  }

  const body = (await request.json()) as {
    summary?: unknown;
    notes?: unknown;
    remediation?: {
      acknowledgedAt?: unknown;
      steps?: unknown;
    } | null;
    toStatus?: unknown;
  };

  if (
    body.remediation &&
    isRemediationStepArray(body.remediation.steps)
  ) {
    await createComplianceIssueService(prisma).updateRemediationState({
      issueId: issue.id,
      actorUserId: auth.actor?.userId ?? null,
      actorRoleSnapshot: auth.actor?.leagueRole ?? null,
      acknowledgedAt:
        body.remediation.acknowledgedAt === null || typeof body.remediation.acknowledgedAt === "string"
          ? body.remediation.acknowledgedAt
          : null,
      steps: body.remediation.steps,
      notes: typeof body.notes === "string" ? body.notes : null,
    });

    const detail = await createComplianceReadModels(prisma).readIssueDetail({
      leagueId: context.leagueId,
      issueId: issue.id,
    });

    return NextResponse.json(detail);
  }

  if (auth.actor?.leagueRole !== "COMMISSIONER") {
    return apiError(403, "FORBIDDEN", "Only commissioners can add non-remediation compliance actions.");
  }

  if (typeof body.summary !== "string" || body.summary.trim().length < 3) {
    return apiError(400, "INVALID_REQUEST", "summary must be at least 3 characters.");
  }

  await createComplianceIssueService(prisma).appendAction({
    issueId: issue.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
    actionType:
      typeof body.toStatus === "string" && body.toStatus === "RESOLVED"
        ? "RESOLVED"
        : "NOTE_ADDED",
    summary: body.summary.trim(),
    notes: typeof body.notes === "string" ? body.notes : null,
    toStatus:
      typeof body.toStatus === "string" &&
      ["OPEN", "IN_REVIEW", "RESOLVED", "WAIVED"].includes(body.toStatus)
        ? (body.toStatus as "OPEN" | "IN_REVIEW" | "RESOLVED" | "WAIVED")
        : undefined,
  });

  const detail = await createComplianceReadModels(prisma).readIssueDetail({
    leagueId: context.leagueId,
    issueId: issue.id,
  });

  return NextResponse.json(detail);
}
