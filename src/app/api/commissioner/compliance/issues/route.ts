import {
  ComplianceIssueSeverity,
  ComplianceIssueType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import { formatComplianceIssueCreatedActivity } from "@/lib/domain/activity/formatters";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

const ISSUE_TYPES = new Set<ComplianceIssueType>([
  "ROSTER",
  "LINEUP",
  "CAP",
  "CONTRACT",
  "FRANCHISE_TAG",
  "IR",
  "DEADLINE",
  "LIFECYCLE",
  "MANUAL",
]);

const ISSUE_SEVERITIES = new Set<ComplianceIssueSeverity>([
  "WARNING",
  "ERROR",
  "CRITICAL",
]);

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
  const teamId = request.nextUrl.searchParams.get("teamId");

  const issues = await prisma.complianceIssue.findMany({
    where: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      ...(status ? { status: status as never } : {}),
      ...(teamId ? { teamId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    issues: issues.map((issue) => ({
      id: issue.id,
      teamId: issue.teamId,
      teamName: issue.team?.name ?? null,
      source: issue.source,
      issueType: issue.issueType,
      severity: issue.severity,
      status: issue.status,
      code: issue.code,
      ruleCode: issue.ruleCode,
      title: issue.title,
      message: issue.message,
      dueAt: issue.dueAt?.toISOString() ?? null,
      updatedAt: issue.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as {
    teamId?: unknown;
    playerId?: unknown;
    contractId?: unknown;
    issueType?: unknown;
    severity?: unknown;
    code?: unknown;
    title?: unknown;
    message?: unknown;
    dueAt?: unknown;
  };

  if (typeof body.title !== "string" || body.title.trim().length < 3) {
    return apiError(400, "INVALID_REQUEST", "title must be at least 3 characters.");
  }
  if (typeof body.message !== "string" || body.message.trim().length < 3) {
    return apiError(400, "INVALID_REQUEST", "message must be at least 3 characters.");
  }
  if (typeof body.issueType !== "string" || !ISSUE_TYPES.has(body.issueType as ComplianceIssueType)) {
    return apiError(400, "INVALID_REQUEST", "issueType must be a supported compliance issue type.");
  }
  if (typeof body.severity !== "string" || !ISSUE_SEVERITIES.has(body.severity as ComplianceIssueSeverity)) {
    return apiError(400, "INVALID_REQUEST", "severity must be WARNING, ERROR, or CRITICAL.");
  }

  const created = await createComplianceIssueService(prisma).createManualIssue({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: typeof body.teamId === "string" && body.teamId.trim().length > 0 ? body.teamId : null,
    playerId: typeof body.playerId === "string" && body.playerId.trim().length > 0 ? body.playerId : null,
    contractId:
      typeof body.contractId === "string" && body.contractId.trim().length > 0 ? body.contractId : null,
    issueType: body.issueType as ComplianceIssueType,
    severity: body.severity as ComplianceIssueSeverity,
    code: typeof body.code === "string" && body.code.trim().length > 0 ? body.code : null,
    title: body.title,
    message: body.message,
    explicitDueAt:
      typeof body.dueAt === "string" && body.dueAt.trim().length > 0 ? body.dueAt : null,
    createdByUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
  });

  const detail = await createComplianceReadModels(prisma).readIssueDetail({
    leagueId: context.leagueId,
    issueId: created.id,
  });

  if (detail) {
    await createActivityPublisher(prisma).publishSafe({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actorUserId: auth.actor?.userId ?? null,
      ...formatComplianceIssueCreatedActivity({
        issueId: detail.issue.id,
        code: detail.issue.code,
        severity: detail.issue.severity,
        team: detail.issue.teamId && detail.issue.teamName
          ? {
              id: detail.issue.teamId,
              name: detail.issue.teamName,
            }
          : null,
        occurredAt: created.createdAt,
      }),
    });
  }

  return NextResponse.json({ issue: detail }, { status: 201 });
}
