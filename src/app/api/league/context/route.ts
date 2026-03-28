import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ACTIVE_LEAGUE_COOKIE, getAuthActorForLeague, getRequestUser } from "@/lib/auth";
import { createActorContextService } from "@/lib/application/actor-context/service";
import { selectPreferredSeason } from "@/lib/domain/lifecycle/season-selection";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const actor = await getAuthActorForLeague(request, context.leagueId);
  if (!actor) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    membership: {
      accountRole: actor.accountRole,
      leagueRole: actor.leagueRole,
      teamId: actor.teamId,
      teamName: actor.teamName,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const body = (await request.json().catch(() => ({}))) as {
    leagueId?: unknown;
  };
  if (typeof body.leagueId !== "string" || body.leagueId.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "leagueId is required.");
  }
  const leagueId = body.leagueId.trim();

  const membership = await prisma.leagueMembership.findUnique({
    where: {
      userId_leagueId: {
        userId: user.id,
        leagueId,
      },
    },
    select: {
      role: true,
      teamId: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  });
  if (!membership) {
    return apiError(
      403,
      "FORBIDDEN",
      "You do not have membership access to the requested league workspace.",
      { leagueId },
    );
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      seasons: {
        orderBy: { year: "desc" },
        select: {
          id: true,
          year: true,
          status: true,
        },
      },
      rulesets: {
        where: {
          isActive: true,
        },
        orderBy: {
          version: "desc",
        },
        take: 1,
        select: {
          id: true,
        },
      },
    },
  });

  if (!league || league.seasons.length === 0 || league.rulesets.length === 0) {
    return apiError(
      409,
      "LEAGUE_CONTEXT_NOT_READY",
      "Selected league does not have an active season/ruleset context yet.",
      { leagueId },
    );
  }

  const selectedSeason = selectPreferredSeason(league.seasons);
  if (!selectedSeason) {
    return apiError(
      409,
      "LEAGUE_CONTEXT_NOT_READY",
      "Selected league does not have an active season/ruleset context yet.",
      { leagueId },
    );
  }

  const actor = await createActorContextService(prisma).resolveActorForUserId(user.id, leagueId);
  if (!actor) {
    return apiError(
      403,
      "FORBIDDEN",
      "You do not have membership access to the requested league workspace.",
      { leagueId },
    );
  }

  const response = NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
    },
    season: {
      id: selectedSeason.id,
      year: selectedSeason.year,
    },
    membership: {
      accountRole: actor.accountRole,
      leagueRole: actor.leagueRole,
      teamId: actor.teamId,
      teamName: actor.teamName,
    },
  });
  response.cookies.set(ACTIVE_LEAGUE_COOKIE, league.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
