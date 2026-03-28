import { LeagueRole, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import {
  createTeamMembershipRepository,
  type TeamMembershipDbClient,
} from "@/lib/domain/team-membership/repository";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

const FOUNDER_SETUP_SKIP_SUMMARY = "Founder postponed team setup.";

type FounderSetupAction = "create" | "claim" | "skip";
type FounderSetupStatus = "COMPLETE" | "INCOMPLETE_REQUIRED" | "INCOMPLETE_POSTPONED";

class FounderTeamSetupError extends Error {
  readonly status: number;
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FounderTeamSetupError";
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalAbbreviation(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function isFounderSkipMetadata(metadata: unknown, userId: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const typed = metadata as { workflow?: unknown; action?: unknown; actorUserId?: unknown };
  return (
    typed.workflow === "FOUNDER_TEAM_SETUP" &&
    typed.action === "skip" &&
    typed.actorUserId === userId
  );
}

async function upsertFounderOwnerProfile(input: {
  tx: TeamMembershipDbClient;
  userId: string;
  email: string;
  ownerName: string;
}) {
  const ownerByUserId = await input.tx.owner.findUnique({
    where: {
      userId: input.userId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (ownerByUserId) {
    return input.tx.owner.update({
      where: {
        id: ownerByUserId.id,
      },
      data: {
        userId: input.userId,
        email: input.email,
        name: input.ownerName,
      },
      select: {
        id: true,
      },
    });
  }

  const ownerByEmail = await input.tx.owner.findFirst({
    where: {
      email: input.email,
    },
    select: {
      id: true,
      userId: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (ownerByEmail?.userId && ownerByEmail.userId !== input.userId) {
    throw new FounderTeamSetupError(
      409,
      "OWNER_BINDING_CONFLICT",
      "The existing owner profile for this email is already linked to another account.",
      {
        ownerId: ownerByEmail.id,
        email: input.email,
      },
    );
  }

  if (ownerByEmail) {
    return input.tx.owner.update({
      where: {
        id: ownerByEmail.id,
      },
      data: {
        userId: input.userId,
        email: input.email,
        name: input.ownerName,
      },
      select: {
        id: true,
      },
    });
  }

  return input.tx.owner.create({
    data: {
      userId: input.userId,
      email: input.email,
      name: input.ownerName,
    },
    select: {
      id: true,
    },
  });
}

async function readFounderSetupSnapshot(input: {
  leagueId: string;
  seasonId: string;
  userId: string;
  currentTeamId: string | null;
}) {
  const [teams, activePrimaryManagers, postponedMarkers] = await Promise.all([
    prisma.team.findMany({
      where: {
        leagueId: input.leagueId,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        abbreviation: true,
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.teamMembership.findMany({
      where: {
        isActive: true,
        membershipType: "PRIMARY_MANAGER",
        team: {
          leagueId: input.leagueId,
        },
      },
      select: {
        teamId: true,
        userId: true,
      },
    }),
    input.currentTeamId
      ? Promise.resolve([])
      : prisma.transaction.findMany({
          where: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            type: TransactionType.COMMISSIONER_OVERRIDE,
            summary: FOUNDER_SETUP_SKIP_SUMMARY,
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            createdAt: true,
            metadata: true,
          },
          take: 25,
        }),
  ]);

  const activePrimaryManagerByTeamId = new Map(activePrimaryManagers.map((entry) => [entry.teamId, entry.userId]));
  const hasPostponed = postponedMarkers.some((marker) =>
    isFounderSkipMetadata(marker.metadata, input.userId),
  );

  const claimableTeams = teams
    .filter((team) => {
      const activeManagerUserId = activePrimaryManagerByTeamId.get(team.id) ?? null;
      return !activeManagerUserId || activeManagerUserId === input.userId;
    })
    .map((team) => ({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      ownerName: team.owner?.name ?? null,
    }));

  const currentTeam = input.currentTeamId
    ? teams.find((team) => team.id === input.currentTeamId) ?? null
    : null;
  const status: FounderSetupStatus = input.currentTeamId
    ? "COMPLETE"
    : hasPostponed
      ? "INCOMPLETE_POSTPONED"
      : "INCOMPLETE_REQUIRED";

  return {
    leagueId: input.leagueId,
    isComplete: Boolean(input.currentTeamId),
    status,
    hasPostponed,
    currentTeam: currentTeam
      ? {
          id: currentTeam.id,
          name: currentTeam.name,
          abbreviation: currentTeam.abbreviation,
        }
      : null,
    claimableTeams,
  };
}

function deriveOwnerDisplayName(input: {
  requestedName: unknown;
  fallbackName: string | null;
  fallbackEmail: string;
}) {
  if (typeof input.requestedName === "string" && input.requestedName.trim().length >= 2) {
    return input.requestedName.trim();
  }

  if (input.fallbackName && input.fallbackName.trim().length >= 2) {
    return input.fallbackName.trim();
  }

  const localPart = input.fallbackEmail.split("@")[0]?.trim() ?? "";
  return localPart.length >= 2 ? localPart : "Founder";
}

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const founderSetup = await readFounderSetupSnapshot({
    leagueId: access.context.leagueId,
    seasonId: access.context.seasonId,
    userId: access.actor.userId,
    currentTeamId: access.actor.teamId,
  });

  return NextResponse.json({
    founderSetup,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const actor = access.actor;
  const context = access.context;
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    teamId?: unknown;
    teamName?: unknown;
    teamAbbreviation?: unknown;
    divisionLabel?: unknown;
    ownerName?: unknown;
  };
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const normalizedAction: FounderSetupAction | null =
    action === "create" || action === "claim" || action === "skip" ? action : null;

  if (!normalizedAction) {
    return apiError(400, "INVALID_REQUEST", "action must be one of: create, claim, skip.");
  }

  try {
    if (normalizedAction === "skip") {
      if (!actor.teamId) {
        await logTransaction(prisma, {
          leagueId: context.leagueId,
          seasonId: context.seasonId,
          type: TransactionType.COMMISSIONER_OVERRIDE,
          summary: FOUNDER_SETUP_SKIP_SUMMARY,
          metadata: {
            updatedBy: "api/league/founder-team POST",
            workflow: "FOUNDER_TEAM_SETUP",
            action: "skip",
            actorUserId: actor.userId,
          },
        });
      }

      const founderSetup = await readFounderSetupSnapshot({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        userId: actor.userId,
        currentTeamId: actor.teamId,
      });

      return NextResponse.json({
        founderSetup,
      });
    }

    if (normalizedAction === "create") {
      if (typeof body.teamName !== "string" || body.teamName.trim().length < 2) {
        return apiError(400, "INVALID_REQUEST", "teamName must be at least 2 characters.");
      }

      const teamName = body.teamName.trim();
      const teamAbbreviation = normalizeOptionalAbbreviation(body.teamAbbreviation);
      const divisionLabel = normalizeOptionalText(body.divisionLabel);
      if (teamAbbreviation && teamAbbreviation.length > 8) {
        return apiError(400, "INVALID_REQUEST", "teamAbbreviation must be 8 characters or fewer.");
      }

      const ownerName = deriveOwnerDisplayName({
        requestedName: body.ownerName,
        fallbackName: actor.name,
        fallbackEmail: actor.email,
      });

      const createdTeam = await prisma.$transaction(async (tx) => {
        const duplicateTeam = await tx.team.findFirst({
          where: {
            leagueId: context.leagueId,
            OR: [{ name: teamName }, ...(teamAbbreviation ? [{ abbreviation: teamAbbreviation }] : [])],
          },
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        });

        if (duplicateTeam) {
          throw new FounderTeamSetupError(
            409,
            "TEAM_ALREADY_EXISTS",
            "A team with the same name or abbreviation already exists in this league.",
            {
              existingTeamId: duplicateTeam.id,
              existingTeamName: duplicateTeam.name,
              existingTeamAbbreviation: duplicateTeam.abbreviation,
            },
          );
        }

        const owner = await upsertFounderOwnerProfile({
          tx,
          userId: actor.userId,
          email: actor.email,
          ownerName,
        });

        const team = await tx.team.create({
          data: {
            leagueId: context.leagueId,
            ownerId: owner.id,
            name: teamName,
            abbreviation: teamAbbreviation,
            divisionLabel,
          },
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        });

        const teamMembershipRepository = createTeamMembershipRepository(tx);
        await teamMembershipRepository.assignPrimaryManagerMembershipInLeague({
          userId: actor.userId,
          teamId: team.id,
          leagueId: context.leagueId,
        });

        await tx.leagueMembership.update({
          where: {
            userId_leagueId: {
              userId: actor.userId,
              leagueId: context.leagueId,
            },
          },
          data: {
            teamId: team.id,
          },
        });

        await logTransaction(tx, {
          leagueId: context.leagueId,
          seasonId: context.seasonId,
          teamId: team.id,
          type: TransactionType.COMMISSIONER_OVERRIDE,
          summary: `Founder created team ${team.name} and linked commissioner ownership.`,
          metadata: {
            updatedBy: "api/league/founder-team POST",
            workflow: "FOUNDER_TEAM_SETUP",
            action: "create",
            actorUserId: actor.userId,
            ownerId: owner.id,
            teamId: team.id,
          },
        });

        return team;
      });

      const founderSetup = await readFounderSetupSnapshot({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        userId: actor.userId,
        currentTeamId: createdTeam.id,
      });

      return NextResponse.json({
        founderSetup,
      });
    }

    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return apiError(400, "INVALID_REQUEST", "teamId is required when action is claim.");
    }

    const ownerName = deriveOwnerDisplayName({
      requestedName: body.ownerName,
      fallbackName: actor.name,
      fallbackEmail: actor.email,
    });

    const claimedTeam = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: {
          id: teamId,
          leagueId: context.leagueId,
        },
        select: {
          id: true,
          name: true,
          owner: {
            select: {
              id: true,
              userId: true,
              email: true,
            },
          },
        },
      });

      if (!team) {
        throw new FounderTeamSetupError(404, "TEAM_NOT_FOUND", "Team was not found in this league.");
      }

      const conflictingMember = await tx.leagueMembership.findFirst({
        where: {
          leagueId: context.leagueId,
          teamId: team.id,
          role: LeagueRole.MEMBER,
          userId: {
            not: actor.userId,
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (conflictingMember) {
        throw new FounderTeamSetupError(
          409,
          "TEAM_MEMBERSHIP_CONFLICT",
          "This team is already assigned to another league member.",
          {
            teamId: team.id,
          },
        );
      }

      const teamMembershipRepository = createTeamMembershipRepository(tx);
      const activePrimaryManager = await teamMembershipRepository.findActivePrimaryManagerForTeam(team.id);
      if (activePrimaryManager && activePrimaryManager.userId !== actor.userId) {
        throw new FounderTeamSetupError(
          409,
          "TEAM_MEMBERSHIP_CONFLICT",
          "This team already has an active primary manager.",
          {
            teamId: team.id,
          },
        );
      }

      let ownerId = team.owner?.id ?? null;
      if (team.owner) {
        if (team.owner.userId && team.owner.userId !== actor.userId) {
          throw new FounderTeamSetupError(
            409,
            "OWNER_BINDING_CONFLICT",
            "This team owner profile is already linked to another account.",
            {
              teamId: team.id,
              ownerId: team.owner.id,
            },
          );
        }

        const updatedOwner = await tx.owner.update({
          where: {
            id: team.owner.id,
          },
          data: {
            userId: actor.userId,
            email: actor.email,
            name: ownerName,
          },
          select: {
            id: true,
          },
        });
        ownerId = updatedOwner.id;
      } else {
        const owner = await upsertFounderOwnerProfile({
          tx,
          userId: actor.userId,
          email: actor.email,
          ownerName,
        });
        ownerId = owner.id;
      }

      await tx.team.update({
        where: {
          id: team.id,
        },
        data: {
          ownerId,
        },
      });

      await teamMembershipRepository.assignPrimaryManagerMembershipInLeague({
        userId: actor.userId,
        teamId: team.id,
        leagueId: context.leagueId,
      });

      await tx.leagueMembership.update({
        where: {
          userId_leagueId: {
            userId: actor.userId,
            leagueId: context.leagueId,
          },
        },
        data: {
          teamId: team.id,
        },
      });

      await logTransaction(tx, {
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        teamId: team.id,
        type: TransactionType.COMMISSIONER_OVERRIDE,
        summary: `Founder claimed team ${team.name} and linked commissioner ownership.`,
        metadata: {
          updatedBy: "api/league/founder-team POST",
          workflow: "FOUNDER_TEAM_SETUP",
          action: "claim",
          actorUserId: actor.userId,
          ownerId,
          teamId: team.id,
        },
      });

      return team;
    });

    const founderSetup = await readFounderSetupSnapshot({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      userId: actor.userId,
      currentTeamId: claimedTeam.id,
    });

    return NextResponse.json({
      founderSetup,
    });
  } catch (error) {
    if (error instanceof FounderTeamSetupError) {
      return apiError(error.status, error.code, error.message, error.context);
    }

    throw error;
  }
}
