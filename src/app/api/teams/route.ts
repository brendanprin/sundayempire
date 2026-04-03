import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { isActorTeamScopedMember } from "@/lib/auth";
import { evaluateLeagueCompliance } from "@/lib/compliance/service";
import { batchSummarizeTeamCap } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";
import { TeamListItem } from "@/types/teams";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return access.response;
  }

  const { actor, context } = access;

  const scope = request.nextUrl.searchParams.get("scope");
  const includeAllTeams = scope === "all";
  const teamWhere =
    isActorTeamScopedMember(actor) && !includeAllTeams
      ? { leagueId: context.leagueId, id: actor.teamId! }
      : { leagueId: context.leagueId };

  const teams = await prisma.team.findMany({
    where: teamWhere,
    orderBy: { name: "asc" },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const [picksOwned, summaryByTeamId, leagueCompliance] = await Promise.all([
    prisma.futurePick.groupBy({
      by: ["currentTeamId"],
      where: {
        leagueId: context.leagueId,
        seasonYear: {
          gte: context.seasonYear,
          lte: context.seasonYear + 2,
        },
      },
      _count: { _all: true },
    }),
    batchSummarizeTeamCap(teams, { id: context.seasonId }, context.ruleset),
    evaluateLeagueCompliance({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
    }),
  ]);

  const picksOwnedByTeamId = new Map<string, number>(
    picksOwned.map((entry) => [entry.currentTeamId, entry._count._all]),
  );

  const complianceByTeamId = new Map(
    leagueCompliance.teams.map((report) => [report.teamId, report]),
  );

  const response: TeamListItem[] = teams.map((team) => {
    const summary = summaryByTeamId.get(team.id);
    const compliance = complianceByTeamId.get(team.id);

    return {
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      divisionLabel: team.divisionLabel,
      owner: team.owner
        ? {
            id: team.owner.id,
            name: team.owner.name,
          }
        : null,
      rosterCount: summary?.rosterCount ?? 0,
      activeCapHit: summary?.activeCapHit ?? 0,
      deadCapHit: summary?.deadCapHit ?? 0,
      totalCapHit: summary?.totalCapHit ?? 0,
      capSpaceSoft: summary?.capSpaceSoft ?? context.ruleset.salaryCapSoft,
      capSpaceHard: summary?.capSpaceHard ?? context.ruleset.salaryCapHard,
      complianceStatus: compliance?.status ?? "ok",
      complianceErrors: compliance?.summary.errors ?? 0,
      complianceWarnings: compliance?.summary.warnings ?? 0,
      futurePicksOwnedCount: picksOwnedByTeamId.get(team.id) ?? 0,
    };
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
    teams: response,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;

  const body = (await request.json()) as {
    name?: unknown;
    abbreviation?: unknown;
    divisionLabel?: unknown;
    ownerId?: unknown;
    newOwner?: {
      name?: unknown;
      email?: unknown;
    };
  };

  if (typeof body.name !== "string" || body.name.trim().length < 2) {
    return apiError(400, "INVALID_REQUEST", "Team name must be at least 2 characters.");
  }

  const name = body.name.trim();
  const abbreviation =
    typeof body.abbreviation === "string" && body.abbreviation.trim()
      ? body.abbreviation.trim().toUpperCase()
      : null;
  const divisionLabel =
    typeof body.divisionLabel === "string" && body.divisionLabel.trim()
      ? body.divisionLabel.trim()
      : null;

  if (abbreviation && abbreviation.length > 8) {
    return apiError(400, "INVALID_REQUEST", "Team abbreviation must be 8 characters or fewer.");
  }

  const duplicateTeam = await prisma.team.findFirst({
    where: {
      leagueId: context.leagueId,
      OR: [
        { name },
        ...(abbreviation ? [{ abbreviation }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  });

  if (duplicateTeam) {
    return apiError(
      409,
      "TEAM_ALREADY_EXISTS",
      "A team with the same name or abbreviation already exists in this league.",
      {
        teamId: duplicateTeam.id,
        existingTeamName: duplicateTeam.name,
        existingTeamAbbreviation: duplicateTeam.abbreviation,
      },
    );
  }

  const ownerIdFromBody =
    typeof body.ownerId === "string" && body.ownerId.trim() ? body.ownerId : null;
  const hasNewOwner = Boolean(body.newOwner);
  if (ownerIdFromBody && hasNewOwner) {
    return apiError(400, "INVALID_REQUEST", "Provide either ownerId or newOwner, not both.");
  }

  let ownerId: string | null = null;
  let ownerNameForSummary: string | null = null;

  if (ownerIdFromBody) {
    const owner = await prisma.owner.findUnique({
      where: { id: ownerIdFromBody },
      select: { id: true, name: true },
    });
    if (!owner) {
      return apiError(404, "OWNER_NOT_FOUND", "Owner was not found.");
    }
    ownerId = owner.id;
    ownerNameForSummary = owner.name;
  }

  if (body.newOwner) {
    if (typeof body.newOwner.name !== "string" || body.newOwner.name.trim().length < 2) {
      return apiError(400, "INVALID_REQUEST", "New owner name must be at least 2 characters.");
    }
    if (
      body.newOwner.email !== undefined &&
      body.newOwner.email !== null &&
      typeof body.newOwner.email !== "string"
    ) {
      return apiError(400, "INVALID_REQUEST", "New owner email must be a string when provided.");
    }

    const createdOwner = await prisma.owner.create({
      data: {
        name: body.newOwner.name.trim(),
        email:
          typeof body.newOwner.email === "string" && body.newOwner.email.trim()
            ? body.newOwner.email.trim()
            : null,
      },
      select: {
        id: true,
        name: true,
      },
    });
    ownerId = createdOwner.id;
    ownerNameForSummary = createdOwner.name;
  }

  const createdTeam = await prisma.team.create({
    data: {
      leagueId: context.leagueId,
      name,
      abbreviation,
      divisionLabel,
      ownerId,
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      divisionLabel: true,
      owner: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: createdTeam.id,
    type: TransactionType.COMMISSIONER_OVERRIDE,
    summary: `Created team ${createdTeam.name}${ownerNameForSummary ? ` with owner ${ownerNameForSummary}` : ""}.`,
    metadata: {
      updatedBy: "api/teams POST",
      teamId: createdTeam.id,
      ownerId,
      ownerName: ownerNameForSummary,
    },
  });

  return NextResponse.json({ team: createdTeam }, { status: 201 });
}
