import { InviteDeliveryState, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type LeagueInviteDbClient = PrismaClient | Prisma.TransactionClient;

const leagueInviteSelect = {
  id: true,
  leagueId: true,
  email: true,
  intendedRole: true,
  teamId: true,
  ownerId: true,
  tokenHash: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedByUserId: true,
  lastDeliveryAttemptedAt: true,
  lastDeliveryState: true,
  lastDeliveryErrorCode: true,
  league: {
    select: {
      id: true,
      name: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
    },
  },
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
    },
  },
  invitedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.LeagueInviteSelect;

export type LeagueInviteRecord = Prisma.LeagueInviteGetPayload<{
  select: typeof leagueInviteSelect;
}>;

export type CreateLeagueInviteInput = {
  leagueId: string;
  email: string;
  intendedRole: "COMMISSIONER" | "MEMBER";
  teamId?: string | null;
  ownerId?: string | null;
  tokenHash: string;
  expiresAt: Date;
  invitedByUserId?: string | null;
};

export function createLeagueInviteRepository(client: LeagueInviteDbClient = prisma) {
  return {
    async create(input: CreateLeagueInviteInput): Promise<LeagueInviteRecord> {
      return client.leagueInvite.create({
        data: {
          leagueId: input.leagueId,
          email: input.email,
          intendedRole: input.intendedRole,
          teamId: input.teamId ?? null,
          ownerId: input.ownerId ?? null,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          invitedByUserId: input.invitedByUserId ?? null,
        },
        select: leagueInviteSelect,
      });
    },

    async findById(id: string): Promise<LeagueInviteRecord | null> {
      return client.leagueInvite.findUnique({
        where: { id },
        select: leagueInviteSelect,
      });
    },

    async recordDeliveryAttempt(input: {
      id: string;
      attemptedAt: Date;
      state: InviteDeliveryState;
      errorCode?: string | null;
    }): Promise<LeagueInviteRecord> {
      return client.leagueInvite.update({
        where: {
          id: input.id,
        },
        data: {
          lastDeliveryAttemptedAt: input.attemptedAt,
          lastDeliveryState: input.state,
          lastDeliveryErrorCode: input.errorCode ?? null,
        },
        select: leagueInviteSelect,
      });
    },

    async listByLeagueId(leagueId: string): Promise<LeagueInviteRecord[]> {
      return client.leagueInvite.findMany({
        where: {
          leagueId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: leagueInviteSelect,
      });
    },

    async findLatestPendingByEmail(email: string, now: Date): Promise<LeagueInviteRecord | null> {
      return client.leagueInvite.findFirst({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: leagueInviteSelect,
      });
    },

    async findLatestPendingByLeagueAndEmail(
      leagueId: string,
      email: string,
      now: Date,
    ): Promise<LeagueInviteRecord | null> {
      return client.leagueInvite.findFirst({
        where: {
          leagueId,
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: leagueInviteSelect,
      });
    },

    async acceptIfAvailable(id: string, acceptedAt: Date, now: Date) {
      const result = await client.leagueInvite.updateMany({
        where: {
          id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          acceptedAt,
        },
      });

      return result.count === 1;
    },

    async revokeIfAvailable(id: string, revokedAt: Date, now: Date) {
      const result = await client.leagueInvite.updateMany({
        where: {
          id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt,
        },
      });

      return result.count === 1;
    },

    async revokePendingByLeagueAndEmail(
      leagueId: string,
      email: string,
      revokedAt: Date,
      now: Date,
      excludeId?: string | null,
    ) {
      const result = await client.leagueInvite.updateMany({
        where: {
          leagueId,
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
          ...(excludeId
            ? {
                id: {
                  not: excludeId,
                },
              }
            : {}),
        },
        data: {
          revokedAt,
        },
      });

      return result.count;
    },
  };
}
