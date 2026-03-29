import { NextRequest, NextResponse } from "next/server";
import { AUTH_EMAIL_COOKIE, AUTH_SESSION_COOKIE, HEADER_EMAIL, isLegacyAuthCompatibilityEnabled } from "@/lib/auth-constants";
import {
  LOGIN_ERROR_PARAM,
  LOGIN_ERROR_SESSION_EXPIRED,
  RETURN_TO_PARAM,
  SWITCH_SESSION_PARAM,
  normalizeReturnTo,
} from "@/lib/return-to";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasDurableSession = Boolean(request.cookies.get(AUTH_SESSION_COOKIE)?.value?.trim());
  const allowLegacyIdentity = isLegacyAuthCompatibilityEnabled();
  const hasLegacyHeaderIdentity = allowLegacyIdentity && Boolean(request.headers.get(HEADER_EMAIL)?.trim());
  const hasLegacyCookieIdentity = allowLegacyIdentity && Boolean(request.cookies.get(AUTH_EMAIL_COOKIE)?.value?.trim());

  // Route-level authorization now happens against the server-side session record.
  // The proxy only checks whether a session credential is present so page routing stays lightweight.
  const hasSession = hasDurableSession || hasLegacyHeaderIdentity || hasLegacyCookieIdentity;

  if (pathname === "/invite") {
    return NextResponse.next();
  }

  if (pathname === "/") {
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

    const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get(RETURN_TO_PARAM)) ?? "/dashboard";
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = normalizeReturnTo(`${pathname}${search}`) ?? "/dashboard";
    loginUrl.searchParams.set(RETURN_TO_PARAM, returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
