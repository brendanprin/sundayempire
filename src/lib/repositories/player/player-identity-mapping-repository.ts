import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreatePlayerIdentityMappingInput,
  PlayerRepositoriesDbClient,
  UpdatePlayerIdentityMappingInput,
} from "@/lib/repositories/player/types";

export const playerIdentityMappingInclude =
  Prisma.validator<Prisma.PlayerIdentityMappingInclude>()({
    player: {
      select: {
        id: true,
        name: true,
        displayName: true,
        searchName: true,
        position: true,
        nflTeam: true,
        externalId: true,
        sourceKey: true,
        sourcePlayerId: true,
      },
    },
    approvedByUser: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
  });

export type PlayerIdentityMappingRecord = Prisma.PlayerIdentityMappingGetPayload<{
  include: typeof playerIdentityMappingInclude;
}>;

export function createPlayerIdentityMappingRepository(
  client: PlayerRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreatePlayerIdentityMappingInput) {
      return client.playerIdentityMapping.create({
        data: {
          playerId: input.playerId,
          sourceKey: input.sourceKey,
          sourcePlayerId: input.sourcePlayerId,
          approvedByUserId: input.approvedByUserId ?? null,
          notes: input.notes ?? null,
          approvedAt: input.approvedAt ?? new Date(),
        },
        include: playerIdentityMappingInclude,
      });
    },

    findBySourceIdentity(input: { sourceKey: string; sourcePlayerId: string }) {
      return client.playerIdentityMapping.findUnique({
        where: {
          sourceKey_sourcePlayerId: {
            sourceKey: input.sourceKey,
            sourcePlayerId: input.sourcePlayerId,
          },
        },
        include: playerIdentityMappingInclude,
      });
    },

    listAll() {
      return client.playerIdentityMapping.findMany({
        include: playerIdentityMappingInclude,
        orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    update(mappingId: string, input: UpdatePlayerIdentityMappingInput) {
      return client.playerIdentityMapping.update({
        where: {
          id: mappingId,
        },
        data: {
          playerId: input.playerId,
          sourceKey: input.sourceKey,
          sourcePlayerId: input.sourcePlayerId,
          approvedByUserId: input.approvedByUserId,
          notes: input.notes,
          approvedAt: input.approvedAt ?? undefined,
        },
        include: playerIdentityMappingInclude,
      });
    },
  };
}
