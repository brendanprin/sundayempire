import { PlatformRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createActorContextService } from "@/lib/application/actor-context/service";
import {
  ACTIVE_LEAGUE_COOKIE,
  AUTH_EMAIL_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_SESSION_COOKIE,
  HEADER_EMAIL,
  HEADER_LEAGUE_ID,
  isDemoAuthLoginEnabled,
  isLegacyAuthCompatibilityEnabled,
} from "@/lib/auth-constants";
import {
  AuthRequiredError,
  type CreateAuthSessionInput,
  type AuthenticatedSession,
  type AuthenticatedUser,
  type AuthRequestLike,
  createAuthSessionService,
  type AuthSessionServiceOptions,
} from "@/lib/domain/auth/AuthSessionService";
import { prisma } from "@/lib/prisma";
import {
  AccountRole,
  AcceptedLeagueRole,
  CanonicalLeagueRole,
  hasAcceptedLeagueRole,
} from "@/lib/role-model";

const authSessionService = createAuthSessionService(prisma);

export {
  ACTIVE_LEAGUE_COOKIE,
  AUTH_EMAIL_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_SESSION_COOKIE,
  HEADER_EMAIL,
  HEADER_LEAGUE_ID,
  isDemoAuthLoginEnabled,
  isLegacyAuthCompatibilityEnabled,
};
export type { AuthenticatedSession, AuthenticatedUser, AuthRequestLike, AuthSessionServiceOptions };
export { AuthRequiredError };

export type AuthActor = {
  userId: string;
  email: string;
  name: string | null;
  accountRole: AccountRole;
  leagueRole: CanonicalLeagueRole;
  teamId: string | null;
  teamName: string | null;
  leagueId: string;
};

type AcceptedRole = AcceptedLeagueRole;
type AcceptedPlatformRole = PlatformRole | "ADMIN" | "USER";

export async function getSessionFromRequest(
  request?: NextRequest | AuthRequestLike,
): Promise<AuthenticatedSession | null> {
  return authSessionService.getSessionFromRequest(request);
}

export async function getAuthenticatedUser(
  request?: NextRequest | AuthRequestLike,
): Promise<AuthenticatedUser | null> {
  return authSessionService.getAuthenticatedUser(request);
}

export async function requireAuthenticatedUser(
  request?: NextRequest | AuthRequestLike,
): Promise<AuthenticatedUser> {
  return authSessionService.requireAuthenticatedUser(request);
}

export async function createUserSession(input: CreateAuthSessionInput) {
  return authSessionService.createSession(input);
}

export async function revokeSessionFromRequest(request?: NextRequest | AuthRequestLike) {
  return authSessionService.revokeSessionFromRequest(request);
}

export function applyAuthenticatedSessionCookies(
  response: NextResponse,
  input: {
    token: string;
    activeLeagueId?: string | null;
    maxAgeSeconds?: number;
  },
) {
  const secure = process.env.NODE_ENV === "production";
  const maxAge = input.maxAgeSeconds ?? AUTH_SESSION_MAX_AGE_SECONDS;

  response.cookies.set(AUTH_SESSION_COOKIE, input.token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge,
  });

  if (input.activeLeagueId) {
    response.cookies.set(ACTIVE_LEAGUE_COOKIE, input.activeLeagueId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge,
    });
  } else {
    response.cookies.delete(ACTIVE_LEAGUE_COOKIE);
  }

  response.cookies.delete(AUTH_EMAIL_COOKIE);
}

export function clearAuthenticationCookies(response: NextResponse) {
  response.cookies.delete(AUTH_SESSION_COOKIE);
  response.cookies.delete(AUTH_EMAIL_COOKIE);
  response.cookies.delete(ACTIVE_LEAGUE_COOKIE);
}

// Legacy alias retained while routes move to getAuthenticatedUser().
export async function getRequestUser(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  return getAuthenticatedUser(request);
}

export async function getAuthActorForLeague(
  request: NextRequest,
  leagueId: string,
): Promise<AuthActor | null> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return null;
  }

  const actor = await createActorContextService(prisma).resolveActorForUserId(user.id, leagueId);
  if (!actor) {
    return null;
  }

  return {
    userId: actor.userId,
    email: actor.email,
    name: actor.name,
    accountRole: actor.accountRole,
    leagueRole: actor.leagueRole,
    teamId: actor.teamId,
    teamName: actor.teamName,
    leagueId: actor.leagueId,
  };
}

export async function requirePlatformRole(
  request: NextRequest,
  roles: AcceptedPlatformRole[],
): Promise<{ user: AuthenticatedUser | null; response: NextResponse | null }> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      user: null,
      response: apiError(401, "AUTH_REQUIRED", "Authentication is required."),
    };
  }

  if (!roles.includes(user.platformRole)) {
    return {
      user,
      response: apiError(403, "FORBIDDEN", "You do not have platform permission for this action."),
    };
  }

  return {
    user,
    response: null,
  };
}

export async function requireLeagueMembership(
  request: NextRequest,
  leagueId: string,
): Promise<{ actor: AuthActor | null; response: NextResponse | null }> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      actor: null,
      response: apiError(401, "AUTH_REQUIRED", "Authentication is required."),
    };
  }

  const actor = await getAuthActorForLeague(request, leagueId);
  if (!actor) {
    return {
      actor: null,
      response: apiError(403, "FORBIDDEN", "You do not have membership access to this league."),
    };
  }

  return {
    actor,
    response: null,
  };
}

export async function requireLeagueRole(
  request: NextRequest,
  leagueId: string,
  roles: readonly AcceptedRole[],
): Promise<{ actor: AuthActor | null; response: NextResponse | null }> {
  const membership = await requireLeagueMembership(request, leagueId);
  if (membership.response || !membership.actor) {
    return membership;
  }

  if (
    !hasAcceptedLeagueRole({
      leagueRole: membership.actor.leagueRole,
      acceptedRoles: roles,
    })
  ) {
    return {
      actor: membership.actor,
      response: apiError(403, "FORBIDDEN", "You do not have permission for this action."),
    };
  }

  return { actor: membership.actor, response: null };
}

export function requireActorTeamScope(
  actor: AuthActor,
  teamId: string,
): NextResponse | null {
  if (actor.leagueRole === "COMMISSIONER") {
    return null;
  }

  if (actor.teamId === teamId) {
    return null;
  }

  return apiError(403, "FORBIDDEN", "You do not have permission for this team.");
}

export function isActorCommissioner(actor: Pick<AuthActor, "leagueRole">) {
  return actor.leagueRole === "COMMISSIONER";
}

export function isActorTeamScopedMember(actor: Pick<AuthActor, "leagueRole" | "teamId">) {
  return actor.leagueRole === "MEMBER" && Boolean(actor.teamId);
}
