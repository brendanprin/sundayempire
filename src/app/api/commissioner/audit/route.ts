import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createCommissionerAuditReadLayer } from "@/lib/read-models/audit/commissioner-audit-read-layer";
import { parseIntegerParam } from "@/lib/request";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const projection = await createCommissionerAuditReadLayer(prisma).list({
    leagueId: context.leagueId,
    seasonId: request.nextUrl.searchParams.get("seasonId") ?? context.seasonId,
    teamId: request.nextUrl.searchParams.get("teamId"),
    type: request.nextUrl.searchParams.get("type"),
    actor: request.nextUrl.searchParams.get("actor"),
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
    limit: parseIntegerParam(request.nextUrl.searchParams.get("limit")),
  });

  if (!projection) {
    return apiError(404, "AUDIT_CONTEXT_NOT_FOUND", "Commissioner audit context could not be resolved.");
  }

  return NextResponse.json(projection);
}
