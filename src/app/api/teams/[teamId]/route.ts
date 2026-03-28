import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireTeamLeagueRole } from "@/lib/authorization";
import { requireLeagueRole } from "@/lib/auth";
import { evaluateTeamCompliance } from "@/lib/compliance/service";
import { getActiveLeagueContext, summarizeTeamCap } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";
import { TeamDetailSummary } from "@/types/teams";

type RouteContext = {
  params: Promise<{
    teamId: string;
  }>;
};

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }
  const auth = await requireLeagueRole(request, context.leagueId, [
    "COMMISSIONER", "MEMBER",
  ]);
  if (auth.response) {
    return auth.response;
  }

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId: context.leagueId,
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!team) {
    return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
      teamId,
    });
  }

  const [summary, compliance] = await Promise.all([
    summarizeTeamCap(team, { id: context.seasonId }, context.ruleset),
    evaluateTeamCompliance({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
    }),
  ]);

  const response: TeamDetailSummary = {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    divisionLabel: team.divisionLabel,
    owner: team.owner
      ? {
          id: team.owner.id,
          name: team.owner.name,
          email: team.owner.email,
        }
      : null,
    rosterCount: summary.rosterCount,
    activeCapHit: summary.activeCapHit,
    deadCapHit: summary.deadCapHit,
    totalCapHit: summary.totalCapHit,
    capSpaceSoft: summary.capSpaceSoft,
    capSpaceHard: summary.capSpaceHard,
    complianceStatus: compliance?.status ?? "ok",
    complianceErrors: compliance?.summary.errors ?? 0,
    complianceWarnings: compliance?.summary.warnings ?? 0,
    compliance: compliance
      ? {
          status: compliance.status,
          evaluatedAt: compliance.evaluatedAt,
          summary: compliance.summary,
          findings: compliance.findings.map((finding) => ({
            ruleCode: finding.ruleCode,
            severity: finding.severity,
            message: finding.message,
            context: finding.context,
          })),
        }
      : undefined,
  };

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    team: response,
  });
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
  const access = await requireTeamLeagueRole(request, teamId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;

  const existingTeam = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId: context.leagueId,
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      divisionLabel: true,
      ownerId: true,
    },
  });

  if (!existingTeam) {
    return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
      teamId,
    });
  }

  const body = (await request.json()) as {
    name?: unknown;
    abbreviation?: unknown;
    divisionLabel?: unknown;
    ownerId?: unknown;
  };

  const patch: {
    name?: string;
    abbreviation?: string | null;
    divisionLabel?: string | null;
    ownerId?: string | null;
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) {
      return apiError(400, "INVALID_REQUEST", "Team name must be at least 2 characters.");
    }
    patch.name = body.name.trim();
  }

  if (body.abbreviation !== undefined) {
    if (body.abbreviation !== null && typeof body.abbreviation !== "string") {
      return apiError(400, "INVALID_REQUEST", "abbreviation must be a string or null.");
    }
    const normalized =
      typeof body.abbreviation === "string" && body.abbreviation.trim()
        ? body.abbreviation.trim().toUpperCase()
        : null;
    if (normalized && normalized.length > 8) {
      return apiError(400, "INVALID_REQUEST", "Team abbreviation must be 8 characters or fewer.");
    }
    patch.abbreviation = normalized;
  }

  if (body.divisionLabel !== undefined) {
    if (body.divisionLabel !== null && typeof body.divisionLabel !== "string") {
      return apiError(400, "INVALID_REQUEST", "divisionLabel must be a string or null.");
    }
    patch.divisionLabel =
      typeof body.divisionLabel === "string" && body.divisionLabel.trim()
        ? body.divisionLabel.trim()
        : null;
  }

  if (body.ownerId !== undefined) {
    if (body.ownerId !== null && typeof body.ownerId !== "string") {
      return apiError(400, "INVALID_REQUEST", "ownerId must be a string or null.");
    }

    if (typeof body.ownerId === "string" && body.ownerId.trim()) {
      const owner = await prisma.owner.findUnique({
        where: { id: body.ownerId },
        select: { id: true },
      });
      if (!owner) {
        return apiError(404, "OWNER_NOT_FOUND", "Owner was not found.");
      }
      patch.ownerId = owner.id;
    } else {
      patch.ownerId = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return apiError(400, "INVALID_REQUEST", "At least one field is required.");
  }

  const updatedTeam = await prisma.team.update({
    where: { id: existingTeam.id },
    data: patch,
    select: {
      id: true,
      name: true,
      abbreviation: true,
      divisionLabel: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: existingTeam.id,
    type: TransactionType.COMMISSIONER_OVERRIDE,
    summary: `Updated team ${updatedTeam.name}.`,
    metadata: {
      updatedBy: "api/teams/[teamId] PATCH",
      teamId: existingTeam.id,
      before: existingTeam,
      after: {
        name: updatedTeam.name,
        abbreviation: updatedTeam.abbreviation,
        divisionLabel: updatedTeam.divisionLabel,
        ownerId: updatedTeam.owner?.id ?? null,
      },
    },
  });

  return NextResponse.json({
    team: updatedTeam,
  });
}
