import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { resolvePostAuthenticationDestination } from "@/lib/auth-entry";
import { resolveQuickAuthenticatedRoute } from "@/lib/auth/authenticated-entry-resolver";
import {
  ACTIVE_LEAGUE_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  HEADER_LEAGUE_ID,
  applyAuthenticatedSessionCookies,
  clearAuthenticationCookies,
  createUserSession,
  isDemoAuthLoginEnabled,
  revokeSessionFromRequest,
} from "@/lib/auth";
import { AUTH_MAGIC_LINK_TOKEN_PARAM } from "@/lib/auth-constants";
import { createActorContextService } from "@/lib/application/actor-context/service";
import { selectPreferredSeason } from "@/lib/domain/lifecycle/season-selection";
import {
  MagicLinkConsumeError,
  createMagicLinkAuthService,
} from "@/lib/domain/auth/MagicLinkAuthService";
import {
  parseLeagueIdFromReturnTo,
  RETURN_TO_PARAM,
  normalizeReturnTo,
} from "@/lib/return-to";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";

const magicLinkAuthService = createMagicLinkAuthService(prisma);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SessionMembership = {
  leagueId: string;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  team: {
    name: string;
  } | null;
  league: {
    id: string;
    name: string;
    seasons: {
      id: string;
      year: number;
      status: "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
    }[];
    rulesets: {
      id: string;
    }[];
  };
};

type SessionPostBody = {
  email?: unknown;
  leagueId?: unknown;
  mode?: unknown;
  returnTo?: unknown;
};

function hasReadyLeagueContext(membership: SessionMembership) {
  return (
    Boolean(selectPreferredSeason(membership.league.seasons)) &&
    membership.league.rulesets.length > 0
  );
}

