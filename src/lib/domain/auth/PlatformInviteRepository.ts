import { InviteDeliveryState, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PlatformInviteDbClient = PrismaClient | Prisma.TransactionClient;

const platformInviteSelect = {
  id: true,
  email: true,
  tokenHash: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedByUserId: true,
  lastDeliveryAttemptedAt: true,
  lastDeliveryState: true,
  lastDeliveryErrorCode: true,
  invitedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.PlatformInviteSelect;

export type PlatformInviteRecord = Prisma.PlatformInviteGetPayload<{
  select: typeof platformInviteSelect;
}>;

export type CreatePlatformInviteInput = {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  invitedByUserId?: string | null;
};

export function createPlatformInviteRepository(client: PlatformInviteDbClient = prisma) {
  return {
    async create(input: CreatePlatformInviteInput): Promise<PlatformInviteRecord> {
      return client.platformInvite.create({
        data: {
          email: input.email,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          invitedByUserId: input.invitedByUserId ?? null,
        },
        select: platformInviteSelect,
      });
    },

    async findById(id: string): Promise<PlatformInviteRecord | null> {
      return client.platformInvite.findUnique({
        where: { id },
        select: platformInviteSelect,
      });
    },

    async findLatestPendingByEmail(email: string, now: Date): Promise<PlatformInviteRecord | null> {
      return client.platformInvite.findFirst({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
        select: platformInviteSelect,
      });
    },

    async listBySentByUserId(userId: string): Promise<PlatformInviteRecord[]> {
      return client.platformInvite.findMany({
        where: { invitedByUserId: userId },
        orderBy: { createdAt: "desc" },
        select: platformInviteSelect,
      });
    },

    async recordDeliveryAttempt(input: {
      id: string;
      attemptedAt: Date;
      state: InviteDeliveryState;
      errorCode?: string | null;
    }): Promise<PlatformInviteRecord> {
      return client.platformInvite.update({
        where: { id: input.id },
        data: {
          lastDeliveryAttemptedAt: input.attemptedAt,
          lastDeliveryState: input.state,
          lastDeliveryErrorCode: input.errorCode ?? null,
        },
        select: platformInviteSelect,
      });
    },

    async acceptIfAvailable(id: string, acceptedAt: Date, now: Date): Promise<boolean> {
      const result = await client.platformInvite.updateMany({
        where: {
          id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt },
      });
      return result.count === 1;
    },

    async revokeIfAvailable(id: string, revokedAt: Date, now: Date): Promise<boolean> {
      const result = await client.platformInvite.updateMany({
        where: {
          id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt },
      });
      return result.count === 1;
    },

    async revokePendingByEmail(
      email: string,
      revokedAt: Date,
      now: Date,
      excludeId?: string | null,
    ): Promise<number> {
      const result = await client.platformInvite.updateMany({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        data: { revokedAt },
      });
      return result.count;
    },
  };
}
