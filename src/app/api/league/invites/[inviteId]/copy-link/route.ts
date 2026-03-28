import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isInviteManagementCopyLinkEnabled } from "@/lib/auth-constants";
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
      return apiError(409, "INVITE_ALREADY_ACCEPTED", "Accepted invites cannot be copied.");
    case "INVITE_REVOKED":
      return apiError(409, "INVITE_REVOKED", "Revoked invites cannot be copied.");
    case "INVITE_REVOKE_NOT_ALLOWED":
      return apiError(
        409,
        "INVITE_CONFLICT",
        "Only pending or expired invites can generate a fresh link.",
      );
    default:
      return apiError(409, "INVITE_CONFLICT", "Invite link copy could not be completed.");
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
  if (!isInviteManagementCopyLinkEnabled()) {
    return apiError(404, "NOT_FOUND", "Invite link copy is not available.");
  }

  const { inviteId } = await context.params;
  const access = await requireLeagueInviteRole(request, inviteId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  try {
    const copied = await createLeagueInviteService(prisma).resendInvite({
      inviteId,
      origin: request.nextUrl.origin,
      invitedByUserId: access.actor.userId,
    });

    await logTransaction(prisma, {
      leagueId: access.context.leagueId,
      seasonId: access.context.seasonId,
      teamId: copied.invite.teamId ?? null,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Generated a fresh invite link for ${copied.invite.email}.`,
      metadata: {
        updatedBy: "api/league/invites/[inviteId]/copy-link POST",
        previousInviteId: inviteId,
        replacementInviteId: copied.invite.id,
        ownerId: copied.invite.ownerId,
        teamId: copied.invite.teamId,
        email: copied.invite.email,
        deliveryState: copied.deliveryView.state,
      },
    });

    return NextResponse.json({
      invite: {
        id: copied.invite.id,
        email: copied.invite.email,
        intendedRole: copied.invite.intendedRole,
        intendedLeagueRole: toCanonicalLeagueRole(copied.invite.intendedRole),
        teamId: copied.invite.teamId,
        ownerId: copied.invite.ownerId,
        createdAt: copied.invite.createdAt.toISOString(),
        expiresAt: copied.invite.expiresAt.toISOString(),
        acceptedAt: copied.invite.acceptedAt?.toISOString() ?? null,
        revokedAt: copied.invite.revokedAt?.toISOString() ?? null,
        status: "pending",
      },
      delivery: {
        state: copied.deliveryView.state,
        label: copied.deliveryView.label,
        detail: copied.deliveryView.detail,
        attemptedAt: copied.deliveryView.attemptedAt?.toISOString() ?? null,
        canRetry: copied.deliveryView.canRetry,
        inviteStillValid: copied.deliveryView.inviteStillValid,
      },
      inviteUrl: copied.inviteUrl,
      previousInviteId: inviteId,
    });
  } catch (error) {
    if (error instanceof LeagueInviteManagementError) {
      return mapInviteManagementError(error);
    }

    throw error;
  }
}
