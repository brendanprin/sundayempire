import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createComplianceReadModels } from "@/lib/domain/compliance/read-models";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context } = access;

  const queue = await createComplianceReadModels(prisma).readComplianceQueue({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
  });

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    queue,
  });
}
