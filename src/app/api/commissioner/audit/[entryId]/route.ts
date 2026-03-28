import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createCommissionerAuditReadLayer } from "@/lib/read-models/audit/commissioner-audit-read-layer";

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ entryId: string }> },
) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const params = await routeContext.params;
  const entryId = params.entryId?.trim();
  if (!entryId) {
    return apiError(400, "INVALID_REQUEST", "entryId is required.");
  }

  const detail = await createCommissionerAuditReadLayer(prisma).readDetail({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    entryId,
  });

  if (!detail) {
    return apiError(404, "AUDIT_ENTRY_NOT_FOUND", "Commissioner audit entry was not found.");
  }

  return NextResponse.json({
    entry: detail,
  });
}
