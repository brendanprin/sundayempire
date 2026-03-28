import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_INVITE_TOKEN_PARAM } from "@/lib/auth-constants";
import {
  createLeagueInviteService,
  LeagueInviteAcceptanceError,
  LeagueInviteManagementError,
} from "@/lib/domain/auth/LeagueInviteService";
import { hashOpaqueTokenSecret } from "@/lib/domain/auth/token-utils";
import type { EmailDeliveryResult } from "@/lib/email/EmailDeliveryService";

type StoredLeague = {
  id: string;
  name: string;
};

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

type StoredTeam = {
  id: string;
  leagueId: string;
  ownerId: string | null;
  name: string;
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
  lastDeliveryAttemptedAt?: Date | null;
  lastDeliveryState?: "SENT" | "CAPTURED" | "LOGGED" | "FAILED" | "NOT_CONFIGURED" | null;
  lastDeliveryErrorCode?: string | null;
};

type StoredLeagueMembership = {
  id: string;
  userId: string;
  leagueId: string;
  role: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  createdAt?: Date;
};

type StoredTeamMembership = {
  id: string;
  teamId: string;
  userId: string;
  membershipType: "PRIMARY_MANAGER" | "CO_MANAGER";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const NOW = new Date("2026-03-27T12:00:00.000Z");
const ANYTHING_TOKEN_HASH = hashOpaqueTokenSecret("anything");

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

function failedDeliveryResult(errorCode = "RESEND_503"): EmailDeliveryResult {
  return {
    ok: false,
    summary: "failed",
    primaryChannel: "provider",
    errorCode,
    attempts: [
      {
        channel: "provider",
        status: "failed",
        ok: false,
        provider: "resend",
        messageId: null,
        errorCode,
      },
    ],
  };
}

function createInMemoryInviteClient(input: {
  leagues?: StoredLeague[];
  users?: StoredUser[];
  owners?: StoredOwner[];
  teams?: StoredTeam[];
  invites?: StoredLeagueInvite[];
  memberships?: StoredLeagueMembership[];
  teamMemberships?: StoredTeamMembership[];
} = {}) {
  const leagues = new Map((input.leagues ?? []).map((league) => [league.id, league]));
  const users = new Map((input.users ?? []).map((user) => [user.id, user]));
  const usersByEmail = new Map((input.users ?? []).map((user) => [user.email, user]));
  const owners = new Map((input.owners ?? []).map((owner) => [owner.id, owner]));
  const teams = new Map((input.teams ?? []).map((team) => [team.id, team]));
  const invites = new Map((input.invites ?? []).map((invite) => [invite.id, invite]));
  const memberships = new Map(
    (input.memberships ?? []).map((membership) => [
      membership.id,
      {
        ...membership,
        createdAt: membership.createdAt ?? NOW,
      },
    ]),
  );
  const teamMemberships = new Map(
    (input.teamMemberships ?? []).map((membership) => [membership.id, membership]),
  );
  let nextInviteId = invites.size + 1;
  let nextUserId = users.size + 1;
  let nextMembershipId = memberships.size + 1;
  let nextTeamMembershipId = teamMemberships.size + 1;

  function toInvitePayload(invite: StoredLeagueInvite) {
    return {
      ...invite,
      lastDeliveryAttemptedAt: invite.lastDeliveryAttemptedAt ?? null,
      lastDeliveryState: invite.lastDeliveryState ?? null,
      lastDeliveryErrorCode: invite.lastDeliveryErrorCode ?? null,
      league: leagues.get(invite.leagueId) ?? null,
      team: invite.teamId ? teams.get(invite.teamId) ?? null : null,
      owner: invite.ownerId ? owners.get(invite.ownerId) ?? null : null,
      invitedByUser: invite.invitedByUserId ? users.get(invite.invitedByUserId) ?? null : null,
    };
  }

  const client = {
    async $transaction<T>(callback: (transactionClient: typeof client) => Promise<T>) {
      return callback(client);
    },
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

        const user: StoredUser = {
          id: `user-${nextUserId}`,
          email: args.create.email,
          name: args.create.name,
        };
        nextUserId += 1;
        users.set(user.id, user);
        usersByEmail.set(user.email, user);
        return user;
      },
      async update(args: {
        where: { id: string };
        data: {
          name?: string | null;
        };
      }) {
        const existing = users.get(args.where.id);
        if (!existing) {
          throw new Error("Expected an existing user.");
        }

        const updated: StoredUser = {
          ...existing,
          name: args.data.name ?? existing.name,
        };
        users.set(updated.id, updated);
        usersByEmail.set(updated.email, updated);
        return updated;
      },
    },
    leagueInvite: {
      async create(args: {
        data: {
          leagueId: string;
          email: string;
          intendedRole: "COMMISSIONER" | "MEMBER";
          teamId?: string | null;
          ownerId?: string | null;
          tokenHash: string;
          expiresAt: Date;
          invitedByUserId?: string | null;
        };
      }) {
        const invite: StoredLeagueInvite = {
          id: `invite-${nextInviteId}`,
          leagueId: args.data.leagueId,
          email: args.data.email,
          intendedRole: args.data.intendedRole,
          teamId: args.data.teamId ?? null,
          ownerId: args.data.ownerId ?? null,
          tokenHash: args.data.tokenHash,
          createdAt: NOW,
          expiresAt: args.data.expiresAt,
          acceptedAt: null,
          revokedAt: null,
          invitedByUserId: args.data.invitedByUserId ?? null,
          lastDeliveryAttemptedAt: null,
          lastDeliveryState: null,
          lastDeliveryErrorCode: null,
        };

        nextInviteId += 1;
        invites.set(invite.id, invite);
        return toInvitePayload(invite);
      },
      async findUnique(args: { where: { id: string } }) {
        const invite = invites.get(args.where.id);
        return invite ? toInvitePayload(invite) : null;
      },
      async update(args: {
        where: { id: string };
        data: {
          lastDeliveryAttemptedAt?: Date | null;
          lastDeliveryState?:
            | "SENT"
            | "CAPTURED"
            | "LOGGED"
            | "FAILED"
            | "NOT_CONFIGURED"
            | null;
          lastDeliveryErrorCode?: string | null;
        };
      }) {
        const existing = invites.get(args.where.id);
        if (!existing) {
          throw new Error("Expected an existing invite.");
        }

        const updated: StoredLeagueInvite = {
          ...existing,
          lastDeliveryAttemptedAt:
            args.data.lastDeliveryAttemptedAt !== undefined
              ? args.data.lastDeliveryAttemptedAt
              : (existing.lastDeliveryAttemptedAt ?? null),
          lastDeliveryState:
            args.data.lastDeliveryState !== undefined
              ? args.data.lastDeliveryState
              : (existing.lastDeliveryState ?? null),
          lastDeliveryErrorCode:
            args.data.lastDeliveryErrorCode !== undefined
              ? args.data.lastDeliveryErrorCode
              : (existing.lastDeliveryErrorCode ?? null),
        };

        invites.set(updated.id, updated);
        return toInvitePayload(updated);
      },
      async findMany(args: {
        where: {
          leagueId: string;
        };
        orderBy: {
          createdAt: "desc";
        };
      }) {
        return [...invites.values()]
          .filter((invite) => invite.leagueId === args.where.leagueId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((invite) => toInvitePayload(invite));
      },
      async findFirst(args: {
        where: {
          email?: string;
          leagueId?: string;
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
        const entry =
          [...invites.values()]
            .filter((invite) => {
              if (args.where.email && invite.email !== args.where.email) {
                return false;
              }

              if (args.where.leagueId && invite.leagueId !== args.where.leagueId) {
                return false;
              }

              return (
                invite.acceptedAt === null &&
                invite.revokedAt === null &&
                invite.expiresAt.getTime() > args.where.expiresAt.gt.getTime()
              );
            })
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
          null;

        return entry ? toInvitePayload(entry) : null;
      },
      async updateMany(args: {
        where: {
          id?:
            | string
            | {
                not: string;
              };
          leagueId?: string;
          email?: string;
          acceptedAt?: null;
          revokedAt?: null;
          expiresAt?: {
            gt: Date;
          };
        };
        data: {
          acceptedAt?: Date;
          revokedAt?: Date;
        };
      }) {
        const matchingInvites = [...invites.values()].filter((invite) => {
          if (typeof args.where.id === "string" && invite.id !== args.where.id) {
            return false;
          }

          if (
            args.where.id &&
            typeof args.where.id === "object" &&
            invite.id === args.where.id.not
          ) {
            return false;
          }

          if (args.where.leagueId && invite.leagueId !== args.where.leagueId) {
            return false;
          }

          if (args.where.email && invite.email !== args.where.email) {
            return false;
          }

          if (args.where.acceptedAt === null && invite.acceptedAt !== null) {
            return false;
          }

          if (args.where.revokedAt === null && invite.revokedAt !== null) {
            return false;
          }

          if (
            args.where.expiresAt &&
            invite.expiresAt.getTime() <= args.where.expiresAt.gt.getTime()
          ) {
            return false;
          }

          return true;
        });

        for (const invite of matchingInvites) {
          invites.set(invite.id, {
            ...invite,
            acceptedAt: args.data.acceptedAt ?? invite.acceptedAt,
            revokedAt: args.data.revokedAt ?? invite.revokedAt,
          });
        }

        return { count: matchingInvites.length };
      },
    },
    owner: {
      async findUnique(args: { where: { id: string } }) {
        return owners.get(args.where.id) ?? null;
      },
      async update(args: {
        where: { id: string };
        data: {
          email?: string | null;
          userId?: string | null;
        };
        select: {
          id: true;
          name: true;
          email: true;
          userId: true;
        };
      }) {
        const existing = owners.get(args.where.id);
        if (!existing) {
          throw new Error("Expected an existing owner.");
        }

        const updated: StoredOwner = {
          ...existing,
          email: args.data.email ?? existing.email,
          userId: args.data.userId ?? existing.userId,
        };
        owners.set(updated.id, updated);
        return updated;
      },
    },
    leagueMembership: {
      async findUnique(args: {
        where: {
          userId_leagueId: {
            userId: string;
            leagueId: string;
          };
        };
      }) {
        return (
          [...memberships.values()].find(
            (membership) =>
              membership.userId === args.where.userId_leagueId.userId &&
              membership.leagueId === args.where.userId_leagueId.leagueId,
          ) ?? null
        );
      },
      async findFirst(args: {
        where: {
          leagueId: string;
          teamId: string;
          role: "COMMISSIONER" | "MEMBER";
          userId: {
            not: string;
          };
        };
      }) {
        return (
          [...memberships.values()].find(
            (membership) =>
              membership.leagueId === args.where.leagueId &&
              membership.teamId === args.where.teamId &&
              membership.role === args.where.role &&
              membership.userId !== args.where.userId.not,
          ) ?? null
        );
      },
      async create(args: {
        data: {
          userId: string;
          leagueId: string;
          role: "COMMISSIONER" | "MEMBER";
          teamId?: string | null;
        };
      }) {
        const membership: StoredLeagueMembership = {
          id: `membership-${nextMembershipId}`,
          userId: args.data.userId,
          leagueId: args.data.leagueId,
          role: args.data.role,
          teamId: args.data.teamId ?? null,
          createdAt: NOW,
        };
        nextMembershipId += 1;
        memberships.set(membership.id, membership);
        return membership;
      },
      async update(args: {
        where:
          | { id: string }
          | {
              userId_leagueId: {
                userId: string;
                leagueId: string;
              };
            };
        data: {
          role: "COMMISSIONER" | "MEMBER";
          teamId?: string | null;
        };
        select?: {
          id?: true;
          userId?: true;
          leagueId?: true;
          role?: true;
          teamId?: true;
          createdAt?: true;
          user?: {
            select: {
              email?: true;
              name?: true;
            };
          };
          team?: {
            select: {
              name?: true;
            };
          };
        };
      }) {
        const existing =
          "id" in args.where
            ? memberships.get(args.where.id)
            : [...memberships.values()].find(
                (membership) =>
                  membership.userId === args.where.userId_leagueId.userId &&
                  membership.leagueId === args.where.userId_leagueId.leagueId,
              );
        if (!existing) {
          throw new Error("Expected an existing membership.");
        }

        const updated: StoredLeagueMembership = {
          ...existing,
          role: args.data.role,
          teamId: args.data.teamId !== undefined ? (args.data.teamId ?? null) : existing.teamId,
          createdAt: existing.createdAt ?? NOW,
        };
        memberships.set(updated.id, updated);

        if (!args.select) {
          return updated;
        }

        const user = users.get(updated.userId) ?? null;
        const team = updated.teamId ? teams.get(updated.teamId) ?? null : null;

        return {
          id: updated.id,
          userId: updated.userId,
          leagueId: updated.leagueId,
          role: updated.role,
          teamId: updated.teamId,
          createdAt: updated.createdAt ?? NOW,
          user: {
            email: user?.email ?? "",
            name: user?.name ?? null,
          },
          team: team
            ? {
                name: team.name,
              }
            : null,
        };
      },
      async updateMany(args: {
        where: {
          leagueId: string;
          role: "COMMISSIONER" | "MEMBER";
          userId?: {
            not?: string;
          };
        };
        data: {
          role: "COMMISSIONER" | "MEMBER";
        };
      }) {
        let count = 0;
        for (const [membershipId, membership] of memberships.entries()) {
          if (membership.leagueId !== args.where.leagueId) {
            continue;
          }
          if (membership.role !== args.where.role) {
            continue;
          }
          if (args.where.userId?.not && membership.userId === args.where.userId.not) {
            continue;
          }

          memberships.set(membershipId, {
            ...membership,
            role: args.data.role,
          });
          count += 1;
        }

        return { count };
      },
    },
    teamMembership: {
      async findFirst(args: {
        where: {
          teamId: string;
          isActive: true;
          membershipType: "PRIMARY_MANAGER";
          userId: {
            not: string;
          };
        };
      }) {
        return (
          [...teamMemberships.values()].find(
            (membership) =>
              membership.teamId === args.where.teamId &&
              membership.isActive === args.where.isActive &&
              membership.membershipType === args.where.membershipType &&
              membership.userId !== args.where.userId.not,
          ) ?? null
        );
      },
      async upsert(args: {
        where: {
          teamId_userId_membershipType: {
            teamId: string;
            userId: string;
            membershipType: "PRIMARY_MANAGER" | "CO_MANAGER";
          };
        };
        update: {
          isActive: boolean;
        };
        create: {
          teamId: string;
          userId: string;
          membershipType: "PRIMARY_MANAGER" | "CO_MANAGER";
          isActive: boolean;
        };
      }) {
        const existing = [...teamMemberships.values()].find(
          (membership) =>
            membership.teamId === args.where.teamId_userId_membershipType.teamId &&
            membership.userId === args.where.teamId_userId_membershipType.userId &&
            membership.membershipType === args.where.teamId_userId_membershipType.membershipType,
        );

        if (existing) {
          const updated: StoredTeamMembership = {
            ...existing,
            isActive: args.update.isActive,
            updatedAt: NOW,
          };
          teamMemberships.set(updated.id, updated);
          return updated;
        }

        const membership: StoredTeamMembership = {
          id: `team-membership-${nextTeamMembershipId}`,
          teamId: args.create.teamId,
          userId: args.create.userId,
          membershipType: args.create.membershipType,
          isActive: args.create.isActive,
          createdAt: NOW,
          updatedAt: NOW,
        };
        nextTeamMembershipId += 1;
        teamMemberships.set(membership.id, membership);
        return membership;
      },
    },
    team: {
      async update(args: {
        where: { id: string };
        data: {
          ownerId?: string | null;
        };
      }) {
        const existing = teams.get(args.where.id);
        if (!existing) {
          throw new Error("Expected an existing team.");
        }

        const updated: StoredTeam = {
          ...existing,
          ownerId: args.data.ownerId ?? existing.ownerId,
        };
        teams.set(updated.id, updated);
        return updated;
      },
    },
    inspect() {
      return {
        users,
        owners,
        teams,
        invites,
        memberships,
        teamMemberships,
      };
    },
  };

  return client;
}

test("createInvite stores a hashed token record and captures an invite URL", async () => {
  const deliveries: Array<{ email: string; inviteUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryInviteClient({
    leagues: [
      {
        id: "league-1",
        name: "Invite League",
      },
    ],
    owners: [
      {
        id: "owner-1",
        name: "Invited Owner",
        email: "owner@example.test",
        userId: null,
      },
    ],
    teams: [
      {
        id: "team-1",
        leagueId: "league-1",
        ownerId: "owner-1",
        name: "Invited Team",
      },
    ],
    users: [
      {
        id: "user-1",
        email: "commissioner@example.test",
        name: "Commissioner",
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
    tokenFactory: () => "opaque-invite-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });

  const result = await service.createInvite({
    leagueId: "league-1",
    email: "owner@example.test",
    intendedRole: "MEMBER",
    teamId: "team-1",
    ownerId: "owner-1",
    invitedByUserId: "user-1",
    origin: "http://127.0.0.1:3000",
  });

  const storedInvite = client.inspect().invites.get("invite-1");
  assert.ok(storedInvite);
  assert.notEqual(storedInvite?.tokenHash, result.inviteUrl);
  assert.equal(deliveries.length, 1);
  assert.equal(result.delivery.summary, "captured");

  const inviteUrl = new URL(deliveries[0].inviteUrl);
  assert.equal(inviteUrl.pathname, "/invite");
  assert.equal(inviteUrl.searchParams.get(AUTH_INVITE_TOKEN_PARAM)?.startsWith("invite-1."), true);
  assert.equal(deliveries[0].deliveryKind ?? "initial", "initial");
});

test("getInviteLandingState resolves invalid, expired, revoked, accepted, and pending invites", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    invites: [
      {
        id: "invite-expired",
        leagueId: "league-1",
        email: "expired@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-27T11:59:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
      {
        id: "invite-revoked",
        leagueId: "league-1",
        email: "revoked@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: NOW,
        invitedByUserId: null,
      },
      {
        id: "invite-accepted",
        leagueId: "league-1",
        email: "accepted@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: NOW,
        revokedAt: null,
        invitedByUserId: null,
      },
      {
        id: "invite-pending",
        leagueId: "league-1",
        email: "pending@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  assert.equal((await service.getInviteLandingState("bad-token")).status, "invalid");
  assert.equal((await service.getInviteLandingState("invite-expired.anything")).status, "expired");
  assert.equal((await service.getInviteLandingState("invite-revoked.anything")).status, "revoked");
  assert.equal((await service.getInviteLandingState("invite-accepted.anything")).status, "accepted");
  assert.equal((await service.getInviteLandingState("invite-pending.anything")).status, "pending");
});

test("acceptInviteForAuthenticatedUser requires the authenticated email to match the invite", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "wrong@example.test",
        name: "Wrong User",
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "right@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  await assert.rejects(
    () =>
      service.acceptInviteForAuthenticatedUser({
        token: "invite-1.anything",
        userId: "user-1",
      }),
    (error: unknown) =>
      error instanceof LeagueInviteAcceptanceError && error.code === "INVITE_EMAIL_MISMATCH",
  );
});

test("acceptInviteForAuthenticatedUser binds league membership, team membership, and owner profile", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "owner@example.test",
        name: null,
      },
    ],
    owners: [
      {
        id: "owner-1",
        name: "Invited Owner",
        email: "owner@example.test",
        userId: null,
      },
    ],
    teams: [
      {
        id: "team-1",
        leagueId: "league-1",
        ownerId: "owner-1",
        name: "Invited Team",
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "owner@example.test",
        intendedRole: "MEMBER",
        teamId: "team-1",
        ownerId: "owner-1",
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  const result = await service.acceptInviteForAuthenticatedUser({
    token: "invite-1.anything",
    userId: "user-1",
  });

  assert.equal(result.membership.leagueRole, "MEMBER");
  assert.equal(result.membership.teamId, "team-1");
  assert.equal(result.teamMembership?.membershipType, "PRIMARY_MANAGER");
  assert.equal(result.owner?.userId, "user-1");
  assert.equal(client.inspect().invites.get("invite-1")?.acceptedAt?.toISOString(), NOW.toISOString());
  assert.equal(client.inspect().users.get("user-1")?.name, "Invited Owner");
});

test("acceptInviteForAuthenticatedUser promotes commissioner invite and demotes prior commissioner", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "acting-commissioner@example.test",
        name: "Acting Commissioner",
      },
      {
        id: "user-2",
        email: "incoming-commissioner@example.test",
        name: "Incoming Commissioner",
      },
    ],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: "COMMISSIONER",
        teamId: null,
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "incoming-commissioner@example.test",
        intendedRole: "COMMISSIONER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: "user-1",
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  const result = await service.acceptInviteForAuthenticatedUser({
    token: "invite-1.anything",
    userId: "user-2",
  });

  assert.equal(result.membership.leagueRole, "COMMISSIONER");
  const membershipRows = [...client.inspect().memberships.values()];
  const actingCommissioner = membershipRows.find((membership) => membership.userId === "user-1");
  const incomingCommissioner = membershipRows.find((membership) => membership.userId === "user-2");
  assert.equal(actingCommissioner?.role, "MEMBER");
  assert.equal(incomingCommissioner?.role, "COMMISSIONER");
});

test("acceptInviteForAuthenticatedUser keeps team assignment when promoting an existing member to commissioner", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "acting-commissioner@example.test",
        name: "Acting Commissioner",
      },
      {
        id: "user-2",
        email: "member-owner@example.test",
        name: "Member Owner",
      },
    ],
    teams: [
      {
        id: "team-1",
        leagueId: "league-1",
        ownerId: null,
        name: "Member Team",
      },
    ],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: "COMMISSIONER",
        teamId: null,
      },
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: "MEMBER",
        teamId: "team-1",
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "member-owner@example.test",
        intendedRole: "COMMISSIONER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: "user-1",
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  const result = await service.acceptInviteForAuthenticatedUser({
    token: "invite-1.anything",
    userId: "user-2",
  });

  assert.equal(result.membership.leagueRole, "COMMISSIONER");
  assert.equal(result.membership.teamId, "team-1");
});

