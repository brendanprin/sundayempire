import { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { ActivitySummaryProjection } from "@/lib/read-models/dashboard/types";
import { prisma } from "@/lib/prisma";

export function createActivitySummaryProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      teamId?: string | null;
      limit?: number;
      now?: Date;
    }): Promise<ActivitySummaryProjection> {
      const now = input.now ?? new Date();
      const limit = Math.max(1, input.limit ?? 5);
      const scope = input.teamId ? "team" : "league";

      const [transactions, commissionerNote] = await Promise.all([
        client.transaction.findMany({
          where: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            ...(input.teamId ? { teamId: input.teamId } : {}),
          },
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
          select: {
            id: true,
            type: true,
            summary: true,
            createdAt: true,
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
                position: true,
              },
            },
          },
        }),
        client.commissionerOverride.findFirst({
          where: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            ...(input.teamId
              ? {
                  OR: [{ teamId: input.teamId }, { teamId: null }],
                }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            overrideType: true,
            reason: true,
            createdAt: true,
            team: {
              select: {
                name: true,
              },
            },
            actorUser: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        }),
      ]);

      return {
        scope,
        recentActivity: transactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          summary: transaction.summary,
          createdAt: transaction.createdAt.toISOString(),
          team: transaction.team,
          player: transaction.player,
        })),
        commissionerNote: commissionerNote
          ? {
              id: commissionerNote.id,
              overrideType: commissionerNote.overrideType,
              reason: commissionerNote.reason,
              createdAt: commissionerNote.createdAt.toISOString(),
              actorName: commissionerNote.actorUser?.name ?? null,
              actorEmail: commissionerNote.actorUser?.email ?? null,
              teamName: commissionerNote.team?.name ?? null,
            }
          : null,
        emptyStateReason:
          transactions.length === 0 && !commissionerNote
            ? scope === "team"
              ? "No recent team activity or commissioner notes."
              : "No recent league activity or commissioner notes."
            : null,
        generatedAt: now.toISOString(),
      };
    },
  };
}
