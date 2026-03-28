import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuthSessionDbClient = PrismaClient | Prisma.TransactionClient;

const authSessionWithUserSelect = {
  id: true,
  userId: true,
  tokenHash: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  userAgent: true,
  ipAddress: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
    },
  },
} satisfies Prisma.AuthSessionSelect;

export type AuthSessionRecord = Prisma.AuthSessionGetPayload<{
  select: typeof authSessionWithUserSelect;
}>;

export type CreateAuthSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export function createSessionRepository(client: AuthSessionDbClient = prisma) {
  return {
    async create(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
      return client.authSession.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          userAgent: input.userAgent ?? null,
          ipAddress: input.ipAddress ?? null,
        },
        select: authSessionWithUserSelect,
      });
    },

    async findById(id: string): Promise<AuthSessionRecord | null> {
      return client.authSession.findUnique({
        where: { id },
        select: authSessionWithUserSelect,
      });
    },

    async touch(id: string, lastUsedAt: Date): Promise<AuthSessionRecord> {
      return client.authSession.update({
        where: { id },
        data: { lastUsedAt },
        select: authSessionWithUserSelect,
      });
    },

    async revoke(id: string, revokedAt: Date): Promise<AuthSessionRecord> {
      return client.authSession.update({
        where: { id },
        data: { revokedAt },
        select: authSessionWithUserSelect,
      });
    },
  };
}
