import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isInviteManagementCopyLinkEnabled } from "@/lib/auth-constants";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import {
  type ManagedLeagueInvite,
  createLeagueInviteService,
} from "@/lib/domain/auth/LeagueInviteService";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";
import { logTransaction } from "@/lib/transactions";

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serializeInvite(invite: ManagedLeagueInvite) {
  return {
    id: invite.id,
    leagueId: invite.leagueId,
    email: invite.email,
    intendedRole: invite.intendedRole,
    intendedLeagueRole: toCanonicalLeagueRole(invite.intendedRole),
    teamId: invite.teamId,
    ownerId: invite.ownerId,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    league: invite.league,
    team: invite.team,
    owner: invite.owner,
    invitedByUser: invite.invitedByUser,
    delivery: invite.delivery
      ? {
          state: invite.delivery.state,
          label: invite.delivery.label,
          detail: invite.delivery.detail,
          attemptedAt: invite.delivery.attemptedAt?.toISOString() ?? null,
          canRetry: invite.delivery.canRetry,
          inviteStillValid: invite.delivery.inviteStillValid,
        }
      : null,
    status: invite.status,
    canResend: invite.canResend,
    canRevoke: invite.canRevoke,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const invites = await createLeagueInviteService(prisma).listInvitesForLeague(
    access.context.leagueId,
  );

  return NextResponse.json({
    invites: invites.map((invite) => serializeInvite(invite)),
    capabilities: {
      copyFreshLink: isInviteManagementCopyLinkEnabled(),
    },
  });
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const actor = access.actor;
  const body = (await request.json().catch(() => ({}))) as {
    ownerName?: unknown;
    ownerEmail?: unknown;
    teamName?: unknown;
    teamAbbreviation?: unknown;
    divisionLabel?: unknown;
  };

  if (typeof body.ownerName !== "string" || body.ownerName.trim().length < 2) {
    return apiError(400, "INVALID_REQUEST", "ownerName must be at least 2 characters.");
  }
  if (typeof body.ownerEmail !== "string" || body.ownerEmail.trim().length < 5) {
    return apiError(400, "INVALID_REQUEST", "ownerEmail is required.");
  }
  if (typeof body.teamName !== "string" || body.teamName.trim().length < 2) {
    return apiError(400, "INVALID_REQUEST", "teamName must be at least 2 characters.");
  }
  if (
    body.teamAbbreviation !== undefined &&
    body.teamAbbreviation !== null &&
    typeof body.teamAbbreviation !== "string"
  ) {
    return apiError(400, "INVALID_REQUEST", "teamAbbreviation must be a string when provided.");
  }
  if (
    body.divisionLabel !== undefined &&
    body.divisionLabel !== null &&
    typeof body.divisionLabel !== "string"
  ) {
    return apiError(400, "INVALID_REQUEST", "divisionLabel must be a string when provided.");
  }

  const ownerEmail = body.ownerEmail.trim().toLowerCase();
  const ownerName = body.ownerName.trim();
  const teamName = body.teamName.trim();
  const teamAbbreviation =
    typeof body.teamAbbreviation === "string" && body.teamAbbreviation.trim()
      ? body.teamAbbreviation.trim().toUpperCase()
      : null;
  const divisionLabel = normalizeOptionalText(body.divisionLabel);

  if (teamAbbreviation && teamAbbreviation.length > 8) {
    return apiError(400, "INVALID_REQUEST", "teamAbbreviation must be 8 characters or fewer.");
  }

  const duplicateTeam = await prisma.team.findFirst({
    where: {
      leagueId: context.leagueId,
      OR: [
        { name: teamName },
        ...(teamAbbreviation ? [{ abbreviation: teamAbbreviation }] : []),
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
      },
    );
  }

  const invitedUser = await prisma.user.findUnique({
    where: {
      email: ownerEmail,
    },
    select: {
      id: true,
      email: true,
    },
  });
  if (invitedUser) {
    const existingMembership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: invitedUser.id,
          leagueId: context.leagueId,
        },
      },
      select: {
        role: true,
        teamId: true,
      },
    });

    if (existingMembership) {
      return apiError(
        409,
        "INVITE_CONFLICT",
        "Target user already has membership access in this league.",
        {
          email: invitedUser.email,
          leagueRole: toCanonicalLeagueRole(existingMembership.role),
          teamId: existingMembership.teamId,
        },
      );
    }
  }

  const inviteService = createLeagueInviteService(prisma);
  const pendingInvite = await inviteService.findLatestPendingInviteByEmail(ownerEmail);
  if (pendingInvite?.leagueId === context.leagueId) {
    return apiError(
      409,
      "INVITE_CONFLICT",
      "A pending invite already exists for that email in this league.",
      {
        email: ownerEmail,
        inviteId: pendingInvite.id,
      },
    );
  }

  const invited = await prisma.$transaction(async (tx) => {
    const ownerRecord = await tx.owner.findFirst({
      where: {
        email: ownerEmail,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (ownerRecord?.userId && invitedUser && ownerRecord.userId !== invitedUser.id) {
      return {
        error: apiError(
          409,
          "INVITE_CONFLICT",
          "That owner record is already bound to a different user account.",
          {
            email: ownerEmail,
            ownerId: ownerRecord.id,
          },
        ),
      };
    }

    const owner = ownerRecord
      ? await tx.owner.update({
          where: {
            id: ownerRecord.id,
          },
          data: {
            name: ownerName,
            email: ownerEmail,
          },
          select: {
            id: true,
            name: true,
            email: true,
            userId: true,
          },
        })
      : await tx.owner.create({
          data: {
            name: ownerName,
            email: ownerEmail,
          },
          select: {
            id: true,
            name: true,
            email: true,
            userId: true,
          },
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
        divisionLabel: true,
      },
    });

    const pickRows: {
      leagueId: string;
      seasonYear: number;
      round: number;
      overall: number;
      originalTeamId: string;
      currentTeamId: string;
      isUsed: boolean;
    }[] = [];

    for (let seasonOffset = 0; seasonOffset < 3; seasonOffset += 1) {
      const seasonYear = context.seasonYear + seasonOffset;
      for (let round = 1; round <= 2; round += 1) {
        const maxOverall = await tx.futurePick.aggregate({
          where: {
            leagueId: context.leagueId,
            seasonYear,
            round,
          },
          _max: {
            overall: true,
          },
        });

        pickRows.push({
          leagueId: context.leagueId,
          seasonYear,
          round,
          overall: (maxOverall._max.overall ?? 0) + 1,
          originalTeamId: team.id,
          currentTeamId: team.id,
          isUsed: false,
        });
      }
    }

    await tx.futurePick.createMany({
      data: pickRows,
    });

    const invite = await createLeagueInviteService(tx).createInvite({
      leagueId: context.leagueId,
      email: ownerEmail,
      intendedRole: "MEMBER",
      teamId: team.id,
      ownerId: owner.id,
      invitedByUserId: actor.userId,
      origin: request.nextUrl.origin,
    });

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Invited member ${owner.name} and created team ${team.name}.`,
      metadata: {
        updatedBy: "api/league/invites POST",
        ownerId: owner.id,
        ownerEmail: owner.email,
        teamId: team.id,
        inviteId: invite.invite.id,
        picksCreated: pickRows.length,
        deliveryState: invite.deliveryView.state,
      },
    });

    return {
      error: null,
      owner,
      team,
      invite: invite.invite,
      delivery: invite.delivery,
      deliveryView: invite.deliveryView,
      picksCreated: pickRows.length,
    };
  });

  if (invited.error) {
    return invited.error;
  }

  return NextResponse.json(
    {
      owner: invited.owner,
      team: invited.team,
      invite: {
        id: invited.invite.id,
        email: invited.invite.email,
        intendedRole: invited.invite.intendedRole,
        intendedLeagueRole: toCanonicalLeagueRole(invited.invite.intendedRole),
        expiresAt: invited.invite.expiresAt.toISOString(),
        acceptedAt: invited.invite.acceptedAt?.toISOString() ?? null,
        revokedAt: invited.invite.revokedAt?.toISOString() ?? null,
      },
      delivery: {
        state: invited.deliveryView.state,
        label: invited.deliveryView.label,
        detail: invited.deliveryView.detail,
        attemptedAt: invited.deliveryView.attemptedAt?.toISOString() ?? null,
        canRetry: invited.deliveryView.canRetry,
        inviteStillValid: invited.deliveryView.inviteStillValid,
      },
      picksCreated: invited.picksCreated,
    },
    { status: 201 },
  );
}
