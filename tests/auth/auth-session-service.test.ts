import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_EMAIL_COOKIE, AUTH_SESSION_COOKIE, HEADER_EMAIL } from "@/lib/auth-constants";
import { AuthRequiredError, createAuthSessionService } from "@/lib/domain/auth/AuthSessionService";

type StoredUser = {
  id: string;
  email: string;
  name: string | null;
  platformRole: "ADMIN" | "USER";
};

type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
};

const NOW = new Date("2026-03-27T12:00:00.000Z");

function createInMemoryAuthClient(input: {
  users?: StoredUser[];
  sessions?: StoredSession[];
} = {}) {
  const users = new Map((input.users ?? []).map((user) => [user.id, user]));
  const usersByEmail = new Map((input.users ?? []).map((user) => [user.email, user]));
  const sessions = new Map((input.sessions ?? []).map((session) => [session.id, session]));
  let nextSessionId = sessions.size + 1;

  return {
    user: {
      async findUnique(args: { where: { id?: string; email?: string } }) {
        if (args.where.id) {
          return users.get(args.where.id) ?? null;
        }

        if (args.where.email) {
          return usersByEmail.get(args.where.email) ?? null;
        }

        return null;
      },
    },
    authSession: {
      async create(args: {
        data: {
          userId: string;
          tokenHash: string;
          expiresAt: Date;
          userAgent?: string | null;
          ipAddress?: string | null;
        };
      }) {
        const user = users.get(args.data.userId);
        if (!user) {
          throw new Error("Expected a seeded user.");
        }

        const session: StoredSession = {
          id: `session-${nextSessionId}`,
          userId: args.data.userId,
          tokenHash: args.data.tokenHash,
          createdAt: NOW,
          expiresAt: args.data.expiresAt,
          revokedAt: null,
          lastUsedAt: null,
          userAgent: args.data.userAgent ?? null,
          ipAddress: args.data.ipAddress ?? null,
        };

        nextSessionId += 1;
        sessions.set(session.id, session);

        return {
          ...session,
          user,
        };
      },
      async findUnique(args: { where: { id: string } }) {
        const session = sessions.get(args.where.id);
        if (!session) {
          return null;
        }

        const user = users.get(session.userId);
        if (!user) {
          return null;
        }

        return {
          ...session,
          user,
        };
      },
      async update(args: {
        where: { id: string };
        data: {
          lastUsedAt?: Date;
          revokedAt?: Date;
        };
      }) {
        const existing = sessions.get(args.where.id);
        if (!existing) {
          throw new Error("Expected an existing session.");
        }

        const updated: StoredSession = {
          ...existing,
          lastUsedAt: args.data.lastUsedAt ?? existing.lastUsedAt,
          revokedAt: args.data.revokedAt ?? existing.revokedAt,
        };

        const user = users.get(updated.userId);
        if (!user) {
          throw new Error("Expected a seeded user.");
        }

        sessions.set(updated.id, updated);

        return {
          ...updated,
          user,
        };
      },
    },
    inspect() {
      return {
        sessions,
      };
    },
  };
}

function createRequest(input: {
  sessionToken?: string | null;
  legacyEmailHeader?: string | null;
  legacyEmailCookie?: string | null;
} = {}) {
  const headerMap = new Map<string, string>();
  const cookieMap = new Map<string, string>();

  if (input.sessionToken) {
    cookieMap.set(AUTH_SESSION_COOKIE, input.sessionToken);
  }

  if (input.legacyEmailHeader) {
    headerMap.set(HEADER_EMAIL, input.legacyEmailHeader);
  }

  if (input.legacyEmailCookie) {
    cookieMap.set(AUTH_EMAIL_COOKIE, input.legacyEmailCookie);
  }

  return {
    headers: {
      get(name: string) {
        return headerMap.get(name) ?? null;
      },
    },
    cookies: {
      get(name: string) {
        const value = cookieMap.get(name);
        return value ? { value } : undefined;
      },
    },
  };
}

test("session creation stores a hashed token and resolves from the request cookie", async () => {
  const user = {
    id: "user-1",
    email: "commissioner@local.league",
    name: "Commissioner",
    platformRole: "USER" as const,
  };
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const service = createAuthSessionService(client as never, {
    allowLegacyIdentity: false,
    now: () => NOW,
    tokenFactory: () => "opaque-session-secret",
    touchIntervalMs: 0,
  });

  const { session, token } = await service.createSession({
    userId: user.id,
    expiresAt: new Date("2026-04-26T12:00:00.000Z"),
    userAgent: "Playwright",
    ipAddress: "127.0.0.1",
  });

  const storedSession = client.inspect().sessions.get(session.id);
  assert.ok(storedSession);
  assert.ok(token.startsWith(`${session.id}.`));
  assert.notEqual(storedSession?.tokenHash, token);
  assert.equal(storedSession?.userAgent, "Playwright");
  assert.equal(storedSession?.ipAddress, "127.0.0.1");

  const resolvedSession = await service.getSessionFromRequest(
    createRequest({
      sessionToken: token,
    }),
  );

  assert.ok(resolvedSession);
  assert.equal(resolvedSession?.user.id, user.id);
  assert.equal(resolvedSession?.lastUsedAt?.toISOString(), NOW.toISOString());
});

