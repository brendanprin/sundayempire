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

  const statuses = request.nextUrl.searchParams.getAll("status");
  const projection = await createPlayerRefreshJobsProjection(prisma).list({
    statuses: statuses.length > 0 ? (statuses as never) : undefined,
  });

  return NextResponse.json(projection);
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const auth = { actor: access.actor };

  const json = await parseJsonBody<Record<string, unknown>>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  try {
    const result = await createCommissionerPlayerRefreshService(prisma).triggerRefresh({
      adapterKey: typeof body.adapterKey === "string" ? body.adapterKey : null,
      sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel : null,
      requestedByUserId: auth.actor?.userId ?? null,
      payload:
        body.payload && typeof body.payload === "object"
          ? (body.payload as never)
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
