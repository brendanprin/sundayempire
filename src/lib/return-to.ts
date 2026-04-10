import { AUTH_INVITE_TOKEN_PARAM, AUTH_PLATFORM_INVITE_TOKEN_PARAM } from "@/lib/auth-constants";

export const RETURN_TO_PARAM = "returnTo";
export const SWITCH_SESSION_PARAM = "switch";
export const LOGIN_ERROR_PARAM = "error";
export const LOGIN_ERROR_MAGIC_LINK_INVALID = "magic_link_invalid";
export const LOGIN_ERROR_MAGIC_LINK_EXPIRED = "magic_link_expired";
export const LOGIN_ERROR_MAGIC_LINK_USED = "magic_link_used";
export const LOGIN_ERROR_USER_NOT_FOUND = "user_not_found";
export const LOGIN_ERROR_SESSION_EXPIRED = "session_expired";

export function normalizeReturnTo(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  if (trimmed.startsWith("/login")) {
    return null;
  }

  return trimmed;
}

export function parseLeagueIdFromReturnTo(returnTo: string | null | undefined): string | null {
  const normalized = normalizeReturnTo(returnTo);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^\/league\/([^/?#]+)/);
  if (!match) {
    return null;
  }

  const decoded = decodeURIComponent(match[1] ?? "").trim();
  return decoded.length > 0 ? decoded : null;
}

export function buildReturnToPath(pathname: string, search?: string) {
  const query = search && search.length > 0 ? search : "";
  return normalizeReturnTo(`${pathname}${query}`) ?? "/";
}

export function isInviteReturnTo(value: string | null | undefined) {
  const normalized = normalizeReturnTo(value);
  return normalized?.startsWith("/invite") ?? false;
}

export function buildInvitePath(input: {
  token: string;
  returnTo?: string | null;
}) {
  const params = new URLSearchParams({
    [AUTH_INVITE_TOKEN_PARAM]: input.token,
  });
  const normalizedReturnTo = normalizeReturnTo(input.returnTo ?? null);
  if (normalizedReturnTo) {
    params.set(RETURN_TO_PARAM, normalizedReturnTo);
  }

  return `/invite?${params.toString()}`;
}

export function buildJoinPath(input: {
  token: string;
}) {
  const params = new URLSearchParams({
    [AUTH_PLATFORM_INVITE_TOKEN_PARAM]: input.token,
  });
  return `/join?${params.toString()}`;
}

export function buildLoginPath(input: {
  returnTo?: string | null;
  switchSession?: boolean;
  error?: string | null;
}) {
  const params = new URLSearchParams();
  const normalized = normalizeReturnTo(input.returnTo ?? null);
  if (normalized) {
    params.set(RETURN_TO_PARAM, normalized);
  }
  if (input.switchSession) {
    params.set(SWITCH_SESSION_PARAM, "1");
  }
  if (input.error?.trim()) {
    params.set(LOGIN_ERROR_PARAM, input.error.trim());
  }

  const query = params.toString();
  return query.length > 0 ? `/login?${query}` : "/login";
}

export function buildDevLoginPath(input: {
  returnTo?: string | null;
  switchSession?: boolean;
  error?: string | null;
}) {
  const params = new URLSearchParams();
  const normalized = normalizeReturnTo(input.returnTo ?? null);
  if (normalized) {
    params.set(RETURN_TO_PARAM, normalized);
  }
  if (input.switchSession) {
    params.set(SWITCH_SESSION_PARAM, "1");
  }
  if (input.error?.trim()) {
    params.set(LOGIN_ERROR_PARAM, input.error.trim());
  }

  const query = params.toString();
  return query.length > 0 ? `/dev/login?${query}` : "/dev/login";
}
