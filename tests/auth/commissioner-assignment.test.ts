import assert from "node:assert/strict";
import test from "node:test";
import { LeagueRole } from "@prisma/client";
import {
  assignLeagueCommissioner,
  CommissionerAssignmentError,
  getLeagueCommissionerIntegrity,
  repairLeagueCommissionerIntegrity,
} from "@/lib/domain/league-membership/commissioner-assignment";

type StoredUser = {
  id: string;
  email: string;
  name: string | null;
};

type StoredTeam = {
  id: string;
  name: string;
};

type StoredMembership = {
  id: string;
  userId: string;
  leagueId: string;
  role: LeagueRole;
  teamId: string | null;
  createdAt: Date;
};

type StoredInvite = {
  id: string;
  leagueId: string;
  email: string;
  intendedRole: LeagueRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedByUserId: string | null;
};

const NOW = new Date("2026-03-28T12:00:00.000Z");

function createAssignmentClient(input: {
  users: StoredUser[];
  memberships: StoredMembership[];
  teams?: StoredTeam[];
  invites?: StoredInvite[];
}) {
  const users = new Map(input.users.map((user) => [user.id, user]));
  const teams = new Map((input.teams ?? []).map((team) => [team.id, team]));
  const memberships = new Map(input.memberships.map((membership) => [membership.id, membership]));
  const invites = new Map((input.invites ?? []).map((invite) => [invite.id, invite]));

  function toMembershipPayload(membership: StoredMembership) {
    const user = users.get(membership.userId);
    const team = membership.teamId ? teams.get(membership.teamId) : null;

    return {
      id: membership.id,
      userId: membership.userId,
      leagueId: membership.leagueId,
      role: membership.role,
      teamId: membership.teamId,
      createdAt: membership.createdAt,
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
  }

  return {
    leagueMembership: {
      async findUnique(args: {
        where: {
          userId_leagueId: {
            userId: string;
            leagueId: string;
          };
        };
        select?: Record<string, unknown>;
      }) {
        const membership =
          [...memberships.values()].find(
            (entry) =>
              entry.userId === args.where.userId_leagueId.userId &&
              entry.leagueId === args.where.userId_leagueId.leagueId,
          ) ?? null;
        if (!membership) {
          return null;
        }

        if (!args.select) {
          return membership;
        }

        return toMembershipPayload(membership);
      },
      async findMany(args: {
        where: {
          leagueId: string;
          role?: LeagueRole;
        };
        orderBy?: {
          createdAt: "asc" | "desc";
        };
        take?: number;
        select?: Record<string, unknown>;
      }) {
        let rows = [...memberships.values()].filter((entry) => {
          if (entry.leagueId !== args.where.leagueId) {
            return false;
          }

          if (args.where.role && entry.role !== args.where.role) {
            return false;
          }

          return true;
        });

        if (args.orderBy?.createdAt) {
          rows = rows.sort((left, right) => {
            const delta = left.createdAt.getTime() - right.createdAt.getTime();
            return args.orderBy?.createdAt === "asc" ? delta : -delta;
          });
        }

        if (typeof args.take === "number") {
          rows = rows.slice(0, args.take);
        }

        if (!args.select) {
          return rows;
        }

        return rows.map((membership) => toMembershipPayload(membership));
      },
      async count(args: {
        where: {
          leagueId: string;
          role?: LeagueRole;
        };
      }) {
        return [...memberships.values()].filter((entry) => {
          if (entry.leagueId !== args.where.leagueId) {
            return false;
          }

          if (args.where.role && entry.role !== args.where.role) {
            return false;
          }

          return true;
        }).length;
      },
      async updateMany(args: {
        where: {
          leagueId: string;
          role: LeagueRole;
          userId?:
            | string
            | {
                not?: string;
              };
        };
        data: {
          role: LeagueRole;
        };
      }) {
        let count = 0;

        for (const [id, membership] of memberships.entries()) {
          if (membership.leagueId !== args.where.leagueId) {
            continue;
          }
          if (membership.role !== args.where.role) {
            continue;
          }

          if (typeof args.where.userId === "string" && membership.userId !== args.where.userId) {
            continue;
          }

          if (
            args.where.userId &&
            typeof args.where.userId === "object" &&
            args.where.userId.not &&
            membership.userId === args.where.userId.not
          ) {
            continue;
          }

          memberships.set(id, {
            ...membership,
            role: args.data.role,
          });
          count += 1;
        }

        return { count };
      },
      async update(args: {
        where: {
          userId_leagueId: {
            userId: string;
            leagueId: string;
          };
        };
        data: {
          role: LeagueRole;
        };
        select?: Record<string, unknown>;
      }) {
        const membership =
          [...memberships.values()].find(
            (entry) =>
              entry.userId === args.where.userId_leagueId.userId &&
              entry.leagueId === args.where.userId_leagueId.leagueId,
          ) ?? null;

        if (!membership) {
          throw new Error("Expected membership to exist.");
        }

        const updated: StoredMembership = {
          ...membership,
          role: args.data.role,
        };
        memberships.set(updated.id, updated);

        if (!args.select) {
          return updated;
        }

        return toMembershipPayload(updated);
      },
    },
    leagueInvite: {
      async findFirst(args: {
        where: {
          leagueId: string;
          intendedRole: LeagueRole;
          acceptedAt: null;
          revokedAt: null;
          expiresAt: {
            gt: Date;
          };
        };
        orderBy: {
          createdAt: "asc" | "desc";
        };
        select?: Record<string, unknown>;
      }) {
        const rows = [...invites.values()]
          .filter((invite) => {
            if (invite.leagueId !== args.where.leagueId) {
              return false;
            }
            if (invite.intendedRole !== args.where.intendedRole) {
              return false;
            }
            if (invite.acceptedAt !== args.where.acceptedAt) {
              return false;
            }
            if (invite.revokedAt !== args.where.revokedAt) {
              return false;
            }
            if (!(invite.expiresAt.getTime() > args.where.expiresAt.gt.getTime())) {
              return false;
            }
            return true;
          })
          .sort((left, right) => {
            const delta = left.createdAt.getTime() - right.createdAt.getTime();
            return args.orderBy.createdAt === "asc" ? delta : -delta;
          });

        const invite = rows[0] ?? null;
        if (!invite) {
          return null;
        }

        if (!args.select) {
          return invite;
        }

        const invitedBy = invite.invitedByUserId ? users.get(invite.invitedByUserId) ?? null : null;

        return {
          id: invite.id,
          email: invite.email,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          invitedByUser: invitedBy
            ? {
                id: invitedBy.id,
                email: invitedBy.email,
                name: invitedBy.name,
              }
            : null,
        };
      },
    },
    user: {
      async findUnique(args: {
        where: {
          id?: string;
          email?: string;
        };
        select?: Record<string, unknown>;
      }) {
        const user =
          (args.where.id ? users.get(args.where.id) : null) ??
          (args.where.email
            ? [...users.values()].find((candidate) => candidate.email === args.where.email) ?? null
            : null);

        if (!user) {
          return null;
        }

        if (!args.select) {
          return user;
        }

        return {
          id: user.id,
          email: user.email,
        };
      },
    },
    inspect() {
      return {
        memberships: [...memberships.values()],
      };
    },
  };
}

test("assignLeagueCommissioner transfers authority and leaves exactly one commissioner", async () => {
  const client = createAssignmentClient({
    users: [
      { id: "user-1", email: "current@example.test", name: "Current Commissioner" },
      { id: "user-2", email: "target@example.test", name: "Target Member" },
    ],
    teams: [{ id: "team-1", name: "Target Team" }],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: LeagueRole.COMMISSIONER,
        teamId: null,
        createdAt: NOW,
      },
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: "team-1",
        createdAt: NOW,
      },
    ],
  });

  const result = await assignLeagueCommissioner(client as never, {
    leagueId: "league-1",
    targetUserId: "user-2",
    operation: "COMMISSIONER_TRANSFER",
    expectedCurrentCommissionerUserId: "user-1",
    allowMissingCurrentCommissioner: false,
  });

  assert.equal(result.commissioner.userId, "user-2");
  assert.equal(result.previousCommissioner?.userId, "user-1");
  assert.equal(result.commissioner.teamId, "team-1");

  const memberships = client.inspect().memberships;
  assert.equal(
    memberships.filter((membership) => membership.role === LeagueRole.COMMISSIONER).length,
    1,
  );
  assert.equal(
    memberships.find((membership) => membership.userId === "user-1")?.role,
    LeagueRole.MEMBER,
  );
});

