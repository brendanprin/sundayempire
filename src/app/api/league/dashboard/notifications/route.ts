import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";
import { createNotificationSummaryReadModel } from "@/lib/read-models/notifications/notification-summary";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }
  if (!auth.actor) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const rawLimit = parseIntegerParam(request.nextUrl.searchParams.get("limit"));
  if (rawLimit !== undefined && rawLimit <= 0) {
    return apiError(400, "INVALID_REQUEST", "limit must be a positive integer.");
  }

  const summary = await createNotificationSummaryReadModel(prisma).read({
    leagueId: context.leagueId,
    recipientUserId: auth.actor.userId,
    limit: rawLimit ? Math.min(rawLimit, 10) : 5,
  });

  return NextResponse.json(summary);
}
