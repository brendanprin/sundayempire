import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireTeamLeagueRole } from "@/lib/authorization";
import {
  requireActorTeamScope,
} from "@/lib/auth";
import { createCutImpactPreviewService } from "@/lib/domain/contracts/cut-impact-preview-service";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    teamId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
  const access = await requireTeamLeagueRole(request, teamId, [
    "COMMISSIONER",
    "MEMBER",
  ]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const teamScopeResponse = requireActorTeamScope(auth.actor, teamId);
  if (teamScopeResponse) {
    return teamScopeResponse;
  }

  const body = (await request.json().catch(() => ({}))) as {
    rosterSlotId?: string;
    playerId?: string;
    afterTradeDeadline?: boolean;
  };

  if (!body.rosterSlotId && !body.playerId) {
    return apiError(400, "INVALID_REQUEST", "rosterSlotId or playerId is required.");
  }

  try {
    const preview = await createCutImpactPreviewService(prisma).preview({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId,
      rosterSlotId: body.rosterSlotId,
      playerId: body.playerId,
      afterTradeDeadline: body.afterTradeDeadline,
    });

    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CUT_PREVIEW_UNAVAILABLE";
    if (message === "TEAM_NOT_FOUND") {
      return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.");
    }
    if (message === "ROSTER_SLOT_NOT_FOUND") {
      return apiError(404, "ROSTER_SLOT_NOT_FOUND", "Roster slot was not found for cut preview.");
    }
    if (message === "TEAM_VALIDATION_CONTEXT_NOT_FOUND") {
      return apiError(404, "TEAM_VALIDATION_CONTEXT_NOT_FOUND", "Team validation context was not found.");
    }

    return apiError(409, "CUT_PREVIEW_UNAVAILABLE", "Cut impact preview could not be calculated.");
  }
}