test("acceptInviteForAuthenticatedUser safely rejects duplicate acceptance", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "owner@example.test",
        name: "Owner",
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "owner@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: NOW,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  await assert.rejects(
    () =>
      service.acceptInviteForAuthenticatedUser({
        token: "invite-1.anything",
        userId: "user-1",
      }),
    (error: unknown) =>
      error instanceof LeagueInviteAcceptanceError && error.code === "INVITE_ALREADY_ACCEPTED",
  );
});

test("acceptInviteForAuthenticatedUser rejects conflicting team bindings", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "owner@example.test",
        name: "Owner",
      },
    ],
    owners: [
      {
        id: "owner-1",
        name: "Invited Owner",
        email: "owner@example.test",
        userId: null,
      },
    ],
    teams: [
      {
        id: "team-1",
        leagueId: "league-1",
        ownerId: "owner-1",
        name: "Invited Team",
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "owner@example.test",
        intendedRole: "MEMBER",
        teamId: "team-1",
        ownerId: "owner-1",
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
    teamMemberships: [
      {
        id: "team-membership-1",
        teamId: "team-1",
        userId: "other-user",
        membershipType: "PRIMARY_MANAGER",
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  await assert.rejects(
    () =>
      service.acceptInviteForAuthenticatedUser({
        token: "invite-1.anything",
        userId: "user-1",
      }),
    (error: unknown) =>
      error instanceof LeagueInviteAcceptanceError && error.code === "TEAM_MEMBERSHIP_CONFLICT",
  );
});

test("listInvitesForLeague derives authoritative invite statuses in newest-first order", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    invites: [
      {
        id: "invite-pending",
        leagueId: "league-1",
        email: "pending@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: new Date("2026-03-27T11:59:59.000Z"),
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
      {
        id: "invite-revoked",
        leagueId: "league-1",
        email: "revoked@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: new Date("2026-03-27T11:30:00.000Z"),
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: NOW,
        invitedByUserId: null,
      },
      {
        id: "invite-expired",
        leagueId: "league-1",
        email: "expired@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: new Date("2026-03-27T11:00:00.000Z"),
        expiresAt: new Date("2026-03-27T11:30:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
      {
        id: "invite-accepted",
        leagueId: "league-1",
        email: "accepted@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: new Date("2026-03-27T10:30:00.000Z"),
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: NOW,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  const invites = await service.listInvitesForLeague("league-1");

  assert.deepEqual(
    invites.map((invite) => [invite.id, invite.status]),
    [
      ["invite-pending", "pending"],
      ["invite-revoked", "revoked"],
      ["invite-expired", "expired"],
      ["invite-accepted", "accepted"],
    ],
  );
  assert.equal(invites[0]?.canResend, true);
  assert.equal(invites[0]?.canRevoke, true);
  assert.equal(invites[1]?.canResend, false);
  assert.equal(invites[2]?.canResend, true);
});

test("listInvitesForLeague surfaces persisted delivery troubleshooting state", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    invites: [
      {
        id: "invite-failed",
        leagueId: "league-1",
        email: "failed@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
        lastDeliveryAttemptedAt: NOW,
        lastDeliveryState: "FAILED",
        lastDeliveryErrorCode: "RESEND_503",
      },
      {
        id: "invite-captured",
        leagueId: "league-1",
        email: "captured@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: new Date("2026-03-27T11:59:59.000Z"),
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
        lastDeliveryAttemptedAt: NOW,
        lastDeliveryState: "CAPTURED",
        lastDeliveryErrorCode: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  const invites = await service.listInvitesForLeague("league-1");

  assert.equal(invites[0]?.delivery?.state, "failed");
  assert.equal(invites[0]?.delivery?.canRetry, true);
  assert.equal(invites[0]?.delivery?.inviteStillValid, true);
  assert.match(invites[0]?.delivery?.detail ?? "", /invite is still valid/i);
  assert.equal(invites[1]?.delivery?.state, "captured");
  assert.match(invites[1]?.delivery?.detail ?? "", /No real email was sent/i);
});

test("resendInvite replaces a pending invite with a fresh pending invite", async () => {
  const deliveries: Array<{ email: string; inviteUrl: string; expiresAt: Date }> = [];
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "owner@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: "user-1",
      },
    ],
    users: [
      {
        id: "user-1",
        email: "commissioner@example.test",
        name: "Commissioner",
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
    tokenFactory: () => "fresh-secret",
    delivery: {
      async send(input) {
        deliveries.push(input);
        return capturedDeliveryResult();
      },
    },
  });

  const resent = await service.resendInvite({
    inviteId: "invite-1",
    origin: "http://127.0.0.1:3000",
    invitedByUserId: "user-1",
  });

  assert.equal(client.inspect().invites.get("invite-1")?.revokedAt?.toISOString(), NOW.toISOString());
  assert.ok(resent.invite.id !== "invite-1");
  assert.equal(resent.invite.email, "owner@example.test");
  assert.equal(deliveries.length, 1);
  assert.equal(resent.delivery.summary, "captured");
  assert.equal(resent.deliveryView.state, "captured");
  assert.equal(deliveries[0].deliveryKind, "resend");
  assert.equal(client.inspect().invites.get(resent.invite.id)?.lastDeliveryState, "CAPTURED");
  assert.equal(new URL(deliveries[0].inviteUrl).searchParams.get(AUTH_INVITE_TOKEN_PARAM)?.startsWith(`${resent.invite.id}.`), true);
});

test("createInvite records a safe failed delivery state while keeping the invite valid", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
    tokenFactory: () => "delivery-failure-secret",
    delivery: {
      async send() {
        return failedDeliveryResult();
      },
    },
  });

  const result = await service.createInvite({
    leagueId: "league-1",
    email: "owner@example.test",
    intendedRole: "MEMBER",
    origin: "http://127.0.0.1:3000",
  });

  assert.equal(result.delivery.ok, false);
  assert.equal(result.deliveryView.state, "failed");
  assert.equal(result.deliveryView.canRetry, true);
  assert.equal(result.deliveryView.inviteStillValid, true);
  assert.match(result.deliveryView.detail, /resend/i);
  assert.equal(client.inspect().invites.get(result.invite.id)?.lastDeliveryState, "FAILED");
});

test("createInvite records a not-configured delivery state safely", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
    tokenFactory: () => "not-configured-secret",
    delivery: {
      async send() {
        return failedDeliveryResult("EMAIL_DELIVERY_NOT_CONFIGURED");
      },
    },
  });

  const result = await service.createInvite({
    leagueId: "league-1",
    email: "owner@example.test",
    intendedRole: "MEMBER",
    origin: "http://127.0.0.1:3000",
  });

  assert.equal(result.delivery.ok, false);
  assert.equal(result.deliveryView.state, "not_configured");
  assert.match(result.deliveryView.detail, /not configured/i);
  assert.equal(client.inspect().invites.get(result.invite.id)?.lastDeliveryState, "NOT_CONFIGURED");
});

