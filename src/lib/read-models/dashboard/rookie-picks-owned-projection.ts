import { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { RookiePicksOwnedProjection } from "@/lib/read-models/dashboard/types";
import { prisma } from "@/lib/prisma";

export function createRookiePicksOwnedProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      teamId: string;
      horizonYears?: number;
      now?: Date;
    }): Promise<RookiePicksOwnedProjection | null> {
      const now = input.now ?? new Date();
      const horizonYears = Math.max(0, input.horizonYears ?? 2);

      const [league, season, team] = await Promise.all([
        client.league.findUnique({
          where: { id: input.leagueId },
          select: {
            id: true,
            name: true,
          },
        }),
        client.season.findUnique({
          where: { id: input.seasonId },
          select: {
            id: true,
            leagueId: true,
            year: true,
          },
        }),
        client.team.findUnique({
          where: { id: input.teamId },
          select: {
            id: true,
            leagueId: true,
            name: true,
            abbreviation: true,
          },
        }),
      ]);

      if (!league || !season || !team || season.leagueId !== league.id || team.leagueId !== league.id) {
        return null;
      }

      const endYear = season.year + horizonYears;
      const picks = await client.futurePick.findMany({
        where: {
          leagueId: league.id,
          currentTeamId: team.id,
          isUsed: false,
          seasonYear: {
            gte: season.year,
            lte: endYear,
          },
        },
        orderBy: [{ seasonYear: "asc" }, { round: "asc" }, { overall: "asc" }],
        select: {
          id: true,
          seasonYear: true,
          round: true,
          overall: true,
          originalTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      });

      const seasonMap = new Map<
        number,
        Map<
          number,
          {
            id: string;
            overall: number | null;
            originalTeam: {
              id: string;
              name: string;
              abbreviation: string | null;
            };
          }[]
        >
      >();

      for (const pick of picks) {
        const rounds = seasonMap.get(pick.seasonYear) ?? new Map();
        const roundPicks = rounds.get(pick.round) ?? [];
        roundPicks.push({
          id: pick.id,
          overall: pick.overall,
          originalTeam: pick.originalTeam,
        });
        rounds.set(pick.round, roundPicks);
        seasonMap.set(pick.seasonYear, rounds);
      }

      const seasons = Array.from(seasonMap.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([seasonYear, rounds]) => {
          const normalizedRounds = Array.from(rounds.entries())
            .sort((left, right) => left[0] - right[0])
            .map(([round, roundPicks]) => ({
              round,
              picks: roundPicks,
            }));

          return {
            seasonYear,
            totalCount: normalizedRounds.reduce((total, round) => total + round.picks.length, 0),
            rounds: normalizedRounds,
          };
        });

      return {
        league: {
          id: league.id,
          name: league.name,
        },
        team: {
          id: team.id,
          name: team.name,
          abbreviation: team.abbreviation,
        },
        seasonWindow: {
          startYear: season.year,
          endYear,
        },
        seasons,
        generatedAt: now.toISOString(),
      };
    },
  };
}
