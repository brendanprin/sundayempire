import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import {
  formatCommissionerOverrideRecordedActivity,
  formatCommissionerRulingPublishedActivity,
} from "@/lib/domain/activity/formatters";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

const OVERRIDE_TYPES = new Set([
  "PHASE_TRANSITION",
  "EMERGENCY_FIX",
  "CONTRACT_CREATE",
  "CONTRACT_UPDATE",
  "ISSUE_WAIVER",
  "MANUAL_RULING",
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

  const history = await createComplianceReadModels(prisma).readOverrideHistory({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
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
    history,
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
    issueId?: unknown;
    overrideType?: unknown;
    reason?: unknown;
    entityType?: unknown;
    entityId?: unknown;
    beforeJson?: unknown;
    afterJson?: unknown;
    metadata?: unknown;
  };

  if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
    return apiError(400, "OVERRIDE_REASON_REQUIRED", "Override requires a written reason.");
  }
  if (typeof body.entityType !== "string" || body.entityType.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "entityType is required.");
  }
  if (typeof body.entityId !== "string" || body.entityId.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "entityId is required.");
  }
  if (typeof body.overrideType !== "string" || !OVERRIDE_TYPES.has(body.overrideType)) {
    return apiError(400, "INVALID_REQUEST", "overrideType must be a supported commissioner override type.");
  }

  const override = await createCommissionerOverrideService(prisma).recordOverride({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: typeof body.teamId === "string" && body.teamId.trim().length > 0 ? body.teamId : null,
    issueId: typeof body.issueId === "string" && body.issueId.trim().length > 0 ? body.issueId : null,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
    overrideType: body.overrideType as
      | "PHASE_TRANSITION"
      | "EMERGENCY_FIX"
      | "CONTRACT_CREATE"
      | "CONTRACT_UPDATE"
      | "ISSUE_WAIVER"
      | "MANUAL_RULING",
    reason: body.reason,
    entityType: body.entityType.trim(),
    entityId: body.entityId.trim(),
    beforeJson: body.beforeJson as never,
    afterJson: body.afterJson as never,
    metadata: body.metadata as never,
    notificationTitle: body.overrideType === "MANUAL_RULING" ? "Commissioner ruling published" : undefined,
    notificationBody: body.reason,
  });

  const team =
    override.teamId
      ? await prisma.team.findUnique({
          where: {
            id: override.teamId,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

  await createActivityPublisher(prisma).publishSafe({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actorUserId: auth.actor?.userId ?? null,
    ...(body.overrideType === "MANUAL_RULING"
      ? formatCommissionerRulingPublishedActivity({
          overrideId: override.id,
          overrideType: override.overrideType,
          entityType: override.entityType,
          entityId: override.entityId,
          team,
          internalReason: body.reason,
          occurredAt: override.createdAt,
        })
      : formatCommissionerOverrideRecordedActivity({
          overrideId: override.id,
          overrideType: override.overrideType,
          entityType: override.entityType,
          entityId: override.entityId,
          team,
          occurredAt: override.createdAt,
        })),
  });

  return NextResponse.json({ override }, { status: 201 });
}
