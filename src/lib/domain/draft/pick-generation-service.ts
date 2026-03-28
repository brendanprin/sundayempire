import { DEFAULT_ROOKIE_DRAFT_ROUNDS, DraftDbClient, DraftWarning } from "@/lib/domain/draft/shared";
import { prisma } from "@/lib/prisma";

export function createPickGenerationService(client: DraftDbClient = prisma) {
  return {
    async ensureSupportedSeasonPicks(input: {
      leagueId: string;
      seasonYear: number;
      rounds?: readonly number[];
    }) {
      const rounds = [...(input.rounds ?? DEFAULT_ROOKIE_DRAFT_ROUNDS)].sort((left, right) => left - right);
      const [teams, existingPicks] = await Promise.all([
        client.team.findMany({
          where: {
            leagueId: input.leagueId,
          },
          orderBy: [{ createdAt: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        }),
        client.futurePick.findMany({
          where: {
            leagueId: input.leagueId,
            seasonYear: input.seasonYear,
            round: {
              in: rounds,
            },
          },
          include: {
            originalTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            currentTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
          },
          orderBy: [{ round: "asc" }, { overall: "asc" }, { createdAt: "asc" }],
        }),
      ]);

      const warnings: DraftWarning[] = [];
      const existingKeys = new Set(
        existingPicks.map((pick) => `${pick.round}:${pick.originalTeamId}`),
      );
      const createRows: Array<{
        leagueId: string;
        seasonYear: number;
        round: number;
        overall: number | null;
        originalTeamId: string;
        currentTeamId: string;
        isUsed: boolean;
      }> = [];

      for (const round of rounds) {
        const roundExisting = existingPicks.filter((pick) => pick.round === round);
        const canAssignOverall = roundExisting.length === 0;

        if (roundExisting.some((pick) => pick.overall === null)) {
          warnings.push({
            code: `MISSING_PICK_OVERALL_ROUND_${round}`,
            message: `Round ${round} future-pick order is incomplete, so rookie draft order may need commissioner review.`,
          });
        }

        if (roundExisting.length > 0 && roundExisting.length < teams.length) {
          warnings.push({
            code: `PARTIAL_PICK_SET_ROUND_${round}`,
            message: `Round ${round} was only partially seeded. Missing picks were generated with safe fallback ordering.`,
          });
        }

        for (const [index, team] of teams.entries()) {
          const key = `${round}:${team.id}`;
          if (existingKeys.has(key)) {
            continue;
          }

          createRows.push({
            leagueId: input.leagueId,
            seasonYear: input.seasonYear,
            round,
            overall: canAssignOverall ? (round - 1) * teams.length + index + 1 : null,
            originalTeamId: team.id,
            currentTeamId: team.id,
            isUsed: false,
          });
        }
      }

      if (createRows.length > 0) {
        await client.futurePick.createMany({
          data: createRows,
        });
      }

      const picks = await client.futurePick.findMany({
        where: {
          leagueId: input.leagueId,
          seasonYear: input.seasonYear,
          round: {
            in: rounds,
          },
        },
        include: {
          originalTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          currentTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
        orderBy: [{ round: "asc" }, { overall: "asc" }, { createdAt: "asc" }],
      });

      return {
        picks,
        createdCount: createRows.length,
        warnings,
      };
    },
  };
}

