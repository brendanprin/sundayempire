import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";
import { createNotificationSummaryReadModel } from "@/lib/read-models/notifications/notification-summary";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const rawLimit = parseIntegerParam(request.nextUrl.searchParams.get("limit"));
  if (rawLimit !== undefined && rawLimit <= 0) {
    return apiError(400, "INVALID_REQUEST", "limit must be a positive integer.");
  }

  const summary = await createNotificationSummaryReadModel(prisma).read({
    leagueId: context.leagueId,
    recipientUserId: actor.userId,
    limit: rawLimit ? Math.min(rawLimit, 10) : 5,
  });

  return NextResponse.json(summary);
}
