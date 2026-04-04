import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createTradeBuilderProjection } from "@/lib/read-models/trades/trade-builder-projection";

function toBuilderErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_REQUEST";

  if (code === "FORBIDDEN") {
    return apiError(403, code, "You do not have permission to access the trade builder.");
  }

  if (code === "TRADE_STATE_CONFLICT") {
    return apiError(409, code, "Only draft proposals can be edited in the builder.");
  }

  return apiError(400, "INVALID_REQUEST", "Trade builder request was invalid.");
}

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const season = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
  });
  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  try {
    const payload = await createTradeBuilderProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      seasonYear: context.seasonYear,
      seasonPhase: season.phase,
      leagueName: context.leagueName,
      actor,
      proposalId: request.nextUrl.searchParams.get("proposalId"),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toBuilderErrorResponse(error);
  }
}

