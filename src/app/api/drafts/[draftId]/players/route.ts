import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";
import { apiError } from "@/lib/api";
import {
  createAvailableDraftPlayersReader,
  normalizeDraftPlayerPosition,
  normalizeDraftPlayerSortDirection,
  normalizeDraftPlayerSortField,
} from "@/lib/domain/draft/available-players";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseBooleanParam } from "@/lib/request";
import { DraftPlayersResponse } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

const VALID_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const availablePlayersReader = createAvailableDraftPlayersReader(prisma);

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const draft = await prisma.draft.findFirst({
    where: {
      id: draftId,
      leagueId: context.leagueId,
      seasonId: context.seasonId,
    },
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
    },
  });

  if (!draft) {
    return apiError(404, "DRAFT_NOT_FOUND", "Draft was not found in the active season.", {
      draftId,
    });
  }

  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim() ?? "";
  const rawPosition = params.get("position");
  const rawRostered = parseBooleanParam(params.get("rostered"));
  const sortBy = normalizeDraftPlayerSortField(params.get("sortBy"));
  const sortDir = normalizeDraftPlayerSortDirection(params.get("sortDir"));

  if (rawPosition !== null && !VALID_POSITIONS.includes(rawPosition as Position)) {
    return apiError(400, "INVALID_FILTER_POSITION", "position must be one of QB, RB, WR, TE, K, DST.");
  }

  const effectiveRostered =
    rawRostered !== undefined
      ? rawRostered
      : draft.type === "ROOKIE"
        ? false
        : undefined;
  const position = normalizeDraftPlayerPosition(rawPosition);
  const sorted = await availablePlayersReader.list({
    draftId: draft.id,
    seasonId: context.seasonId,
    search,
    position,
    sortBy,
    sortDir,
    rostered: effectiveRostered,
    rookieEligibleOnly: draft.type === "ROOKIE",
  });

  const response: DraftPlayersResponse = {
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    draft: {
      id: draft.id,
      type: draft.type,
      status: draft.status,
      title: draft.title,
    },
    filters: {
      search,
      position: position === "ALL" ? null : position,
      rostered: effectiveRostered ?? null,
      sortBy,
      sortDir,
    },
    players: sorted,
    meta: {
      count: sorted.length,
    },
  };

  return NextResponse.json(response);
}
