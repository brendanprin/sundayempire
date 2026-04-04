import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { logRuntime, resolveRequestId } from "@/lib/runtime-log";
import { logTransaction } from "@/lib/transactions";
import { LeagueSummaryPayload } from "@/types/league";

function buildLeaguePayload(
  context: NonNullable<Awaited<ReturnType<typeof getActiveLeagueContext>>>,
  league: {
    id: string;
    name: string;
    description: string | null;
  },
  season: {
    id: string;
    year: number;
    phase:
      | "PRESEASON_SETUP"
      | "ROOKIE_DRAFT"
      | "AUCTION_MAIN_DRAFT"
      | "REGULAR_SEASON"
      | "PLAYOFFS"
      | "OFFSEASON_ROLLOVER"
      | "TAG_OPTION_COMPLIANCE";
    regularSeasonWeeks: number;
    playoffStartWeek: number;
    playoffEndWeek: number;
  },
): LeagueSummaryPayload {
  return {
    league,
    season: {
      ...season,
      phase: toLegacyLeaguePhase(season.phase),
    },
    ruleset: {
      id: context.ruleset.id,
      version: context.ruleset.version,
      rosterSize: context.ruleset.rosterSize,
      irSlots: context.ruleset.irSlots,
      salaryCapSoft: context.ruleset.salaryCapSoft,
      salaryCapHard: context.ruleset.salaryCapHard,
      minSalary: context.ruleset.minSalary,
      minContractYears: context.ruleset.minContractYears,
      maxContractYears: context.ruleset.maxContractYears,
      maxContractYearsIfSalaryBelowTen: context.ruleset.maxContractYearsIfSalaryBelowTen,
      franchiseTagsPerTeam: context.ruleset.franchiseTagsPerTeam,
      tradeDeadlineWeek: context.ruleset.tradeDeadlineWeek,
    },
  };
}

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

  const [league, season] = await Promise.all([
    prisma.league.findUnique({
      where: { id: context.leagueId },
      select: {
        id: true,
        name: true,
        description: true,
      },
    }),
    prisma.season.findUnique({
      where: { id: context.seasonId },
      select: {
        id: true,
        year: true,
        phase: true,
        regularSeasonWeeks: true,
        playoffStartWeek: true,
        playoffEndWeek: true,
      },
    }),
  ]);

  if (!league || !season) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "Active league metadata was not found.");
  }

  return NextResponse.json(buildLeaguePayload(context, league, season));
}

export async function PATCH(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };
  logRuntime("info", {
    event: "league.patch.request",
    requestId,
    actorEmail: auth.actor?.email ?? null,
    actorLeagueRole: auth.actor?.leagueRole ?? null,
    path: request.nextUrl.pathname,
    method: request.method,
  });

  const body = (await request.json()) as {
    name?: unknown;
    description?: unknown;
    regularSeasonWeeks?: unknown;
    playoffStartWeek?: unknown;
    playoffEndWeek?: unknown;
  };

  const leaguePatch: { name?: string; description?: string | null } = {};
  const seasonPatch: {
    regularSeasonWeeks?: number;
    playoffStartWeek?: number;
    playoffEndWeek?: number;
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) {
      return apiError(400, "INVALID_REQUEST", "League name must be at least 2 characters.");
    }
    leaguePatch.name = body.name.trim();
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return apiError(400, "INVALID_REQUEST", "League description must be a string or null.");
    }
    leaguePatch.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }

  for (const key of ["regularSeasonWeeks", "playoffStartWeek", "playoffEndWeek"] as const) {
    if (body[key] === undefined) continue;
    const numericValue = Number(body[key]);
    if (!Number.isInteger(numericValue) || numericValue < 1) {
      return apiError(400, "INVALID_REQUEST", `${key} must be a positive integer.`);
    }
    seasonPatch[key] = numericValue;
  }

  const nextRegularSeasonWeeks = seasonPatch.regularSeasonWeeks ?? context.ruleset.regularSeasonWeeks;
  const nextPlayoffStartWeek = seasonPatch.playoffStartWeek ?? context.ruleset.playoffStartWeek;
  const nextPlayoffEndWeek = seasonPatch.playoffEndWeek ?? context.ruleset.playoffEndWeek;

  if (nextPlayoffStartWeek > nextPlayoffEndWeek) {
    return apiError(400, "INVALID_REQUEST", "playoffEndWeek must be greater than or equal to playoffStartWeek.");
  }
  if (nextRegularSeasonWeeks >= nextPlayoffStartWeek) {
    return apiError(400, "INVALID_REQUEST", "playoffStartWeek must be after regularSeasonWeeks.");
  }

  if (Object.keys(leaguePatch).length === 0 && Object.keys(seasonPatch).length === 0) {
    return apiError(400, "INVALID_REQUEST", "At least one editable field is required.");
  }

  const [currentLeague, currentSeason] = await Promise.all([
    prisma.league.findUnique({
      where: { id: context.leagueId },
      select: { id: true, name: true, description: true },
    }),
    prisma.season.findUnique({
      where: { id: context.seasonId },
      select: {
        id: true,
        year: true,
        phase: true,
        regularSeasonWeeks: true,
        playoffStartWeek: true,
        playoffEndWeek: true,
      },
    }),
  ]);

  if (!currentLeague || !currentSeason) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "Active league metadata was not found.");
  }

  const changedKeys = [
    ...Object.keys(leaguePatch),
    ...Object.keys(seasonPatch),
  ];

  const result = await prisma.$transaction(async (tx) => {
    const league = Object.keys(leaguePatch).length
      ? await tx.league.update({
          where: { id: context.leagueId },
          data: leaguePatch,
          select: { id: true, name: true, description: true },
        })
      : currentLeague;

    const season = Object.keys(seasonPatch).length
      ? await tx.season.update({
          where: { id: context.seasonId },
          data: seasonPatch,
          select: {
            id: true,
            year: true,
            phase: true,
            regularSeasonWeeks: true,
            playoffStartWeek: true,
            playoffEndWeek: true,
          },
        })
      : currentSeason;

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Updated league settings (${changedKeys.join(", ")}).`,
      metadata: {
        updatedBy: "api/league PATCH",
        requestId,
        actor: {
          email: auth.actor?.email ?? null,
          leagueRole: auth.actor?.leagueRole ?? null,
        },
        changedKeys,
        before: {
          league: currentLeague,
          season: currentSeason,
        },
        after: {
          league,
          season,
        },
      },
    });

    return { league, season };
  });

  return NextResponse.json(buildLeaguePayload(context, result.league, result.season));
}
