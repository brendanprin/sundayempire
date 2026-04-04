import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createCommissionerPlayerRefreshService } from "@/lib/domain/player/player-refresh-review-service";
import { parseJsonBody } from "@/lib/request";
import { createPlayerRefreshJobsProjection } from "@/lib/read-models/player/player-refresh-jobs-projection";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context } = access;

  const statuses = request.nextUrl.searchParams.getAll("status");
  const projection = await createPlayerRefreshJobsProjection(prisma).list({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    statuses: statuses.length > 0 ? (statuses as never) : undefined,
  });

  if (!projection) {
    return apiError(404, "PLAYER_REFRESH_CONTEXT_NOT_FOUND", "Player refresh context could not be resolved.");
  }

  return NextResponse.json(projection);
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const json = await parseJsonBody<Record<string, unknown>>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  try {
    const result = await createCommissionerPlayerRefreshService(prisma).triggerRefresh({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      adapterKey: typeof body.adapterKey === "string" ? body.adapterKey : null,
      sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel : null,
      requestedByUserId: auth.actor?.userId ?? null,
      payload:
        body.payload && typeof body.payload === "object"
          ? (body.payload as never)
          : null,
      actor: auth.actor
        ? {
            email: auth.actor.email,
            leagueRole: auth.actor.leagueRole,
            teamId: auth.actor.teamId,
          }
        : null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "INVALID_PLAYER_DIRECTORY_ADAPTER") {
      return apiError(
        400,
        "INVALID_PLAYER_DIRECTORY_ADAPTER",
        "adapterKey must identify a supported player directory adapter.",
      );
    }

    return apiError(400, "PLAYER_REFRESH_TRIGGER_FAILED", message);
  }
}
