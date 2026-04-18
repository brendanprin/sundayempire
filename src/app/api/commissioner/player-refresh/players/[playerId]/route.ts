import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { createCommissionerPlayerRefreshService } from "@/lib/domain/player/player-refresh-review-service";

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ playerId: string }> },
) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { actor } = access;

  const params = await routeContext.params;
  const playerId = params.playerId?.trim();
  if (!playerId) {
    return apiError(400, "INVALID_REQUEST", "playerId is required.");
  }

  const json = await parseJsonBody<Record<string, unknown>>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  if (typeof body.restricted !== "boolean") {
    return apiError(
      400,
      "INVALID_REQUEST",
      "restricted must be a boolean.",
    );
  }

  try {
    const result = await createCommissionerPlayerRefreshService(prisma).updatePlayerRestriction({
      playerId,
      restricted: body.restricted,
      reviewedByUserId: actor?.userId ?? "",
      changeId: typeof body.changeId === "string" ? body.changeId : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "PLAYER_NOT_FOUND") {
      return apiError(404, "PLAYER_NOT_FOUND", "Player was not found.");
    }
    return apiError(400, "PLAYER_REFRESH_PLAYER_UPDATE_FAILED", message);
  }
}
