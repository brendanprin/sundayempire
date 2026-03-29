import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/lib/auth";
import { resolveAuthenticatedEntry } from "@/lib/auth/authenticated-entry-resolver";
import { parseLeagueIdFromReturnTo } from "@/lib/return-to";

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (!user) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  // Get preferred league ID from query parameters
  const searchParams = request.nextUrl.searchParams;
  const preferredLeagueId = searchParams.get("leagueId")?.trim() || null;
  const returnTo = searchParams.get("returnTo")?.trim() || null;
  
  // Extract league ID from returnTo if provided and no explicit league ID
  const resolvedPreferredLeagueId = preferredLeagueId || parseLeagueIdFromReturnTo(returnTo);

  try {
    const resolution = await resolveAuthenticatedEntry(user.id, resolvedPreferredLeagueId);

    return NextResponse.json({
      resolution,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    return apiError(
      500,
      "RESOLUTION_FAILED",
      "Failed to resolve authenticated entry context.",
      { error: error instanceof Error ? error.message : "Unknown error" }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (!user) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const body = await request.json().catch(() => ({}));
  const { leagueId } = body;

  if (typeof leagueId !== "string" || !leagueId.trim()) {
    return apiError(400, "INVALID_REQUEST", "leagueId is required.");
  }

  try {
    // Force resolution with a specific league ID
    const resolution = await resolveAuthenticatedEntry(user.id, leagueId.trim());

    return NextResponse.json({
      resolution,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    return apiError(
      500,
      "RESOLUTION_FAILED",
      "Failed to resolve authenticated entry context.",
      { error: error instanceof Error ? error.message : "Unknown error" }
    );
  }
}