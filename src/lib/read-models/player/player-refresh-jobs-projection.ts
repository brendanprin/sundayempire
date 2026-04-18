import { prisma } from "@/lib/prisma";
import { listPlayerDirectoryAdapters } from "@/lib/domain/player/adapters/registry";
import type { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { createPlayerRefreshJobRepository } from "@/lib/repositories/player/player-refresh-job-repository";
import { createPlayerRefreshJobSummaryMapper } from "@/lib/read-models/player/player-refresh-projection-shared";
import type { PlayerRefreshJobsProjection } from "@/lib/read-models/player/player-refresh-types";

export function createPlayerRefreshJobsProjection(client: DashboardProjectionDbClient = prisma) {
  const repository = createPlayerRefreshJobRepository(client);
  const toJobSummary = createPlayerRefreshJobSummaryMapper(client);

  return {
    async list(input: {
      statuses?: Array<"PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELED">;
    } = {}): Promise<PlayerRefreshJobsProjection> {
      const jobs = await repository.list({
        statuses: input.statuses,
      });

      const reviewCounts =
        jobs.length > 0
          ? await client.playerRefreshChange.groupBy({
              by: ["jobId", "reviewStatus"],
              where: {
                jobId: {
                  in: jobs.map((job) => job.id),
                },
              },
              _count: {
                _all: true,
              },
            })
          : [];

      const reviewCountMap = new Map<
        string,
        {
          pendingReviewCount: number;
          appliedReviewCount: number;
          rejectedReviewCount: number;
        }
      >();

      for (const row of reviewCounts) {
        const current = reviewCountMap.get(row.jobId) ?? {
          pendingReviewCount: 0,
          appliedReviewCount: 0,
          rejectedReviewCount: 0,
        };

        if (row.reviewStatus === "PENDING") {
          current.pendingReviewCount = row._count._all;
        } else if (row.reviewStatus === "APPLIED" || row.reviewStatus === "APPROVED") {
          current.appliedReviewCount += row._count._all;
        } else if (row.reviewStatus === "REJECTED") {
          current.rejectedReviewCount += row._count._all;
        }

        reviewCountMap.set(row.jobId, current);
      }

      return {
        adapters: listPlayerDirectoryAdapters().map((adapter) => ({
          key: adapter.key,
          label: adapter.label,
        })),
        jobs: jobs
          .map((job) => toJobSummary(job, reviewCountMap.get(job.id)))
          .filter(Boolean) as PlayerRefreshJobsProjection["jobs"],
      };
    },
  };
}
