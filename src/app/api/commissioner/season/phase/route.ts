import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import { formatLifecyclePhaseTransitionActivity } from "@/lib/domain/activity/formatters";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { normalizeLeaguePhaseInput } from "@/lib/domain/lifecycle/phase-compat";
import { isLeaguePhase, LEAGUE_PHASES, transitionSeasonPhase } from "@/lib/commissioner/season";
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

  const body = (await request.json()) as {
    phase?: unknown;
    reason?: unknown;
  };

  if (!isLeaguePhase(body.phase)) {
    return apiError(
      400,
      "INVALID_PHASE",
      "phase must be a supported legacy or canonical lifecycle phase.",
      {
        validPhases: LEAGUE_PHASES,
      },
    );
  }

  const nextPhase = normalizeLeaguePhaseInput(body.phase);
  if (!nextPhase) {
    return apiError(400, "INVALID_PHASE", "phase must be a supported legacy or canonical lifecycle phase.", {
      validPhases: LEAGUE_PHASES,
    });
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
    return apiError(400, "OVERRIDE_REASON_REQUIRED", "Phase transitions require a written reason.");
  }

  const seasonBefore = await prisma.season.findFirst({
    where: {
      id: context.seasonId,
      leagueId: context.leagueId,
    },
    select: {
      id: true,
      phase: true,
    },
  });
  if (!seasonBefore) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found for this league.");
  }

  try {
    const result = await transitionSeasonPhase({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      nextPhase,
      actor: "api/commissioner/season/phase POST",
      initiatedByUserId: auth.actor?.userId,
      initiatedByType: "COMMISSIONER",
      reason: body.reason.trim(),
    });

    if (result.changed) {
      await createCommissionerOverrideService(prisma).recordOverride({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        actorUserId: auth.actor?.userId ?? null,
        actorRoleSnapshot: auth.actor?.leagueRole ?? null,
        overrideType: "PHASE_TRANSITION",
        reason: body.reason.trim(),
        entityType: "season",
        entityId: context.seasonId,
        beforeJson: {
          phase: seasonBefore.phase,
        },
        afterJson: {
          phase: nextPhase,
        },
        metadata: {
          legacyReturnedPhase: result.season.phase,
        },
        notificationTitle: "Season phase transition recorded",
        notificationBody: body.reason.trim(),
      });
    }

    await createComplianceIssueService(prisma).syncDeadlineIssues({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actorUserId: auth.actor?.userId ?? null,
      actorRoleSnapshot: auth.actor?.leagueRole ?? null,
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.COMMISSIONER_PHASE_TRANSITION,
      eventCategory: "commissioner",
      eventStep: "phase_transition",
      status: "success",
      entityType: "season",
      entityId: context.seasonId,
      ...requestTelemetry(request),
      context: {
        nextPhase,
        changed: result.changed,
      },
    });

    if (result.changed && result.transition) {
      await createActivityPublisher(prisma).publishSafe({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        actorUserId: auth.actor?.userId ?? null,
        ...formatLifecyclePhaseTransitionActivity({
          transitionId: result.transition.id,
          fromPhase: result.transition.fromPhase,
          toPhase: result.transition.toPhase,
          occurredAt: result.transition.occurredAt,
        }),
      });
    }

    return NextResponse.json({
      league: {
        id: context.leagueId,
        name: context.leagueName,
      },
      season: result.season,
      changed: result.changed,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SEASON_NOT_FOUND") {
      return apiError(404, "SEASON_NOT_FOUND", "Active season was not found for this league.");
    }
    if (error instanceof Error && error.message === "INVALID_PHASE") {
      return apiError(400, "INVALID_PHASE", "phase must be a supported legacy or canonical lifecycle phase.", {
        validPhases: LEAGUE_PHASES,
      });
    }

    throw error;
  }
}
