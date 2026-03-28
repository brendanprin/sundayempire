import { Prisma, type HostPlatformSyncJobStatus, type HostPlatformSyncJobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateHostPlatformSyncJobInput,
  SyncRepositoriesDbClient,
  UpdateHostPlatformSyncJobInput,
} from "@/lib/repositories/sync/types";

export const hostPlatformSyncJobInclude =
  Prisma.validator<Prisma.HostPlatformSyncJobInclude>()({
    requestedByUser: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
    _count: {
      select: {
        mismatches: true,
      },
    },
  });

export type HostPlatformSyncJobRecord = Prisma.HostPlatformSyncJobGetPayload<{
  include: typeof hostPlatformSyncJobInclude;
}>;

function nullableJson(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ?? Prisma.DbNull;
}

export function createHostPlatformSyncJobRepository(
  client: SyncRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreateHostPlatformSyncJobInput) {
      return client.hostPlatformSyncJob.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          requestedByUserId: input.requestedByUserId ?? null,
          jobType: input.jobType,
          status: input.status ?? "PENDING",
          trigger: input.trigger,
          adapterKey: input.adapterKey,
          sourceLabel: input.sourceLabel ?? null,
          sourceSnapshotAt: input.sourceSnapshotAt ?? null,
          startedAt: input.startedAt ?? null,
          completedAt: input.completedAt ?? null,
          payloadDigest: input.payloadDigest ?? null,
          inputJson: nullableJson(input.inputJson),
          summaryJson: nullableJson(input.summaryJson),
          errorJson: nullableJson(input.errorJson),
        },
        include: hostPlatformSyncJobInclude,
      });
    },

    findById(jobId: string) {
      return client.hostPlatformSyncJob.findUnique({
        where: {
          id: jobId,
        },
        include: hostPlatformSyncJobInclude,
      });
    },

    listByLeague(input: {
      leagueId: string;
      seasonId?: string | null;
      statuses?: HostPlatformSyncJobStatus[];
      jobTypes?: HostPlatformSyncJobType[];
    }) {
      return client.hostPlatformSyncJob.findMany({
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
          ...(input.jobTypes && input.jobTypes.length > 0
            ? {
                jobType: {
                  in: input.jobTypes,
                },
              }
            : {}),
        },
        include: hostPlatformSyncJobInclude,
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
      });
    },

    update(jobId: string, input: UpdateHostPlatformSyncJobInput) {
      return client.hostPlatformSyncJob.update({
        where: {
          id: jobId,
        },
        data: {
          requestedByUserId: input.requestedByUserId,
          status: input.status,
          trigger: input.trigger,
          adapterKey: input.adapterKey,
          sourceLabel: input.sourceLabel,
          sourceSnapshotAt: input.sourceSnapshotAt,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          payloadDigest: input.payloadDigest,
          inputJson: nullableJson(input.inputJson),
          summaryJson: nullableJson(input.summaryJson),
          errorJson: nullableJson(input.errorJson),
        },
        include: hostPlatformSyncJobInclude,
      });
    },
  };
}
