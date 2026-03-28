import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createCommissionerPlayerRefreshService } from "@/lib/domain/player/player-refresh-review-service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ playerId: string }> },
) {
  const leagueContext = await getActiveLeagueContext();
  if (!leagueContext) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, leagueContext.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const params = await context.params;
  const playerId = params.playerId?.trim();
  if (!playerId) {
    return apiError(400, "INVALID_REQUEST", "playerId is required.");
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.restricted !== "boolean") {
    return apiError(
      400,
      "INVALID_REQUEST",
      "restricted must be a boolean.",
    );
  }

  try {
    const result = await createCommissionerPlayerRefreshService(prisma).updatePlayerRestriction({
      leagueId: leagueContext.leagueId,
      seasonId: leagueContext.seasonId,
      playerId,
      restricted: body.restricted,
      reviewedByUserId: auth.actor?.userId ?? "",
      changeId: typeof body.changeId === "string" ? body.changeId : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      actor: auth.actor
        ? {
            email: auth.actor.email,
            leagueRole: auth.actor.leagueRole,
            teamId: auth.actor.teamId,
          }
        : null,
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
