import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import {
  ACTIVE_LEAGUE_COOKIE,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  requireAuthenticatedUser,
} from "@/lib/auth";
import {
  createLeagueInviteService,
  LeagueInviteAcceptanceError,
} from "@/lib/domain/auth/LeagueInviteService";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";
import {
  isInviteReturnTo,
  normalizeReturnTo,
  parseLeagueIdFromReturnTo,
} from "@/lib/return-to";

type AcceptInviteRequestBody = {
  token?: unknown;
  returnTo?: unknown;
};

function resolvePostAcceptanceRedirect(input: {
  leagueId: string;
  returnTo: unknown;
}) {
  const normalizedReturnTo =
    typeof input.returnTo === "string" ? normalizeReturnTo(input.returnTo) : null;
  if (!normalizedReturnTo || isInviteReturnTo(normalizedReturnTo)) {
    return `/league/${input.leagueId}`;
  }

  const requestedLeagueId = parseLeagueIdFromReturnTo(normalizedReturnTo);
  if (requestedLeagueId && requestedLeagueId !== input.leagueId) {
    return `/league/${input.leagueId}`;
  }

  return normalizedReturnTo;
}

export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedUser(request).catch(() => null);
  if (!user) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const body = (await request.json().catch(() => ({}))) as AcceptInviteRequestBody;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length === 0) {
    return apiError(400, "INVALID_REQUEST", "token is required.");
  }

  try {
    const result = await createLeagueInviteService(prisma).acceptInviteForAuthenticatedUser({
      token,
      userId: user.id,
    });

    const redirectTo = resolvePostAcceptanceRedirect({
      leagueId: result.membership.leagueId,
      returnTo: body.returnTo,
    });

    const response = NextResponse.json({
      invite: {
        id: result.invite.id,
        leagueId: result.invite.leagueId,
        teamId: result.invite.teamId,
        intendedRole: result.invite.intendedRole,
        intendedLeagueRole: toCanonicalLeagueRole(result.invite.intendedRole),
      },
      membership: result.membership,
      redirectTo,
    });
    const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value?.trim();
    if (sessionToken) {
      response.cookies.set(AUTH_SESSION_COOKIE, sessionToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
      });
    }
    response.cookies.set(ACTIVE_LEAGUE_COOKIE, result.membership.leagueId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    if (error instanceof LeagueInviteAcceptanceError) {
      switch (error.code) {
        case "INVALID_INVITE":
          return apiError(404, "INVITE_NOT_FOUND", "That invitation could not be found.");
        case "EXPIRED_INVITE":
          return apiError(409, "INVITE_EXPIRED", "That invitation has expired.");
        case "REVOKED_INVITE":
          return apiError(409, "INVITE_REVOKED", "That invitation has been revoked.");
        case "INVITE_ALREADY_ACCEPTED":
          return apiError(409, "INVITE_ALREADY_ACCEPTED", "That invitation has already been accepted.");
        case "INVITE_EMAIL_MISMATCH":
          return apiError(
            403,
            "INVITE_EMAIL_MISMATCH",
            "You must sign in with the invited email address to accept this invitation.",
          );
        case "LEAGUE_MEMBERSHIP_CONFLICT":
        case "TEAM_MEMBERSHIP_CONFLICT":
        case "OWNER_BINDING_CONFLICT":
          return apiError(
            409,
            "INVITE_CONFLICT",
            "That invitation can no longer be accepted because the target membership changed.",
          );
      }
    }

    throw error;
  }
}