test("assignLeagueCommissioner rejects strict transitions when no active commissioner exists", async () => {
  const client = createAssignmentClient({
    users: [{ id: "user-2", email: "target@example.test", name: "Target Member" }],
    memberships: [
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
    ],
  });

  await assert.rejects(
    () =>
      assignLeagueCommissioner(client as never, {
        leagueId: "league-1",
        targetUserId: "user-2",
        operation: "COMMISSIONER_TRANSFER",
        allowMissingCurrentCommissioner: false,
      }),
    (error: unknown) =>
      error instanceof CommissionerAssignmentError &&
      error.code === "CURRENT_COMMISSIONER_REQUIRED",
  );
});

test("assignLeagueCommissioner allows recovery transitions when missing commissioner is explicitly permitted", async () => {
  const client = createAssignmentClient({
    users: [{ id: "user-2", email: "target@example.test", name: "Target Member" }],
    memberships: [
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
    ],
  });

  const result = await assignLeagueCommissioner(client as never, {
    leagueId: "league-1",
    targetUserId: "user-2",
    operation: "COMMISSIONER_INVITE_ACCEPTANCE",
    allowMissingCurrentCommissioner: true,
  });

  assert.equal(result.commissioner.userId, "user-2");
  assert.equal(result.commissioner.role, LeagueRole.COMMISSIONER);
});

