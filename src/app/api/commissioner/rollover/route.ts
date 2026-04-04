import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { runOffseasonRollover } from "@/lib/commissioner/rollover";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const auth = { actor: access.actor };

  const json = await parseJsonBody<{ dryRun?: unknown }>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    return apiError(400, "INVALID_REQUEST", "dryRun must be a boolean when provided.");
  }

  try {
    const result = await runOffseasonRollover({
      leagueId: context.leagueId,
      sourceSeasonId: context.seasonId,
      actor: "api/commissioner/rollover POST",
      dryRun: body.dryRun,
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: result.dryRun
        ? PILOT_EVENT_TYPES.COMMISSIONER_ROLLOVER_PREVIEW
        : PILOT_EVENT_TYPES.COMMISSIONER_ROLLOVER_APPLY,
      eventCategory: "commissioner",
      eventStep: result.dryRun ? "rollover_preview" : "rollover_apply",
      status: "success",
      entityType: "season",
      entityId: context.seasonId,
      ...requestTelemetry(request),
      context: {
        dryRun: result.dryRun,
        sourceSeasonYear: result.sourceSeason.year,
        targetSeasonYear: result.targetSeason.year,
        carriedContracts: result.counts.carriedContracts,
        expiredContracts: result.counts.expiredContracts,
      },
    });

    return NextResponse.json({
      league: {
        id: context.leagueId,
        name: context.leagueName,
      },
      rollover: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SEASON_NOT_FOUND") {
      return apiError(404, "SEASON_NOT_FOUND", "Active season was not found for this league.");
    }

    throw error;
  }
}
