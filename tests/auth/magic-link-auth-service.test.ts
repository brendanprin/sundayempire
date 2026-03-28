import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_MAGIC_LINK_TOKEN_PARAM, AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
import {
  MagicLinkConsumeError,
  createMagicLinkAuthService,
} from "@/lib/domain/auth/MagicLinkAuthService";
import { createAuthSessionService } from "@/lib/domain/auth/AuthSessionService";
import type { EmailDeliveryResult } from "@/lib/email/EmailDeliveryService";

type StoredUser = {
  id: string;
  email: string;
  name: string | null;
};

type StoredOwner = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
};

type StoredLeagueInvite = {
  id: string;
  leagueId: string;
  email: string;
  intendedRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  ownerId: string | null;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedByUserId: string | null;
};

type StoredMagicLink = {
  id: string;
  email: string;
  tokenHash: string;
  purpose: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  requestedByIp: string | null;
  requestedByUserAgent: string | null;
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

function capturedDeliveryResult(): EmailDeliveryResult {
  return {
    ok: true,
    summary: "captured",
    primaryChannel: "capture",
    errorCode: null,
    attempts: [
      {
        channel: "capture",
        status: "captured",
        ok: true,
        provider: null,
        messageId: null,
        errorCode: null,
      },
    ],
  };
}

function createInMemoryAuthClient(input: {
  users?: StoredUser[];
  owners?: StoredOwner[];
  leagueInvites?: StoredLeagueInvite[];
  magicLinks?: StoredMagicLink[];
  sessions?: StoredSession[];
} = {}) {
  const users = new Map((input.users ?? []).map((user) => [user.id, user]));
  const usersByEmail = new Map((input.users ?? []).map((user) => [user.email, user]));
  const owners = new Map((input.owners ?? []).map((owner) => [owner.id, owner]));
  const leagueInvites = new Map((input.leagueInvites ?? []).map((invite) => [invite.id, invite]));
  const magicLinks = new Map((input.magicLinks ?? []).map((magicLink) => [magicLink.id, magicLink]));
  const sessions = new Map((input.sessions ?? []).map((session) => [session.id, session]));
  let nextMagicLinkId = magicLinks.size + 1;
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
      async upsert(args: {
        where: { email: string };
        update: Record<string, never>;
        create: {
          email: string;
          name: string | null;
        };
        select: {
          id: true;
          email: true;
          name: true;
        };
      }) {
        const existing = usersByEmail.get(args.where.email);
        if (existing) {
          return existing;
        }

        const created: StoredUser = {
          id: `user-${users.size + 1}`,
          email: args.create.email,
          name: args.create.name,
        };

        users.set(created.id, created);
        usersByEmail.set(created.email, created);
        return created;
      },
    },
    leagueInvite: {
      async findFirst(args: {
        where: {
          email: string;
          acceptedAt: null;
          revokedAt: null;
          expiresAt: {
            gt: Date;
          };
        };
        orderBy: {
          createdAt: "desc";
        };
      }) {
        const entries = [...leagueInvites.values()]
          .filter(
            (invite) =>
              invite.email === args.where.email &&
              invite.acceptedAt === null &&
              invite.revokedAt === null &&
              invite.expiresAt.getTime() > args.where.expiresAt.gt.getTime(),
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

        const invite = entries[0] ?? null;
        if (!invite) {
          return null;
        }

        return {
          ...invite,
          league: {
            id: invite.leagueId,
            name: `League ${invite.leagueId}`,
          },
          team: invite.teamId
            ? {
                id: invite.teamId,
                name: `Team ${invite.teamId}`,
              }
            : null,
          owner: invite.ownerId ? owners.get(invite.ownerId) ?? null : null,
          invitedByUser: invite.invitedByUserId ? users.get(invite.invitedByUserId) ?? null : null,
        };
      },
    },
    authMagicLink: {
      async create(args: {
        data: {
          email: string;
          tokenHash: string;
          purpose: string;
          expiresAt: Date;
          requestedByIp?: string | null;
          requestedByUserAgent?: string | null;
        };
      }) {
        const magicLink: StoredMagicLink = {
          id: `magic-link-${nextMagicLinkId}`,
          email: args.data.email,
          tokenHash: args.data.tokenHash,
          purpose: args.data.purpose,
          createdAt: NOW,
          expiresAt: args.data.expiresAt,
          consumedAt: null,
          requestedByIp: args.data.requestedByIp ?? null,
          requestedByUserAgent: args.data.requestedByUserAgent ?? null,
        };

        nextMagicLinkId += 1;
        magicLinks.set(magicLink.id, magicLink);
        return magicLink;
      },
      async findUnique(args: { where: { id: string } }) {
        return magicLinks.get(args.where.id) ?? null;
      },
      async findFirst(args: {
        where: {
          email: string;
          consumedAt: null;
          expiresAt: {
            gt: Date;
          };
        };
        orderBy: {
          createdAt: "desc";
        };
      }) {
        const entries = [...magicLinks.values()]
          .filter(
            (entry) =>
              entry.email === args.where.email &&
              entry.consumedAt === null &&
              entry.expiresAt.getTime() > args.where.expiresAt.gt.getTime(),
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

        return entries[0] ?? null;
      },
      async updateMany(args: {
        where: {
          id: string;
          consumedAt: null;
        };
        data: {
          consumedAt: Date;
        };
      }) {
        const existing = magicLinks.get(args.where.id);
        if (!existing || existing.consumedAt !== null) {
          return { count: 0 };
        }

        magicLinks.set(existing.id, {
          ...existing,
          consumedAt: args.data.consumedAt,
        });

        return { count: 1 };
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
        users,
        leagueInvites,
        magicLinks,
        sessions,
      };
    },
  };
}

function createRequest(input: {
  sessionToken?: string | null;
} = {}) {
  const cookieMap = new Map<string, string>();

  if (input.sessionToken) {
    cookieMap.set(AUTH_SESSION_COOKIE, input.sessionToken);
  }

  return {
    headers: {
      get() {
        return null;
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

test("requestMagicLink stores a hashed token record and captures a one-time URL", async () => {
  const user = {
    id: "user-1",
    email: "commissioner@local.league",
    name: "Commissioner",
  };
  const deliveries: Array<{ email: string; magicLinkUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const service = createMagicLinkAuthService(client as never, {
    now: () => NOW,
    tokenFactory: () => "opaque-magic-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });

  const result = await service.requestMagicLink({
    email: user.email,
    origin: "http://127.0.0.1:3000",
    returnTo: "/trades",
    requestedByIp: "127.0.0.1",
    requestedByUserAgent: "Playwright",
  });

  const storedMagicLink = client.inspect().magicLinks.get("magic-link-1");
  assert.equal(result.accepted, true);
  assert.equal(result.created, true);
  assert.equal(result.delivery?.summary, "captured");
  assert.equal(deliveries.length, 1);
  assert.ok(storedMagicLink);
  assert.notEqual(storedMagicLink?.tokenHash, deliveries[0]?.magicLinkUrl);
  assert.equal(storedMagicLink?.requestedByIp, "127.0.0.1");
  assert.equal(storedMagicLink?.requestedByUserAgent, "Playwright");

  const magicLinkUrl = new URL(deliveries[0].magicLinkUrl);
  assert.equal(magicLinkUrl.pathname, "/api/auth/session");
  assert.equal(magicLinkUrl.searchParams.get(AUTH_MAGIC_LINK_TOKEN_PARAM)?.startsWith("magic-link-1."), true);
  assert.equal(magicLinkUrl.searchParams.get("returnTo"), "/trades");
});

test("consumeMagicLink creates a durable session for a valid token", async () => {
  const user = {
    id: "user-2",
    email: "owner01@local.league",
    name: "Owner 01",
  };
  const deliveries: Array<{ email: string; magicLinkUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const service = createMagicLinkAuthService(client as never, {
    now: () => NOW,
    tokenFactory: () => "magic-secret",
    sessionTokenFactory: () => "session-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });

  await service.requestMagicLink({
    email: user.email,
    origin: "http://127.0.0.1:3000",
  });

  const token = new URL(deliveries[0].magicLinkUrl).searchParams.get(AUTH_MAGIC_LINK_TOKEN_PARAM);
  assert.ok(token);

  const result = await service.consumeMagicLink({
    token: token ?? "",
    ipAddress: "127.0.0.1",
    userAgent: "Playwright",
  });

  assert.equal(result.user.id, user.id);
  assert.ok(result.sessionToken.startsWith("session-1."));
  assert.equal(client.inspect().magicLinks.get("magic-link-1")?.consumedAt?.toISOString(), NOW.toISOString());
  assert.equal(client.inspect().sessions.get("session-1")?.ipAddress, "127.0.0.1");
  assert.equal(client.inspect().sessions.get("session-1")?.userAgent, "Playwright");
});

test("consumeMagicLink rejects expired tokens", async () => {
  const user = {
    id: "user-3",
    email: "readonly@local.league",
    name: "Observer",
  };
  const client = createInMemoryAuthClient({
    users: [user],
    magicLinks: [
      {
        id: "magic-link-1",
        email: user.email,
        tokenHash:
          "46d710d89c454f186f0e173f95e4ad6d48871356e684af00ef80f4b50042ab52",
        purpose: "SIGN_IN",
        createdAt: NOW,
        expiresAt: new Date("2026-03-27T11:59:00.000Z"),
        consumedAt: null,
        requestedByIp: null,
        requestedByUserAgent: null,
      },
    ],
  });
  const service = createMagicLinkAuthService(client as never, {
    now: () => NOW,
  });

  await assert.rejects(
    () => service.consumeMagicLink({ token: "magic-link-1.anything" }),
    (error: unknown) =>
      error instanceof MagicLinkConsumeError && error.code === "EXPIRED_MAGIC_LINK",
  );
});

test("consumeMagicLink rejects already-consumed tokens", async () => {
  const user = {
    id: "user-4",
    email: "commissioner@local.league",
    name: "Commissioner",
  };
  const client = createInMemoryAuthClient({
    users: [user],
    magicLinks: [
      {
        id: "magic-link-1",
        email: user.email,
        tokenHash:
          "46d710d89c454f186f0e173f95e4ad6d48871356e684af00ef80f4b50042ab52",
        purpose: "SIGN_IN",
        createdAt: NOW,
        expiresAt: new Date("2026-03-27T12:30:00.000Z"),
        consumedAt: NOW,
        requestedByIp: null,
        requestedByUserAgent: null,
      },
    ],
  });
  const service = createMagicLinkAuthService(client as never, {
    now: () => NOW,
  });

  await assert.rejects(
    () => service.consumeMagicLink({ token: "magic-link-1.anything" }),
    (error: unknown) =>
      error instanceof MagicLinkConsumeError && error.code === "CONSUMED_MAGIC_LINK",
  );
});

test("consumeMagicLink rejects invalid tokens", async () => {
  const user = {
    id: "user-5",
    email: "owner02@local.league",
    name: "Owner 02",
  };
  const deliveries: Array<{ email: string; magicLinkUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const service = createMagicLinkAuthService(client as never, {
    now: () => NOW,
    tokenFactory: () => "magic-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });

  await service.requestMagicLink({
    email: user.email,
    origin: "http://127.0.0.1:3000",
  });

  const token = new URL(deliveries[0].magicLinkUrl).searchParams.get(AUTH_MAGIC_LINK_TOKEN_PARAM);
  assert.ok(token);

  const [recordId] = (token ?? "").split(".");
  await assert.rejects(
    () => service.consumeMagicLink({ token: `${recordId}.wrong-secret` }),
    (error: unknown) =>
      error instanceof MagicLinkConsumeError && error.code === "INVALID_MAGIC_LINK",
  );
});

test("pending invite emails can request and consume magic links before league acceptance", async () => {
  const deliveries: Array<{ email: string; magicLinkUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryAuthClient({
    owners: [
      {
        id: "owner-1",
        name: "Invited Owner",
        email: "invited-owner@example.test",
        userId: null,
      },
    ],
    leagueInvites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "invited-owner@example.test",
        intendedRole: "MEMBER",
        teamId: "team-1",
        ownerId: "owner-1",
        tokenHash: "unused",
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createMagicLinkAuthService(client as never, {
    now: () => NOW,
    tokenFactory: () => "invited-magic-secret",
    sessionTokenFactory: () => "invited-session-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });

  const requestResult = await service.requestMagicLink({
    email: "Invited-Owner@example.test",
    origin: "http://127.0.0.1:3000",
  });

  assert.equal(requestResult.created, true);
  assert.equal(requestResult.delivery?.summary, "captured");
  assert.equal(deliveries.length, 1);

  const token = new URL(deliveries[0].magicLinkUrl).searchParams.get(AUTH_MAGIC_LINK_TOKEN_PARAM);
  assert.ok(token);

  const consumed = await service.consumeMagicLink({
    token: token ?? "",
  });

  assert.equal(consumed.user.email, "invited-owner@example.test");
  assert.equal(consumed.user.name, "Invited Owner");
  assert.ok(client.inspect().users.get(consumed.user.id));
  assert.ok(consumed.sessionToken.startsWith("session-1."));
});

test("sign-out revokes the session created from a consumed magic link", async () => {
  const user = {
    id: "user-6",
    email: "commissioner@local.league",
    name: "Commissioner",
  };
  const deliveries: Array<{ email: string; magicLinkUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryAuthClient({
    users: [user],
  });
  const magicLinkService = createMagicLinkAuthService(client as never, {
    now: () => NOW,
    tokenFactory: () => "magic-secret",
    sessionTokenFactory: () => "session-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });
  const sessionService = createAuthSessionService(client as never, {
    allowLegacyIdentity: false,
    now: () => NOW,
  });

  await magicLinkService.requestMagicLink({
    email: user.email,
    origin: "http://127.0.0.1:3000",
  });

  const token = new URL(deliveries[0].magicLinkUrl).searchParams.get(AUTH_MAGIC_LINK_TOKEN_PARAM);
  assert.ok(token);

  const consumed = await magicLinkService.consumeMagicLink({
    token: token ?? "",
  });

  assert.equal(
    await sessionService.revokeSessionFromRequest(
      createRequest({
        sessionToken: consumed.sessionToken,
      }),
    ),
    true,
  );
  assert.equal(client.inspect().sessions.get("session-1")?.revokedAt?.toISOString(), NOW.toISOString());
  assert.equal(await sessionService.getSessionFromToken(consumed.sessionToken), null);
});
