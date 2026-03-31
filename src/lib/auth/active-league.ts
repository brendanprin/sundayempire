import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_LEAGUE_COOKIE, AUTH_SESSION_MAX_AGE_SECONDS } from "@/lib/auth-constants";

/**
 * Single source of truth for ACTIVE_LEAGUE_COOKIE read/write.
 * All routes that need to set or read the active league must go through here.
 */

const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
};

export function setActiveLeagueCookie(response: NextResponse, leagueId: string): void {
  response.cookies.set(ACTIVE_LEAGUE_COOKIE, leagueId, COOKIE_OPTIONS);
}

export function clearActiveLeagueCookie(response: NextResponse): void {
  response.cookies.delete(ACTIVE_LEAGUE_COOKIE);
}

export function getActiveLeagueCookie(request: NextRequest): string | null {
  return request.cookies.get(ACTIVE_LEAGUE_COOKIE)?.value?.trim() || null;
}
