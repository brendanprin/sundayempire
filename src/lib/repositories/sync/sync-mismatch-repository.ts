import {
  Prisma,
  type SyncMismatchSeverity,
  type SyncMismatchStatus,
  type SyncMismatchType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateSyncMismatchInput,
  SyncRepositoriesDbClient,
  UpdateSyncMismatchInput,
} from "@/lib/repositories/sync/types";

export const syncMismatchInclude = Prisma.validator<Prisma.SyncMismatchInclude>()({
  job: {
    select: {
      id: true,
      jobType: true,
      status: true,
      trigger: true,
      adapterKey: true,
      createdAt: true,
      completedAt: true,
    },
  },
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
      nflTeam: true,
    },
  },
  rosterAssignment: {
    select: {
      id: true,
      teamId: true,
      seasonId: true,
      playerId: true,
      rosterStatus: true,
      hostPlatformReferenceId: true,
    },
  },
  complianceIssue: {
    select: {
      id: true,
      source: true,
      issueType: true,
      severity: true,
      status: true,
      code: true,
      title: true,
    },
  },
  resolvedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
});

export type SyncMismatchRecord = Prisma.SyncMismatchGetPayload<{
  include: typeof syncMismatchInclude;
}>;

function nullableJson(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ?? Prisma.DbNull;
}

export function createSyncMismatchRepository(
  client: SyncRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreateSyncMismatchInput) {
      return client.syncMismatch.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          jobId: input.jobId,
          teamId: input.teamId ?? null,
          playerId: input.playerId ?? null,
          rosterAssignmentId: input.rosterAssignmentId ?? null,
          complianceIssueId: input.complianceIssueId ?? null,
          mismatchType: input.mismatchType,
          severity: input.severity,
          status: input.status ?? "OPEN",
          resolutionType: input.resolutionType ?? null,
          fingerprint: input.fingerprint,
          title: input.title,
          message: input.message,
          hostPlatformReferenceId: input.hostPlatformReferenceId ?? null,
          hostValueJson: nullableJson(input.hostValueJson),
          dynastyValueJson: nullableJson(input.dynastyValueJson),
          metadataJson: nullableJson(input.metadataJson),
          detectionCount: input.detectionCount ?? 1,
          firstDetectedAt: input.firstDetectedAt ?? new Date(),
          lastDetectedAt: input.lastDetectedAt ?? new Date(),
          resolvedAt: input.resolvedAt ?? null,
          resolvedByUserId: input.resolvedByUserId ?? null,
          resolutionReason: input.resolutionReason ?? null,
        },
        include: syncMismatchInclude,
      });
    },

    findById(mismatchId: string) {
      return client.syncMismatch.findUnique({
        where: {
          id: mismatchId,
        },
        include: syncMismatchInclude,
      });
    },

    findOpenByFingerprint(input: { leagueId: string; fingerprint: string }) {
      return client.syncMismatch.findFirst({
        where: {
          leagueId: input.leagueId,
          fingerprint: input.fingerprint,
          status: "OPEN",
        },
        include: syncMismatchInclude,
      });
    },

    findLatestByFingerprint(input: { leagueId: string; fingerprint: string }) {
      return client.syncMismatch.findFirst({
        where: {
          leagueId: input.leagueId,
          fingerprint: input.fingerprint,
        },
        include: syncMismatchInclude,
        orderBy: [{ lastDetectedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    listForLeague(input: {
      leagueId: string;
      seasonId?: string | null;
      statuses?: SyncMismatchStatus[];
      severities?: SyncMismatchSeverity[];
      mismatchTypes?: SyncMismatchType[];
      teamId?: string | null;
      jobId?: string | null;
    }) {
      return client.syncMismatch.findMany({
        where: {
          leagueId: input.leagueId,
          ...(input.seasonId ? { seasonId: input.seasonId } : {}),
          ...(input.teamId ? { teamId: input.teamId } : {}),
          ...(input.jobId ? { jobId: input.jobId } : {}),
          ...(input.statuses && input.statuses.length > 0
            ? {
                status: {
                  in: input.statuses,
                },
              }
            : {}),
          ...(input.severities && input.severities.length > 0
            ? {
                severity: {
                  in: input.severities,
                },
              }
            : {}),
          ...(input.mismatchTypes && input.mismatchTypes.length > 0
            ? {
                mismatchType: {
                  in: input.mismatchTypes,
                },
              }
            : {}),
        },
        include: syncMismatchInclude,
        orderBy: [{ lastDetectedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    listForJob(jobId: string) {
      return client.syncMismatch.findMany({
        where: {
          jobId,
        },
        include: syncMismatchInclude,
        orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    update(mismatchId: string, input: UpdateSyncMismatchInput) {
      return client.syncMismatch.update({
        where: {
          id: mismatchId,
        },
        data: {
          teamId: input.teamId,
          playerId: input.playerId,
          rosterAssignmentId: input.rosterAssignmentId,
          complianceIssueId: input.complianceIssueId,
          mismatchType: input.mismatchType,
          severity: input.severity,
          status: input.status,
          resolutionType: input.resolutionType,
          fingerprint: input.fingerprint,
          title: input.title,
          message: input.message,
          hostPlatformReferenceId: input.hostPlatformReferenceId,
          hostValueJson: nullableJson(input.hostValueJson),
          dynastyValueJson: nullableJson(input.dynastyValueJson),
          metadataJson: nullableJson(input.metadataJson),
          detectionCount: input.detectionCount,
          firstDetectedAt: input.firstDetectedAt,
          lastDetectedAt: input.lastDetectedAt,
          resolvedAt: input.resolvedAt,
          resolvedByUserId: input.resolvedByUserId,
          resolutionReason: input.resolutionReason,
        },
        include: syncMismatchInclude,
      });
    },
  };
}
