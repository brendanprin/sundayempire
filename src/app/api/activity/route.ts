import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createActivityFeedProjection } from "@/lib/read-models/activity/activity-feed-projection";
import { parseIntegerParam } from "@/lib/request";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

  const limit = parseIntegerParam(request.nextUrl.searchParams.get("limit"));
  const projection = await createActivityFeedProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: request.nextUrl.searchParams.get("seasonId") ?? context.seasonId,
    teamId: request.nextUrl.searchParams.get("teamId"),
    type: request.nextUrl.searchParams.get("type"),
    category: request.nextUrl.searchParams.get("category"),
    limit: limit ?? undefined,
    cursor: request.nextUrl.searchParams.get("cursor"),
  });

  if (!projection) {
    return apiError(404, "ACTIVITY_CONTEXT_NOT_FOUND", "Activity feed context could not be resolved.");
  }

  return NextResponse.json({
    ...projection,
    filter: projection.filters,
    feed: projection.feed.map((item) => ({
      ...item,
      eventCategory: item.eventFamily,
    })),
  });
}
