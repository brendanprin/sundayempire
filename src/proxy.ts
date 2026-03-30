import { NextRequest, NextResponse } from "next/server";
import { AUTH_EMAIL_COOKIE, AUTH_SESSION_COOKIE, HEADER_EMAIL, isLegacyAuthCompatibilityEnabled } from "@/lib/auth-constants";
import {
  LOGIN_ERROR_PARAM,
  LOGIN_ERROR_SESSION_EXPIRED,
  RETURN_TO_PARAM,
  SWITCH_SESSION_PARAM,
  normalizeReturnTo,
} from "@/lib/return-to";
import { createAuthSessionService } from "@/lib/domain/auth/AuthSessionService";
import { prisma } from "@/lib/prisma";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasDurableSession = Boolean(request.cookies.get(AUTH_SESSION_COOKIE)?.value?.trim());
  const allowLegacyIdentity = isLegacyAuthCompatibilityEnabled();
  const hasLegacyHeaderIdentity = allowLegacyIdentity && Boolean(request.headers.get(HEADER_EMAIL)?.trim());
  const hasLegacyCookieIdentity = allowLegacyIdentity && Boolean(request.cookies.get(AUTH_EMAIL_COOKIE)?.value?.trim());

  // For route decisions, we need to validate sessions properly to avoid bouncing through
  // protected pages with expired credentials
  const hasValidSession = await validateSessionCredentials(request, {
    hasDurableSession,
    hasLegacyHeaderIdentity,
    hasLegacyCookieIdentity,
    allowLegacyIdentity,
  });

  // Legacy fallback: assume session presence indicates authentication if validation fails
  const hasSession = hasValidSession ?? (hasDurableSession || hasLegacyHeaderIdentity || hasLegacyCookieIdentity);

  if (pathname === "/invite") {
    return NextResponse.next();
  }

  if (pathname === "/") {
    // Redirect authenticated users away from landing page to their appropriate destination
    if (hasSession) {
      return NextResponse.redirect(new URL("/my-leagues", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (!hasSession) {
      return NextResponse.next();
    }

    const switchRequested = request.nextUrl.searchParams.get(SWITCH_SESSION_PARAM) === "1";
    const sessionExpired = request.nextUrl.searchParams.get(LOGIN_ERROR_PARAM) === LOGIN_ERROR_SESSION_EXPIRED;
    if (switchRequested || sessionExpired) {
      return NextResponse.next();
    }

    const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get(RETURN_TO_PARAM)) ?? "/my-leagues";
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = normalizeReturnTo(`${pathname}${search}`) ?? "/my-leagues";
    loginUrl.searchParams.set(RETURN_TO_PARAM, returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Validates session credentials to ensure they are not expired or revoked.
 * Returns true if valid, false if invalid/expired, null if validation fails.
 */
async function validateSessionCredentials(
  request: NextRequest,
  credentials: {
    hasDurableSession: boolean;
    hasLegacyHeaderIdentity: boolean;
    hasLegacyCookieIdentity: boolean;
    allowLegacyIdentity: boolean;
  }
): Promise<boolean | null> {
  try {
    const authService = createAuthSessionService(prisma);
    
    // Check durable session token if present
    if (credentials.hasDurableSession) {
      const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value?.trim();
      if (sessionToken) {
        const session = await authService.getSessionFromToken(sessionToken);
        return session !== null;
      }
    }
    
    // Check legacy authentication if enabled
    if (credentials.allowLegacyIdentity) {
      const headerEmail = request.headers.get(HEADER_EMAIL)?.trim().toLowerCase();
      const cookieEmail = request.cookies.get(AUTH_EMAIL_COOKIE)?.value?.trim().toLowerCase();
      const legacyEmail = headerEmail || cookieEmail;
      
      if (legacyEmail) {
        // Verify the user exists for legacy auth
        const user = await prisma.user.findUnique({
          where: { email: legacyEmail },
          select: { id: true },
        });
        return user !== null;
      }
    }
    
    return false;
  } catch (error) {
    // If session validation fails (e.g., DB unavailable), fall back to presence check
    // This prevents complete access denial due to transient issues
    console.warn('[proxy] Session validation failed:', error);
    return null;
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