test("revokeInvite marks a pending invite as revoked and blocks later acceptance", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    users: [
      {
        id: "user-1",
        email: "owner@example.test",
        name: "Owner",
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "owner@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  const revoked = await service.revokeInvite({
    inviteId: "invite-1",
  });

  assert.equal(revoked.status, "revoked");
  assert.equal(client.inspect().invites.get("invite-1")?.revokedAt?.toISOString(), NOW.toISOString());

  await assert.rejects(
    () =>
      service.acceptInviteForAuthenticatedUser({
        token: "invite-1.anything",
        userId: "user-1",
      }),
    (error: unknown) =>
      error instanceof LeagueInviteAcceptanceError && error.code === "REVOKED_INVITE",
  );
});

test("revokeInvite rejects already accepted invites safely", async () => {
  const client = createInMemoryInviteClient({
    leagues: [{ id: "league-1", name: "Invite League" }],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "owner@example.test",
        intendedRole: "MEMBER",
        teamId: null,
        ownerId: null,
        tokenHash: ANYTHING_TOKEN_HASH,
        createdAt: NOW,
        expiresAt: new Date("2026-03-28T12:00:00.000Z"),
        acceptedAt: NOW,
        revokedAt: null,
        invitedByUserId: null,
      },
    ],
  });
  const service = createLeagueInviteService(client as never, {
    now: () => NOW,
  });

  await assert.rejects(
    () =>
      service.revokeInvite({
        inviteId: "invite-1",
      }),
    (error: unknown) =>
      error instanceof LeagueInviteManagementError && error.code === "INVITE_ALREADY_ACCEPTED",
  );
});
