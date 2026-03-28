import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LifecycleRepository = ReturnType<typeof createLifecycleRepository>;

export function createLifecycleRepository(client: PrismaClient = prisma) {
  return {
    async getLeagueLifecycleRecord(leagueId: string) {
      const league = await client.league.findUnique({
        where: { id: leagueId },
        select: {
          id: true,
          name: true,
          seasons: {
            orderBy: { year: "desc" },
            select: {
              id: true,
              year: true,
              status: true,
              phase: true,
              openedAt: true,
              closedAt: true,
            },
          },
        },
      });

      if (!league) {
        return null;
      }

      return league;
    },
    async getSeasonDeadlines(leagueId: string, seasonId: string) {
      return client.leagueDeadline.findMany({
        where: {
          leagueId,
          seasonId,
        },
        orderBy: [
          { scheduledAt: "asc" },
          { createdAt: "asc" },
        ],
      });
    },
    async getRecentPhaseTransitions(leagueId: string, seasonId: string) {
      return client.leaguePhaseTransition.findMany({
        where: {
          leagueId,
          seasonId,
        },
        orderBy: [
          { occurredAt: "desc" },
          { createdAt: "desc" },
        ],
        take: 5,
      });
    },
  };
}
