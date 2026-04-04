import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createDraftsHomeProjection } from "@/lib/read-models/draft/drafts-home-projection";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const projection = await createDraftsHomeProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: {
      leagueRole: actor.leagueRole,
      teamId: actor.teamId,
    },
  });

  if (!projection) {
    return apiError(404, "DRAFT_HOME_NOT_FOUND", "Draft home context could not be resolved.");
  }

  return NextResponse.json(projection);
}
