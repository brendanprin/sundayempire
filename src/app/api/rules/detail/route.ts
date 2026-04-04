import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createRulesDeadlinesProjection } from "@/lib/read-models/rules/rules-deadlines-projection";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

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
