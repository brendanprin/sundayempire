import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreatePlayerSeasonSnapshotInput,
  PlayerRepositoriesDbClient,
} from "@/lib/repositories/player/types";

export const playerSeasonSnapshotInclude =
  Prisma.validator<Prisma.PlayerSeasonSnapshotInclude>()({
    player: {
      select: {
        id: true,
        name: true,
        displayName: true,
        position: true,
        nflTeam: true,
      },
    },
    refreshJob: {
      select: {
        id: true,
        adapterKey: true,
        status: true,
        createdAt: true,
      },
    },
  });

export type PlayerSeasonSnapshotRecord = Prisma.PlayerSeasonSnapshotGetPayload<{
  include: typeof playerSeasonSnapshotInclude;
}>;

export function createPlayerSeasonSnapshotRepository(
  client: PlayerRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreatePlayerSeasonSnapshotInput) {
      return client.playerSeasonSnapshot.create({
        data: {
          playerId: input.playerId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          refreshJobId: input.refreshJobId ?? null,
          sourceKey: input.sourceKey ?? null,
          sourcePlayerId: input.sourcePlayerId ?? null,
          externalId: input.externalId ?? null,
          name: input.name,
          displayName: input.displayName,
          searchName: input.searchName,
          position: input.position,
          nflTeam: input.nflTeam ?? null,
          age: input.age ?? null,
          yearsPro: input.yearsPro ?? null,
          injuryStatus: input.injuryStatus ?? null,
          statusCode: input.statusCode ?? null,
          statusText: input.statusText ?? null,
          isRestricted: input.isRestricted ?? false,
          capturedAt: input.capturedAt ?? new Date(),
        },
        include: playerSeasonSnapshotInclude,
      });
    },

    listBySeason(input: {
      leagueId: string;
      seasonId: string;
      playerId?: string | null;
      refreshJobId?: string | null;
    }) {
      return client.playerSeasonSnapshot.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          ...(input.playerId ? { playerId: input.playerId } : {}),
          ...(input.refreshJobId ? { refreshJobId: input.refreshJobId } : {}),
        },
        include: playerSeasonSnapshotInclude,
        orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
      });
    },
  };
}
