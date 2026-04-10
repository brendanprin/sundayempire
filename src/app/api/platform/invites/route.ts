import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseJsonBody } from "@/lib/request";
import { prisma } from "@/lib/prisma";
import {
  createPlatformInviteService,
  type ManagedPlatformInvite,
} from "@/lib/domain/auth/PlatformInviteService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeInvite(invite: ManagedPlatformInvite) {
  return {
    id: invite.id,
    email: invite.email,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
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
  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return apiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const invites = await createPlatformInviteService(prisma).listInvitesSentByUser(user.id);
  return NextResponse.json({ invites: invites.map(serializeInvite) });
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return apiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const json = await parseJsonBody<{ email?: unknown }>(request);
  if (!json.ok) return json.response;
  const { email: rawEmail } = json.data;

  if (typeof rawEmail !== "string" || !EMAIL_PATTERN.test(rawEmail.trim())) {
    return apiError(400, "INVALID_REQUEST", "A valid email address is required.");
  }

  const email = rawEmail.trim().toLowerCase();

  // Don't invite someone who's already a platform member.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    return apiError(
      409,
      "ALREADY_A_MEMBER",
      "That email address already has a SundayEmpire account.",
    );
  }

  // Don't send a duplicate pending invite.
  const pendingInvite = await createPlatformInviteService(prisma).findLatestPendingByEmail(email);
  if (pendingInvite) {
    return apiError(
      409,
      "INVITE_ALREADY_PENDING",
      "A pending platform invite already exists for that email.",
      { inviteId: pendingInvite.id },
    );
  }

  const result = await createPlatformInviteService(prisma).createInvite({
    email,
    invitedByUserId: user.id,
    origin: request.nextUrl.origin,
  });

  return NextResponse.json(
    {
      invite: serializeInvite({
        ...result.invite,
        delivery: result.deliveryView,
        status: "pending",
        canResend: true,
        canRevoke: true,
      }),
    },
    { status: 201 },
  );
}
