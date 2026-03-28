import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreatePlayerRefreshJobInput,
  PlayerRepositoriesDbClient,
  UpdatePlayerRefreshJobInput,
} from "@/lib/repositories/player/types";

export const playerRefreshJobInclude =
  Prisma.validator<Prisma.PlayerRefreshJobInclude>()({
    requestedByUser: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
    _count: {
      select: {
        changes: true,
        snapshots: true,
      },
    },
  });

export type PlayerRefreshJobRecord = Prisma.PlayerRefreshJobGetPayload<{
  include: typeof playerRefreshJobInclude;
}>;

function nullableJson(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ?? Prisma.DbNull;
}

export function createPlayerRefreshJobRepository(
  client: PlayerRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreatePlayerRefreshJobInput) {
      return client.playerRefreshJob.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          requestedByUserId: input.requestedByUserId ?? null,
          adapterKey: input.adapterKey,
          sourceLabel: input.sourceLabel ?? null,
          status: input.status ?? "PENDING",
          startedAt: input.startedAt ?? null,
          completedAt: input.completedAt ?? null,
          payloadDigest: input.payloadDigest ?? null,
          inputJson: nullableJson(input.inputJson),
          summaryJson: nullableJson(input.summaryJson),
          errorJson: nullableJson(input.errorJson),
        },
        include: playerRefreshJobInclude,
      });
    },

    findById(jobId: string) {
      return client.playerRefreshJob.findUnique({
        where: {
          id: jobId,
        },
        include: playerRefreshJobInclude,
      });
    },

    listByLeague(input: {
      leagueId: string;
      seasonId?: string | null;
      statuses?: PlayerRefreshJobRecord["status"][];
    }) {
      return client.playerRefreshJob.findMany({
        where: {
          leagueId: input.leagueId,
          ...(input.seasonId ? { seasonId: input.seasonId } : {}),
          ...(input.statuses && input.statuses.length > 0
            ? {
                status: {
                  in: input.statuses,
                },
              }
            : {}),
        },
        include: playerRefreshJobInclude,
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
      });
    },

    update(jobId: string, input: UpdatePlayerRefreshJobInput) {
      return client.playerRefreshJob.update({
        where: {
          id: jobId,
        },
        data: {
          requestedByUserId: input.requestedByUserId,
          adapterKey: input.adapterKey,
          sourceLabel: input.sourceLabel,
          status: input.status,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          payloadDigest: input.payloadDigest,
          inputJson: nullableJson(input.inputJson),
          summaryJson: nullableJson(input.summaryJson),
          errorJson: nullableJson(input.errorJson),
        },
        include: playerRefreshJobInclude,
      });
    },
  };
}
