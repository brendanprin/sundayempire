import { Prisma, PrismaClient } from "@prisma/client";
import { AUTH_MAGIC_LINK_PURPOSE_SIGN_IN } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";

type AuthMagicLinkDbClient = PrismaClient | Prisma.TransactionClient;

const authMagicLinkSelect = {
  id: true,
  email: true,
  tokenHash: true,
  purpose: true,
  createdAt: true,
  expiresAt: true,
  consumedAt: true,
  requestedByIp: true,
  requestedByUserAgent: true,
} satisfies Prisma.AuthMagicLinkSelect;

export type AuthMagicLinkRecord = Prisma.AuthMagicLinkGetPayload<{
  select: typeof authMagicLinkSelect;
}>;

export type CreateAuthMagicLinkInput = {
  email: string;
  tokenHash: string;
  purpose?: string;
  expiresAt: Date;
  requestedByIp?: string | null;
  requestedByUserAgent?: string | null;
};

export function createMagicLinkRepository(client: AuthMagicLinkDbClient = prisma) {
  return {
    async create(input: CreateAuthMagicLinkInput): Promise<AuthMagicLinkRecord> {
      return client.authMagicLink.create({
        data: {
          email: input.email,
          tokenHash: input.tokenHash,
          purpose: input.purpose ?? AUTH_MAGIC_LINK_PURPOSE_SIGN_IN,
          expiresAt: input.expiresAt,
          requestedByIp: input.requestedByIp ?? null,
          requestedByUserAgent: input.requestedByUserAgent ?? null,
        },
        select: authMagicLinkSelect,
      });
    },

    async findById(id: string): Promise<AuthMagicLinkRecord | null> {
      return client.authMagicLink.findUnique({
        where: { id },
        select: authMagicLinkSelect,
      });
    },

    async findLatestActiveByEmail(email: string, now: Date): Promise<AuthMagicLinkRecord | null> {
      return client.authMagicLink.findFirst({
        where: {
          email,
          consumedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: authMagicLinkSelect,
      });
    },

    async consumeIfAvailable(id: string, consumedAt: Date) {
      const result = await client.authMagicLink.updateMany({
        where: {
          id,
          consumedAt: null,
        },
        data: {
          consumedAt,
        },
      });

      return result.count === 1;
    },
  };
}
