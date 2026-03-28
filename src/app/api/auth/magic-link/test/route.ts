import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isMagicLinkTestCaptureEnabled } from "@/lib/auth-constants";
import { findLatestCapturedMagicLink } from "@/lib/domain/auth/MagicLinkDelivery";

export async function GET(request: NextRequest) {
  if (!isMagicLinkTestCaptureEnabled()) {
    return apiError(404, "NOT_FOUND", "Magic-link test capture is disabled.");
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return apiError(400, "INVALID_REQUEST", "email is required.");
  }

  const returnTo = request.nextUrl.searchParams.get("returnTo");
  const entry = findLatestCapturedMagicLink(email, {
    returnTo,
  });
  if (!entry) {
    return apiError(404, "MAGIC_LINK_NOT_FOUND", "No captured magic link was found for that email.");
  }

  return NextResponse.json({
    magicLink: {
      email: entry.email,
      url: entry.magicLinkUrl,
      expiresAt: entry.expiresAt,
      createdAt: entry.createdAt,
    },
  });
}
