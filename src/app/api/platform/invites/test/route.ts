import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isInviteTestCaptureEnabled } from "@/lib/auth-constants";
import { findLatestCapturedPlatformInvite } from "@/lib/domain/auth/PlatformInviteDelivery";
import { parseOpaqueToken } from "@/lib/domain/auth/token-utils";

export async function GET(request: NextRequest) {
  if (!isInviteTestCaptureEnabled()) {
    return apiError(404, "NOT_FOUND", "Platform invite test capture is disabled.");
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return apiError(400, "INVALID_REQUEST", "email is required.");
  }

  const entry = findLatestCapturedPlatformInvite(email);
  if (!entry) {
    return apiError(404, "INVITE_NOT_FOUND", "No captured platform invite found for that email.");
  }

  const inviteToken = new URL(entry.inviteUrl).searchParams.get("token") ?? "";
  const parsedToken = parseOpaqueToken(inviteToken);

  return NextResponse.json({
    invite: {
      email: entry.email,
      url: entry.inviteUrl,
      inviteId: parsedToken?.recordId ?? null,
      expiresAt: entry.expiresAt,
      createdAt: entry.createdAt,
    },
  });
}
