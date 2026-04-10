import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseJsonBody } from "@/lib/request";
import { prisma } from "@/lib/prisma";
import {
  createPlatformInviteService,
  PlatformInviteAcceptanceError,
} from "@/lib/domain/auth/PlatformInviteService";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return apiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const json = await parseJsonBody<{ token?: unknown }>(request);
  if (!json.ok) return json.response;
  const { token } = json.data;

  if (typeof token !== "string" || token.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "token is required.");
  }

  try {
    await createPlatformInviteService(prisma).acceptInvite({
      token: token.trim(),
      userId: user.id,
      userEmail: user.email,
    });
  } catch (error) {
    if (error instanceof PlatformInviteAcceptanceError) {
      switch (error.code) {
        case "INVALID_INVITE":
          return apiError(404, "INVITE_NOT_FOUND", "This invite link is invalid or not found.");
        case "EXPIRED_INVITE":
          return apiError(410, "INVITE_EXPIRED", "This invitation has expired.");
        case "REVOKED_INVITE":
          return apiError(410, "INVITE_REVOKED", "This invitation has been revoked.");
        case "INVITE_ALREADY_ACCEPTED":
          return apiError(409, "INVITE_ALREADY_ACCEPTED", "This invitation has already been accepted.");
        case "INVITE_EMAIL_MISMATCH":
          return apiError(
            403,
            "INVITE_EMAIL_MISMATCH",
            "This invitation was sent to a different email address.",
          );
      }
    }
    throw error;
  }

  return NextResponse.json({ ok: true, redirectTo: "/my-leagues" });
}
