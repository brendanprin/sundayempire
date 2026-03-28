import { DashboardProjectionDbClient, resolveLeagueSeasonContext } from "@/lib/read-models/dashboard/shared";
import { createHostPlatformSyncJobRepository } from "@/lib/repositories/sync/host-platform-sync-job-repository";
import type { SyncJobSummary } from "@/lib/read-models/sync/types";
import { prisma } from "@/lib/prisma";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJobSummary(job: Awaited<ReturnType<ReturnType<typeof createHostPlatformSyncJobRepository>["findById"]>>) {
  if (!job) {
    return null;
  }

  const summary = isRecord(job.summaryJson) ? job.summaryJson : null;

  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    trigger: job.trigger,
    adapterKey: job.adapterKey,
    sourceLabel: job.sourceLabel,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    payloadDigest: job.payloadDigest,
    requestedByUser: job.requestedByUser
      ? {
          id: job.requestedByUser.id,
          email: job.requestedByUser.email,
          name: job.requestedByUser.name,
        }
      : null,
    mismatchCount: job._count.mismatches,
    summary: summary
      ? {
          created: Number(summary.created ?? 0),
          updated: Number(summary.updated ?? 0),
          resolved: Number(summary.resolved ?? 0),
          totalOpen: Number(summary.totalOpen ?? 0),
          totalDetected: Number(summary.totalDetected ?? 0),
          warnings: Array.isArray(summary.warnings) ? summary.warnings.map(String) : [],
          errors: Array.isArray(summary.errors) ? summary.errors.map(String) : [],
          domains: isRecord(summary.domains)
            ? {
                rosterImported: Number(summary.domains.rosterImported ?? 0),
                transactionsImported: Number(summary.domains.transactionsImported ?? 0),
              }
            : {
                rosterImported: 0,
                transactionsImported: 0,
              },
        }
      : null,
  } satisfies SyncJobSummary;
}

export function createSyncJobsProjection(client: DashboardProjectionDbClient = prisma) {
  const repository = createHostPlatformSyncJobRepository(client);

  return {
    async list(input: {
      leagueId: string;
      seasonId?: string;
      statuses?: Array<"PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELED">;
      jobTypes?: Array<"ROSTER_IMPORT" | "TRANSACTION_IMPORT" | "FULL_SYNC">;
    }): Promise<{ league: { id: string; name: string }; season: { id: string; year: number } | null; jobs: SyncJobSummary[] } | null> {
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.league) {
        return null;
      }

      const jobs = await repository.listByLeague({
        leagueId: input.leagueId,
        seasonId: context.season?.id ?? null,
        statuses: input.statuses,
        jobTypes: input.jobTypes,
      });

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: context.season
          ? {
              id: context.season.id,
              year: context.season.year,
            }
          : null,
        jobs: jobs.map((job) => toJobSummary(job)!),
      };
    },

    async read(input: { leagueId: string; jobId: string; seasonId?: string }) {
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.league) {
        return null;
      }

      const job = await repository.findById(input.jobId);
      if (!job || job.leagueId !== input.leagueId) {
        return null;
      }

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: context.season
          ? {
              id: context.season.id,
              year: context.season.year,
            }
          : null,
        job: toJobSummary(job),
      };
    },
  };
}
