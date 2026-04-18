import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreatePlayerRefreshChangeInput,
  PlayerRepositoriesDbClient,
  UpdatePlayerRefreshChangeInput,
} from "@/lib/repositories/player/types";

export const playerRefreshChangeInclude =
  Prisma.validator<Prisma.PlayerRefreshChangeInclude>()({
    job: {
      select: {
        id: true,
        adapterKey: true,
        status: true,
        createdAt: true,
      },
    },
    player: {
      select: {
        id: true,
        name: true,
        displayName: true,
        position: true,
        nflTeam: true,
      },
    },
    reviewedByUser: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
  });

export type PlayerRefreshChangeRecord = Prisma.PlayerRefreshChangeGetPayload<{
  include: typeof playerRefreshChangeInclude;
}>;

function nullableJson(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ?? Prisma.DbNull;
}

export function createPlayerRefreshChangeRepository(
  client: PlayerRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreatePlayerRefreshChangeInput) {
      return client.playerRefreshChange.create({
        data: {
          jobId: input.jobId,
          playerId: input.playerId ?? null,
          changeType: input.changeType,
          reviewStatus: input.reviewStatus ?? "PENDING",
          fieldMaskJson: nullableJson(input.fieldMaskJson),
          previousValuesJson: nullableJson(input.previousValuesJson),
          incomingValuesJson: nullableJson(input.incomingValuesJson),
          appliedValuesJson: nullableJson(input.appliedValuesJson),
          notes: input.notes ?? null,
          reviewedAt: input.reviewedAt ?? null,
          reviewedByUserId: input.reviewedByUserId ?? null,
        },
        include: playerRefreshChangeInclude,
      });
    },

    listForJob(jobId: string) {
      return client.playerRefreshChange.findMany({
        where: {
          jobId,
        },
        include: playerRefreshChangeInclude,
        orderBy: [{ createdAt: "asc" }],
      });
    },

    findById(changeId: string) {
      return client.playerRefreshChange.findUnique({
        where: {
          id: changeId,
        },
        include: playerRefreshChangeInclude,
      });
    },

    update(changeId: string, input: UpdatePlayerRefreshChangeInput) {
      return client.playerRefreshChange.update({
        where: {
          id: changeId,
        },
        data: {
          playerId: input.playerId,
          changeType: input.changeType,
          reviewStatus: input.reviewStatus,
          fieldMaskJson: nullableJson(input.fieldMaskJson),
          previousValuesJson: nullableJson(input.previousValuesJson),
          incomingValuesJson: nullableJson(input.incomingValuesJson),
          appliedValuesJson: nullableJson(input.appliedValuesJson),
          notes: input.notes,
          reviewedAt: input.reviewedAt,
          reviewedByUserId: input.reviewedByUserId,
        },
        include: playerRefreshChangeInclude,
      });
    },
  };
}
