import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueInviteRole } from "@/lib/authorization";
import {
  LeagueInviteManagementError,
  createLeagueInviteService,
} from "@/lib/domain/auth/LeagueInviteService";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";
import { logTransaction } from "@/lib/transactions";

function mapInviteManagementError(error: LeagueInviteManagementError) {
  switch (error.code) {
    case "INVITE_NOT_FOUND":
      return apiError(404, "INVITE_NOT_FOUND", "Invite was not found.");
    case "INVITE_ALREADY_ACCEPTED":
      return apiError(409, "INVITE_ALREADY_ACCEPTED", "Accepted invites cannot be revoked.");
    case "INVITE_REVOKED":
      return apiError(409, "INVITE_REVOKED", "Invite has already been revoked.");
    case "INVITE_REVOKE_NOT_ALLOWED":
      return apiError(409, "INVITE_CONFLICT", "Only pending invites can be revoked.");
    default:
      return apiError(409, "INVITE_CONFLICT", "Invite revoke could not be completed.");
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      inviteId: string;
    }>;
  },
) {
  const { inviteId } = await context.params;
  const access = await requireLeagueInviteRole(request, inviteId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  try {
    const revoked = await createLeagueInviteService(prisma).revokeInvite({
      inviteId,
    });

    await logTransaction(prisma, {
      leagueId: access.context.leagueId,
      seasonId: access.context.seasonId,
      teamId: revoked.teamId ?? null,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Revoked invite for ${revoked.email}.`,
      metadata: {
        updatedBy: "api/league/invites/[inviteId]/revoke POST",
        inviteId: revoked.id,
        ownerId: revoked.ownerId,
        teamId: revoked.teamId,
        email: revoked.email,
      },
    });

    return NextResponse.json({
      invite: {
        id: revoked.id,
        email: revoked.email,
        intendedRole: revoked.intendedRole,
        intendedLeagueRole: toCanonicalLeagueRole(revoked.intendedRole),
        teamId: revoked.teamId,
        ownerId: revoked.ownerId,
        createdAt: revoked.createdAt.toISOString(),
        expiresAt: revoked.expiresAt.toISOString(),
        acceptedAt: revoked.acceptedAt?.toISOString() ?? null,
        revokedAt: revoked.revokedAt?.toISOString() ?? null,
        status: revoked.status,
      },
    });
  } catch (error) {
    if (error instanceof LeagueInviteManagementError) {
      return mapInviteManagementError(error);
    }

    throw error;
  }
}
