import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { createCommissionerPlayerRefreshService } from "@/lib/domain/player/player-refresh-review-service";

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ changeId: string }> },
) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { actor, context: leagueContext } = access;

  const params = await routeContext.params;
  const changeId = params.changeId?.trim();
  if (!changeId) {
    return apiError(400, "INVALID_REQUEST", "changeId is required.");
  }

  const json = await parseJsonBody<Record<string, unknown>>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const action = typeof body.action === "string" ? body.action.trim().toUpperCase() : null;

  try {
    const result = await createCommissionerPlayerRefreshService(prisma).resolveChange({
      leagueId: leagueContext.leagueId,
      seasonId: leagueContext.seasonId,
      changeId,
      reviewedByUserId: actor?.userId ?? "",
      now: new Date(),
      actor: actor
        ? {
            email: actor.email,
            leagueRole: actor.leagueRole,
            teamId: actor.teamId,
          }
        : null,
      action:
        action === "APPLY_MAPPING"
          ? {
              type: "APPLY_MAPPING",
              playerId: typeof body.playerId === "string" ? body.playerId : null,
              restricted:
                typeof body.restricted === "boolean" ? body.restricted : null,
              notes: typeof body.notes === "string" ? body.notes : null,
            }
          : {
              type: "REJECT",
              notes: typeof body.notes === "string" ? body.notes : null,
            },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "PLAYER_REFRESH_CHANGE_NOT_FOUND") {
      return apiError(404, "PLAYER_REFRESH_CHANGE_NOT_FOUND", "Player refresh change was not found.");
    }
    if (message === "PLAYER_REFRESH_CHANGE_STATE_CONFLICT") {
      return apiError(
        409,
        "PLAYER_REFRESH_CHANGE_STATE_CONFLICT",
        "Only pending player refresh changes can be reviewed.",
      );
    }
    if (message === "PLAYER_REFRESH_CHANGE_NOT_RESOLVABLE") {
      return apiError(
        400,
        "PLAYER_REFRESH_CHANGE_NOT_RESOLVABLE",
        "This refresh change does not contain a resolvable normalized player row.",
      );
    }
    if (message === "PLAYER_REFRESH_TARGET_REQUIRED") {
      return apiError(
        400,
        "PLAYER_REFRESH_TARGET_REQUIRED",
        "Choose a target canonical player before applying this review decision.",
      );
    }
    if (message === "PLAYER_IDENTITY_MAPPING_CONFLICT") {
      return apiError(
        409,
        "PLAYER_IDENTITY_MAPPING_CONFLICT",
        "That provider identity is already approved for a different canonical player.",
      );
    }
    if (message === "PLAYER_NOT_FOUND") {
      return apiError(404, "PLAYER_NOT_FOUND", "Player was not found.");
    }

    return apiError(400, "PLAYER_REFRESH_RESOLUTION_FAILED", message);
  }
}