test("session lookup rejects expired and revoked sessions", async () => {
  const user = {
    id: "user-2",
    email: "owner01@local.league",
    name: "Owner 01",
    platformRole: "USER" as const,
  };
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const service = createAuthSessionService(client as never, {
    allowLegacyIdentity: false,
    now: () => NOW,
    tokenFactory: () => "session-secret",
  });

  const expired = await service.createSession({
    userId: user.id,
    expiresAt: new Date("2026-03-26T12:00:00.000Z"),
  });
  const revoked = await service.createSession({
    userId: user.id,
    expiresAt: new Date("2026-04-26T12:00:00.000Z"),
  });

  const revokedSession = client.inspect().sessions.get(revoked.session.id);
  assert.ok(revokedSession);
  revokedSession!.revokedAt = NOW;

  assert.equal(await service.getSessionFromToken(expired.token), null);
  assert.equal(await service.getSessionFromToken(revoked.token), null);
});

test("revokeSessionToken marks the durable session as revoked", async () => {
  const user = {
    id: "user-3",
    email: "readonly@local.league",
    name: "League Observer",
    platformRole: "USER" as const,
  };
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const service = createAuthSessionService(client as never, {
    allowLegacyIdentity: false,
    now: () => NOW,
    tokenFactory: () => "revoke-secret",
  });

  const { session, token } = await service.createSession({
    userId: user.id,
    expiresAt: new Date("2026-04-26T12:00:00.000Z"),
  });

  assert.equal(await service.revokeSessionToken(token), true);
  assert.equal(client.inspect().sessions.get(session.id)?.revokedAt?.toISOString(), NOW.toISOString());
  assert.equal(await service.getSessionFromToken(token), null);
});

test("authenticated user resolution prefers the durable session over compatibility credentials", async () => {
  const sessionUser = {
    id: "user-4",
    email: "commissioner@local.league",
    name: "Commissioner",
    platformRole: "USER" as const,
  };
  const compatUser = {
    id: "user-5",
    email: "owner01@local.league",
    name: "Owner 01",
    platformRole: "USER" as const,
  };
  const client = createInMemoryAuthClient({
    users: [sessionUser, compatUser],
  });
  const service = createAuthSessionService(client as never, {
    allowLegacyIdentity: true,
    now: () => NOW,
    tokenFactory: () => "preferred-session-secret",
  });
  const { token } = await service.createSession({
    userId: sessionUser.id,
    expiresAt: new Date("2026-04-26T12:00:00.000Z"),
  });

  const authenticatedUser = await service.getAuthenticatedUser(
    createRequest({
      sessionToken: token,
      legacyEmailHeader: compatUser.email,
    }),
  );

  assert.equal(authenticatedUser?.id, sessionUser.id);
  await assert.rejects(
    () => service.requireAuthenticatedUser(createRequest()),
    (error: unknown) => error instanceof AuthRequiredError,
  );
});

test("authenticated user resolution falls back to compatibility headers and cookies only when enabled", async () => {
  const user = {
    id: "user-6",
    email: "commissioner@local.league",
    name: "Commissioner",
    platformRole: "USER" as const,
  };
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const compatEnabledService = createAuthSessionService(client as never, {
    allowLegacyIdentity: true,
    now: () => NOW,
  });
  const compatDisabledService = createAuthSessionService(client as never, {
    allowLegacyIdentity: false,
    now: () => NOW,
  });

  const headerUser = await compatEnabledService.getAuthenticatedUser(
    createRequest({
      legacyEmailHeader: user.email,
    }),
  );
  const cookieUser = await compatEnabledService.getAuthenticatedUser(
    createRequest({
      legacyEmailCookie: user.email,
    }),
  );
  const disabledUser = await compatDisabledService.getAuthenticatedUser(
    createRequest({
      legacyEmailHeader: user.email,
    }),
  );

  assert.equal(headerUser?.id, user.id);
  assert.equal(cookieUser?.id, user.id);
  assert.equal(disabledUser, null);
});
