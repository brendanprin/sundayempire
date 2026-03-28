import { PlatformRole, Prisma, PrismaClient } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import {
  AUTH_EMAIL_COOKIE,
  AUTH_SESSION_COOKIE,
  HEADER_EMAIL,
  isLegacyAuthCompatibilityEnabled,
} from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";
import {
  createSessionRepository,
  type AuthSessionRecord,
  type CreateAuthSessionInput as RepositoryCreateAuthSessionInput,
} from "./SessionRepository";
import {
  buildOpaqueToken,
  hashOpaqueTokenSecret,
  opaqueTokenHashesEqual,
  parseOpaqueToken,
} from "./token-utils";

type AuthDbClient = PrismaClient | Prisma.TransactionClient;

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  platformRole: PlatformRole;
};

export type AuthenticatedSession = {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  user: AuthenticatedUser;
};

type HeaderStore = {
  get(name: string): string | null;
};

type CookieStore = {
  get(name: string): { value: string } | undefined;
};

export type AuthRequestLike = {
  headers: HeaderStore;
  cookies: CookieStore;
};

export type AuthenticatedRequestContext = {
  source: "session" | "legacy_compat";
  user: AuthenticatedUser;
  session: AuthenticatedSession | null;
};

export type AuthSessionServiceOptions = {
  allowLegacyIdentity?: boolean;
  now?: () => Date;
  tokenFactory?: () => string;
  touchIntervalMs?: number;
};

export type CreateAuthSessionInput = Omit<RepositoryCreateAuthSessionInput, "tokenHash">;

export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "AuthRequiredError";
  }
}

const DEFAULT_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  name: string | null;
  platformRole: PlatformRole;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
  };
}

function toAuthenticatedSession(record: AuthSessionRecord): AuthenticatedSession {
  return {
    id: record.id,
    userId: record.userId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    userAgent: record.userAgent,
    ipAddress: record.ipAddress,
    user: toAuthenticatedUser(record.user),
  };
}

async function loadRequestLike(request?: AuthRequestLike): Promise<AuthRequestLike | null> {
  if (request) {
    return request;
  }

  try {
    const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
    return {
      headers: headerStore,
      cookies: cookieStore,
    };
  } catch {
    return null;
  }
}

function readSessionToken(request: AuthRequestLike | null) {
  return request?.cookies.get(AUTH_SESSION_COOKIE)?.value?.trim() ?? null;
}

function readLegacyCompatibleEmail(request: AuthRequestLike | null, allowLegacyIdentity: boolean) {
  if (!allowLegacyIdentity || !request) {
    return null;
  }

  // Temporary bridge for seeded demo identities until the interactive auth cutover lands.
  const headerEmail = request.headers.get(HEADER_EMAIL)?.trim().toLowerCase();
  if (headerEmail) {
    return headerEmail;
  }

  const cookieEmail = request.cookies.get(AUTH_EMAIL_COOKIE)?.value?.trim().toLowerCase();
  if (cookieEmail) {
    return cookieEmail;
  }

  return null;
}

function shouldTouchSession(
  session: AuthenticatedSession,
  currentTime: Date,
  touchIntervalMs: number,
) {
  if (!session.lastUsedAt) {
    return true;
  }

  return currentTime.getTime() - session.lastUsedAt.getTime() >= touchIntervalMs;
}

export function createAuthSessionService(
  client: AuthDbClient = prisma,
  options: AuthSessionServiceOptions = {},
) {
  const sessionRepository = createSessionRepository(client);
  const allowLegacyIdentity = options.allowLegacyIdentity ?? isLegacyAuthCompatibilityEnabled();
  const now = options.now ?? (() => new Date());
  const tokenFactory = options.tokenFactory ?? (() => randomBytes(32).toString("base64url"));
  const touchIntervalMs = options.touchIntervalMs ?? DEFAULT_TOUCH_INTERVAL_MS;

  async function createSession(input: CreateAuthSessionInput) {
    const secret = tokenFactory().trim();
    if (secret.length === 0) {
      throw new Error("Session token secret must not be empty.");
    }

    const record = await sessionRepository.create({
      ...input,
      tokenHash: hashOpaqueTokenSecret(secret),
    });

    return {
      session: toAuthenticatedSession(record),
      token: buildOpaqueToken(record.id, secret),
    };
  }

  async function getSessionFromToken(token: string) {
    const parsedToken = parseOpaqueToken(token);
    if (!parsedToken) {
      return null;
    }

    const record = await sessionRepository.findById(parsedToken.recordId);
    if (!record) {
      return null;
    }

    const session = toAuthenticatedSession(record);
    const currentTime = now();

    if (session.revokedAt || session.expiresAt.getTime() <= currentTime.getTime()) {
      return null;
    }

    const tokenHash = hashOpaqueTokenSecret(parsedToken.secret);
    if (!opaqueTokenHashesEqual(record.tokenHash, tokenHash)) {
      return null;
    }

    if (!shouldTouchSession(session, currentTime, touchIntervalMs)) {
      return session;
    }

    const touchedRecord = await sessionRepository.touch(session.id, currentTime);
    return toAuthenticatedSession(touchedRecord);
  }

  async function getSessionFromRequest(request?: AuthRequestLike) {
    const requestLike = await loadRequestLike(request);
    const sessionToken = readSessionToken(requestLike);

    if (!sessionToken) {
      return null;
    }

    return getSessionFromToken(sessionToken);
  }

  async function revokeSessionToken(token: string) {
    const parsedToken = parseOpaqueToken(token);
    if (!parsedToken) {
      return false;
    }

    const record = await sessionRepository.findById(parsedToken.recordId);
    if (!record) {
      return false;
    }

    const tokenHash = hashOpaqueTokenSecret(parsedToken.secret);
    if (!opaqueTokenHashesEqual(record.tokenHash, tokenHash)) {
      return false;
    }

    await sessionRepository.revoke(record.id, now());
    return true;
  }

  async function revokeSessionFromRequest(request?: AuthRequestLike) {
    const requestLike = await loadRequestLike(request);
    const sessionToken = readSessionToken(requestLike);

    if (!sessionToken) {
      return false;
    }

    return revokeSessionToken(sessionToken);
  }

  async function getAuthenticatedRequestContext(
    request?: AuthRequestLike,
  ): Promise<AuthenticatedRequestContext | null> {
    const requestLike = await loadRequestLike(request);
    const session = requestLike ? await getSessionFromRequest(requestLike) : null;

    if (session) {
      return {
        source: "session",
        user: session.user,
        session,
      };
    }

    const compatibleEmail = readLegacyCompatibleEmail(requestLike, allowLegacyIdentity);
    if (!compatibleEmail) {
      return null;
    }

    const user = await client.user.findUnique({
      where: { email: compatibleEmail },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      source: "legacy_compat",
      user: toAuthenticatedUser(user),
      session: null,
    };
  }

  async function getAuthenticatedUser(request?: AuthRequestLike) {
    return (await getAuthenticatedRequestContext(request))?.user ?? null;
  }

  async function requireAuthenticatedUser(request?: AuthRequestLike) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new AuthRequiredError();
    }

    return user;
  }

  return {
    createSession,
    getSessionFromToken,
    getSessionFromRequest,
    revokeSessionToken,
    revokeSessionFromRequest,
    getAuthenticatedRequestContext,
    getAuthenticatedUser,
    requireAuthenticatedUser,
  };
}
