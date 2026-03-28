import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createRulesDeadlinesProjection } from "@/lib/read-models/rules/rules-deadlines-projection";

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

  const detail = await createRulesDeadlinesProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    deadlineLimit: 6,
  });

  if (!detail) {
    return apiError(404, "RULESET_NOT_FOUND", "Rules and deadline detail could not be resolved.");
  }

  return NextResponse.json(detail);
}
