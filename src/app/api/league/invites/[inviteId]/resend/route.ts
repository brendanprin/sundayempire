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
      return apiError(409, "INVITE_ALREADY_ACCEPTED", "Accepted invites cannot be resent.");
    case "INVITE_REVOKED":
      return apiError(409, "INVITE_REVOKED", "Revoked invites cannot be resent.");
    case "INVITE_REVOKE_NOT_ALLOWED":
      return apiError(409, "INVITE_CONFLICT", "Only pending or expired invites can be resent.");
    default:
      return apiError(409, "INVITE_CONFLICT", "Invite resend could not be completed.");
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
    const resent = await createLeagueInviteService(prisma).resendInvite({
      inviteId,
      origin: request.nextUrl.origin,
      invitedByUserId: access.actor.userId,
    });

    await logTransaction(prisma, {
      leagueId: access.context.leagueId,
      seasonId: access.context.seasonId,
      teamId: resent.invite.teamId ?? null,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Resent invite for ${resent.invite.email}.`,
      metadata: {
        updatedBy: "api/league/invites/[inviteId]/resend POST",
        previousInviteId: inviteId,
        replacementInviteId: resent.invite.id,
        ownerId: resent.invite.ownerId,
        teamId: resent.invite.teamId,
        email: resent.invite.email,
        deliveryState: resent.deliveryView.state,
      },
    });

    return NextResponse.json({
      invite: {
        id: resent.invite.id,
        email: resent.invite.email,
        intendedRole: resent.invite.intendedRole,
        intendedLeagueRole: toCanonicalLeagueRole(resent.invite.intendedRole),
        teamId: resent.invite.teamId,
        ownerId: resent.invite.ownerId,
        createdAt: resent.invite.createdAt.toISOString(),
        expiresAt: resent.invite.expiresAt.toISOString(),
        acceptedAt: resent.invite.acceptedAt?.toISOString() ?? null,
        revokedAt: resent.invite.revokedAt?.toISOString() ?? null,
        status: "pending",
      },
      delivery: {
        state: resent.deliveryView.state,
        label: resent.deliveryView.label,
        detail: resent.deliveryView.detail,
        attemptedAt: resent.deliveryView.attemptedAt?.toISOString() ?? null,
        canRetry: resent.deliveryView.canRetry,
        inviteStillValid: resent.deliveryView.inviteStillValid,
      },
      previousInviteId: inviteId,
    });
  } catch (error) {
    if (error instanceof LeagueInviteManagementError) {
      return mapInviteManagementError(error);
    }

    throw error;
  }
}
