import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { evaluateLeagueCompliance } from "@/lib/compliance/service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const auth = { actor: access.actor };

  const complianceReport = await evaluateLeagueCompliance({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
  });
  const issueSync = await createComplianceIssueService(prisma).syncLeagueComplianceScan({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    report: complianceReport,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
  });

  await recordPilotEventSafe(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: auth.actor,
    eventType: PILOT_EVENT_TYPES.COMMISSIONER_COMPLIANCE_SCAN,
    eventCategory: "commissioner",
    eventStep: "compliance_scan",
    status: "success",
    entityType: "league",
    entityId: context.leagueId,
    ...requestTelemetry(request),
    context: {
      teamsEvaluated: complianceReport.summary.teamsEvaluated,
      errors: complianceReport.summary.error,
      warnings: complianceReport.summary.warning,
      totalFindings: complianceReport.summary.totalFindings,
      issuesCreated: issueSync.issues.created,
      issuesUpdated: issueSync.issues.updated,
      issuesResolved: issueSync.issues.resolved,
    },
  });

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    report: complianceReport,
    issueSync: issueSync.issues,
  });
}
