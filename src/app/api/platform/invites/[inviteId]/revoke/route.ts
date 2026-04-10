import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createPlatformInviteService,
  PlatformInviteManagementError,
} from "@/lib/domain/auth/PlatformInviteService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return apiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const { inviteId } = await params;

  // Verify the invite belongs to this user before revoking.
  const invite = await prisma.platformInvite.findUnique({
    where: { id: inviteId },
    select: { invitedByUserId: true },
  });
  if (!invite) {
    return apiError(404, "INVITE_NOT_FOUND", "Invite not found.");
  }
  if (invite.invitedByUserId !== user.id) {
    return apiError(403, "FORBIDDEN", "You do not have permission to revoke this invite.");
  }

  try {
    const revoked = await createPlatformInviteService(prisma).revokeInvite(inviteId);
    return NextResponse.json({ invite: { id: revoked.id, status: revoked.status } });
  } catch (error) {
    if (error instanceof PlatformInviteManagementError) {
      switch (error.code) {
        case "INVITE_NOT_FOUND":
          return apiError(404, "INVITE_NOT_FOUND", "Invite not found.");
        case "INVITE_ALREADY_ACCEPTED":
          return apiError(409, "INVITE_ALREADY_ACCEPTED", "Cannot revoke an accepted invite.");
        case "INVITE_REVOKED":
          return apiError(409, "INVITE_REVOKED", "This invite is already revoked.");
        default:
          return apiError(409, "INVITE_REVOKE_NOT_ALLOWED", "This invite cannot be revoked.");
      }
    }
    throw error;
  }
}
