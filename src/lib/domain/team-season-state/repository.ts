import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TeamSeasonStateDbClient = PrismaClient | Prisma.TransactionClient;

export function createTeamSeasonStateRepository(client: TeamSeasonStateDbClient = prisma) {
  return {
    async upsertState(input: {
      teamId: string;
      seasonId: string;
      rosterCount: number;
      activeCapTotal: number;
      deadCapTotal: number;
      hardCapTotal: number;
      complianceStatus?: string | null;
      lastRecalculatedAt: Date;
    }) {
      return client.teamSeasonState.upsert({
        where: {
          teamId_seasonId: {
            teamId: input.teamId,
            seasonId: input.seasonId,
          },
        },
        update: {
          rosterCount: input.rosterCount,
          activeCapTotal: input.activeCapTotal,
          deadCapTotal: input.deadCapTotal,
          hardCapTotal: input.hardCapTotal,
          complianceStatus: input.complianceStatus ?? null,
          lastRecalculatedAt: input.lastRecalculatedAt,
        },
        create: {
          teamId: input.teamId,
          seasonId: input.seasonId,
          rosterCount: input.rosterCount,
          activeCapTotal: input.activeCapTotal,
          deadCapTotal: input.deadCapTotal,
          hardCapTotal: input.hardCapTotal,
          complianceStatus: input.complianceStatus ?? null,
          lastRecalculatedAt: input.lastRecalculatedAt,
        },
      });
    },
  };
}
