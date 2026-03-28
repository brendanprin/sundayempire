import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { runEmergencyComplianceFix } from "@/lib/commissioner/emergency-fix";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import { formatCommissionerOverrideRecordedActivity } from "@/lib/domain/activity/formatters";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const auth = { actor: access.actor };

  const body = (await request.json()) as {
    teamId?: unknown;
    targetRosterMax?: unknown;
    targetCapType?: unknown;
    targetCapValue?: unknown;
    dryRun?: unknown;
    reason?: unknown;
  };

  if (typeof body.teamId !== "string" || body.teamId.length === 0) {
    return apiError(400, "INVALID_REQUEST", "teamId is required.");
  }

  if (body.targetRosterMax !== undefined && !isPositiveInteger(body.targetRosterMax)) {
    return apiError(400, "INVALID_REQUEST", "targetRosterMax must be a non-negative integer.");
  }

  if (body.targetCapValue !== undefined && !isPositiveInteger(body.targetCapValue)) {
    return apiError(400, "INVALID_REQUEST", "targetCapValue must be a non-negative integer.");
  }

  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    return apiError(400, "INVALID_REQUEST", "dryRun must be a boolean when provided.");
  }
  if (body.dryRun !== true && (typeof body.reason !== "string" || body.reason.trim().length < 5)) {
    return apiError(400, "OVERRIDE_REASON_REQUIRED", "Applying emergency fixes requires a written reason.");
  }

  const capType = body.targetCapType;
  if (capType !== undefined && capType !== "soft" && capType !== "hard") {
    return apiError(400, "INVALID_REQUEST", "targetCapType must be one of: soft, hard.");
  }

  const targetCapType: "soft" | "hard" | "custom" = body.targetCapValue !== undefined
    ? "custom"
    : capType ?? "soft";

  const targetCapValue =
    body.targetCapValue ??
    (targetCapType === "hard" ? context.ruleset.salaryCapHard : context.ruleset.salaryCapSoft);

  try {
    const result = await runEmergencyComplianceFix({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: body.teamId,
      targetRosterMax: body.targetRosterMax ?? context.ruleset.rosterSize,
      targetCapType,
      targetCapValue,
      actor: "api/commissioner/override/fix-team POST",
      dryRun: body.dryRun,
    });

    if (!result.dryRun) {
      const override = await createCommissionerOverrideService(prisma).recordOverride({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        teamId: result.team.id,
        actorUserId: auth.actor?.userId ?? null,
        actorRoleSnapshot: auth.actor?.leagueRole ?? null,
        overrideType: "EMERGENCY_FIX",
        reason: (body.reason as string).trim(),
        entityType: "team",
        entityId: result.team.id,
        beforeJson: result.before,
        afterJson: result.after,
        metadata: {
          policy: result.policy,
          droppedPlayers: result.droppedPlayers,
          unresolved: result.unresolved,
        },
        notificationTitle: "Emergency compliance fix applied",
        notificationBody: (body.reason as string).trim(),
      });

      await createActivityPublisher(prisma).publishSafe({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        actorUserId: auth.actor?.userId ?? null,
        ...formatCommissionerOverrideRecordedActivity({
          overrideId: override.id,
          overrideType: override.overrideType,
          entityType: override.entityType,
          entityId: override.entityId,
          team: {
            id: result.team.id,
            name: result.team.name,
          },
          occurredAt: override.createdAt,
        }),
      });

      await createComplianceIssueService(prisma).syncTeamComplianceState({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        teamId: result.team.id,
        actorUserId: auth.actor?.userId ?? null,
        actorRoleSnapshot: auth.actor?.leagueRole ?? null,
      });
    }

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: result.dryRun
        ? PILOT_EVENT_TYPES.COMMISSIONER_FIX_PREVIEW
        : PILOT_EVENT_TYPES.COMMISSIONER_FIX_APPLY,
      eventCategory: "commissioner",
      eventStep: result.dryRun ? "fix_preview" : "fix_apply",
      status: "success",
      entityType: "team",
      entityId: result.team.id,
      ...requestTelemetry(request),
      context: {
        dryRun: result.dryRun,
        targetCapType: result.policy.targetCapType,
        targetCapValue: result.policy.targetCapValue,
        targetRosterMax: result.policy.targetRosterMax,
        droppedPlayers: result.droppedPlayers.length,
        unresolved: result.unresolved.hasUnresolved,
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
      fix: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TEAM_NOT_FOUND") {
      return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
        teamId: body.teamId,
      });
    }

    throw error;
  }
}