function extractClientIpAddress(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return null;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRequestedLeagueId(request: NextRequest) {
  return (
    request.headers.get(HEADER_LEAGUE_ID)?.trim() ||
    request.cookies.get(ACTIVE_LEAGUE_COOKIE)?.value?.trim() ||
    null
  );
}

async function listSessionMemberships(userId: string): Promise<SessionMembership[]> {
  const memberships = await prisma.leagueMembership.findMany({
    where: { userId },
    select: {
      leagueId: true,
      role: true,
      teamId: true,
      team: {
        select: {
          name: true,
        },
      },
      league: {
        select: {
          id: true,
          name: true,
          seasons: {
            orderBy: { year: "desc" },
            select: {
              id: true,
              year: true,
              status: true,
            },
          },
          rulesets: {
            where: { isActive: true },
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  return memberships.map((membership) => ({
    leagueId: membership.leagueId,
    leagueRole: toCanonicalLeagueRole(membership.role),
    teamId: membership.teamId,
    team: membership.team,
    league: membership.league,
  }));
}

function pickPreferredReadyMembership(input: {
  memberships: SessionMembership[];
  preferredLeagueIds: Array<string | null | undefined>;
}) {
  const readyMemberships = input.memberships.filter(hasReadyLeagueContext);

  for (const leagueId of input.preferredLeagueIds) {
    if (!leagueId) {
      continue;
    }

    const matchingMembership = readyMemberships.find(
      (membership) => membership.leagueId === leagueId,
    );
    if (matchingMembership) {
      return matchingMembership;
    }
  }

  return readyMemberships[0] ?? null;
}

function buildMagicLinkErrorRedirect(request: NextRequest, returnTo: string | null, error: MagicLinkConsumeError) {
  const loginUrl = new URL("/login", request.url);
  if (returnTo) {
    loginUrl.searchParams.set(RETURN_TO_PARAM, returnTo);
  }
  
  // Map specific error codes to login error parameters
  const errorParam = (() => {
    switch (error.code) {
      case "EXPIRED_MAGIC_LINK":
        return "magic_link_expired";
      case "CONSUMED_MAGIC_LINK":
        return "magic_link_used";
      case "MAGIC_LINK_USER_NOT_FOUND":
        return "user_not_found";
      case "INVALID_MAGIC_LINK":
      default:
        return "magic_link_invalid";
    }
  })();
  
  loginUrl.searchParams.set("error", errorParam);
  return NextResponse.redirect(loginUrl);
}

async function handleDemoIdentitySignIn(request: NextRequest, body: SessionPostBody) {
  // Temporary bridge for seeded local/demo identities. Production auth should use magic links instead.
  if (!isDemoAuthLoginEnabled()) {
    return apiError(
      403,
      "FORBIDDEN",
      "Demo identity sign-in is disabled in this environment.",
    );
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return apiError(400, "INVALID_REQUEST", "email is required.");
  }

  const requestedLeagueId = normalizeOptionalString(body.leagueId);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    return apiError(403, "LEAGUE_MEMBERSHIP_NOT_FOUND", "No league membership was found for this user.", {
      email,
    });
  }

  const memberships = await listSessionMemberships(user.id);
  if (memberships.length === 0) {
    return apiError(403, "LEAGUE_MEMBERSHIP_NOT_FOUND", "No league membership was found for this user.", {
      email,
    });
  }

  if (
    requestedLeagueId &&
    !memberships.some((membership) => membership.leagueId === requestedLeagueId)
  ) {
    return apiError(
      403,
      "FORBIDDEN",
      "You do not have membership access to the requested league workspace.",
      { email, leagueId: requestedLeagueId },
    );
  }

  // Use the centralized resolver to determine context and create session
  const { token } = await createUserSession({
    userId: user.id,
    expiresAt: new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000),
    userAgent: request.headers.get("user-agent")?.trim() ?? null,
    ipAddress: extractClientIpAddress(request),
  });

  // Get the optimal route using the resolver
  const destinationRoute = await resolveQuickAuthenticatedRoute(user.id, requestedLeagueId);

  const response = NextResponse.json({
    actor: {
      userId: user.id,
      email: user.email,
      name: user.name,
      // Note: Keeping minimal actor data for demo response
      // Full context resolution happens server-side via the resolver
    },
    destination: destinationRoute,
  });

  applyAuthenticatedSessionCookies(response, {
    token,
    activeLeagueId: requestedLeagueId,
  });

  return response;
}

async function handleMagicLinkRequest(request: NextRequest, body: SessionPostBody) {
  const email = normalizeEmail(body.email);
  if (!email) {
    return apiError(400, "INVALID_REQUEST", "Enter a valid email address.");
  }

  await magicLinkAuthService.requestMagicLink({
    email,
    origin: request.nextUrl.origin,
    returnTo: normalizeReturnTo(normalizeOptionalString(body.returnTo)),
    requestedByIp: extractClientIpAddress(request),
    requestedByUserAgent: request.headers.get("user-agent")?.trim() ?? null,
  });

  return NextResponse.json(
    {
      ok: true,
      message: "If that email can sign in, a magic link is on the way.",
    },
    { status: 202 },
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get(AUTH_MAGIC_LINK_TOKEN_PARAM)?.trim() ?? "";
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get(RETURN_TO_PARAM));

  if (token.length === 0) {
    const invalidTokenError = new MagicLinkConsumeError("INVALID_MAGIC_LINK");
    return buildMagicLinkErrorRedirect(request, returnTo, invalidTokenError);
  }

  try {
    const consumedMagicLink = await magicLinkAuthService.consumeMagicLink({
      token,
      ipAddress: extractClientIpAddress(request),
      userAgent: request.headers.get("user-agent")?.trim() ?? null,
    });

    // Use new centralized resolver for context-aware routing
    const preferredLeagueId = parseLeagueIdFromReturnTo(returnTo) ?? readRequestedLeagueId(request);
    let destinationRoute: string;

    // If we have a valid returnTo that's not a league route, honor it
    if (returnTo && !returnTo.startsWith('/league/') && !returnTo.startsWith('/dashboard')) {
      // For non-league specific routes, use the resolver to determine active league context
      // but keep the requested route
      destinationRoute = returnTo;
    } else {
      // For default routing or league-specific routes, use full context resolution
      destinationRoute = await resolveQuickAuthenticatedRoute(
        consumedMagicLink.user.id,
        preferredLeagueId
      );
    }

    const response = NextResponse.redirect(new URL(destinationRoute, request.url));

    // Determine active league ID for session cookie
    let activeLeagueId: string | null = null;
    if (preferredLeagueId) {
      // Verify the user has access to the preferred league
      const memberships = await listSessionMemberships(consumedMagicLink.user.id);
      const hasAccess = memberships.some(m => m.leagueId === preferredLeagueId && hasReadyLeagueContext(m));
      if (hasAccess) {
        activeLeagueId = preferredLeagueId;
      }
    }

    applyAuthenticatedSessionCookies(response, {
      token: consumedMagicLink.sessionToken,
      activeLeagueId,
    });

    return response;
  } catch (error) {
    if (error instanceof MagicLinkConsumeError) {
      return buildMagicLinkErrorRedirect(request, returnTo, error);
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as SessionPostBody;

  if (body.mode === "demo") {
    return handleDemoIdentitySignIn(request, body);
  }

  return handleMagicLinkRequest(request, body);
}

export async function DELETE(request: NextRequest) {
  await revokeSessionFromRequest(request);

  const response = NextResponse.json({
    ok: true,
  });

  clearAuthenticationCookies(response);
  return response;
}
