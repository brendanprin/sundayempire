import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createDraftsHomeProjection } from "@/lib/read-models/draft/drafts-home-projection";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, [
    "COMMISSIONER", "MEMBER",
  ]);
  if (auth.response) {
    return auth.response;
  }
  if (!auth.actor) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const projection = await createDraftsHomeProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: {
      leagueRole: auth.actor.leagueRole,
      teamId: auth.actor.teamId,
    },
  });

  if (!projection) {
    return apiError(404, "DRAFT_HOME_NOT_FOUND", "Draft home context could not be resolved.");
  }

  return NextResponse.json(projection);
}