test("assignLeagueCommissioner rejects invalid states with multiple active commissioners", async () => {
  const client = createAssignmentClient({
    users: [
      { id: "user-1", email: "commissioner-a@example.test", name: "Commissioner A" },
      { id: "user-2", email: "target@example.test", name: "Target Member" },
      { id: "user-3", email: "commissioner-b@example.test", name: "Commissioner B" },
    ],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: LeagueRole.COMMISSIONER,
        teamId: null,
        createdAt: NOW,
      },
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
      {
        id: "membership-3",
        userId: "user-3",
        leagueId: "league-1",
        role: LeagueRole.COMMISSIONER,
        teamId: null,
        createdAt: NOW,
      },
    ],
  });

  await assert.rejects(
    () =>
      assignLeagueCommissioner(client as never, {
        leagueId: "league-1",
        targetUserId: "user-2",
        operation: "COMMISSIONER_TRANSFER",
        allowMissingCurrentCommissioner: false,
      }),
    (error: unknown) =>
      error instanceof CommissionerAssignmentError &&
      error.code === "COMMISSIONER_STATE_INVALID",
  );
});

test("getLeagueCommissionerIntegrity detects missing commissioner state", async () => {
  const client = createAssignmentClient({
    users: [{ id: "user-1", email: "member@example.test", name: "Member" }],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
    ],
  });

  const integrity = await getLeagueCommissionerIntegrity(client as never, {
    leagueId: "league-1",
    includePendingCommissionerDesignation: true,
  });

  assert.equal(integrity.status, "MISSING_COMMISSIONER");
  assert.equal(integrity.operationalCommissioner, null);
  assert.equal(integrity.activeCommissioners.length, 0);
  assert.equal(integrity.issues.some((issue) => issue.code === "MISSING_ACTIVE_COMMISSIONER"), true);
});

test("getLeagueCommissionerIntegrity detects conflicting multi-commissioner state", async () => {
  const client = createAssignmentClient({
    users: [
      { id: "user-1", email: "commissioner-a@example.test", name: "Commissioner A" },
      { id: "user-2", email: "commissioner-b@example.test", name: "Commissioner B" },
    ],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: LeagueRole.COMMISSIONER,
        teamId: null,
        createdAt: NOW,
      },
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.COMMISSIONER,
        teamId: null,
        createdAt: NOW,
      },
    ],
  });

  const integrity = await getLeagueCommissionerIntegrity(client as never, {
    leagueId: "league-1",
    includePendingCommissionerDesignation: true,
  });

  assert.equal(integrity.status, "MULTIPLE_COMMISSIONERS");
  assert.equal(integrity.operationalCommissioner, null);
  assert.equal(integrity.activeCommissioners.length, 2);
  assert.equal(
    integrity.issues.some((issue) => issue.code === "MULTIPLE_ACTIVE_COMMISSIONERS"),
    true,
  );
});

test("getLeagueCommissionerIntegrity flags pending commissioner designation conflicts", async () => {
  const client = createAssignmentClient({
    users: [
      { id: "user-1", email: "inviter@example.test", name: "Inviter" },
      { id: "user-2", email: "target@example.test", name: "Target" },
    ],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: LeagueRole.COMMISSIONER,
        teamId: null,
        createdAt: NOW,
      },
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
    ],
    invites: [
      {
        id: "invite-1",
        leagueId: "league-1",
        email: "target@example.test",
        intendedRole: LeagueRole.COMMISSIONER,
        createdAt: NOW,
        expiresAt: new Date("2026-03-30T12:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: "user-1",
      },
    ],
  });

  const integrity = await getLeagueCommissionerIntegrity(client as never, {
    leagueId: "league-1",
    includePendingCommissionerDesignation: true,
  });

  assert.equal(integrity.status, "HEALTHY");
  assert.equal(integrity.pendingCommissionerDesignation?.email, "target@example.test");
  assert.equal(integrity.pendingCommissionerDesignation?.conflict?.code, "TARGET_ALREADY_MEMBER");
  assert.equal(
    integrity.issues.some(
      (issue) => issue.code === "PENDING_DESIGNATION_TARGET_ALREADY_MEMBER",
    ),
    true,
  );
});

test("repairLeagueCommissionerIntegrity restores one operational commissioner", async () => {
  const client = createAssignmentClient({
    users: [
      { id: "user-1", email: "member-a@example.test", name: "Member A" },
      { id: "user-2", email: "member-b@example.test", name: "Member B" },
    ],
    memberships: [
      {
        id: "membership-1",
        userId: "user-1",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
      {
        id: "membership-2",
        userId: "user-2",
        leagueId: "league-1",
        role: LeagueRole.MEMBER,
        teamId: null,
        createdAt: NOW,
      },
    ],
  });

  const result = await repairLeagueCommissionerIntegrity(client as never, {
    leagueId: "league-1",
    targetUserId: "user-2",
  });

  assert.equal(result.beforeIntegrity.status, "MISSING_COMMISSIONER");
  assert.equal(result.afterIntegrity.status, "HEALTHY");
  assert.equal(result.assignment.commissioner.userId, "user-2");

  const memberships = client.inspect().memberships;
  assert.equal(
    memberships.filter((membership) => membership.role === LeagueRole.COMMISSIONER).length,
    1,
  );
  assert.equal(
    memberships.find((membership) => membership.userId === "user-2")?.role,
    LeagueRole.COMMISSIONER,
  );
});
