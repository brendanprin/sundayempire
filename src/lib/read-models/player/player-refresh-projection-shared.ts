import { prisma } from "@/lib/prisma";
import { getPlayerDirectoryAdapter } from "@/lib/domain/player/adapters/registry";
import { createPlayerRefreshJobRepository } from "@/lib/repositories/player/player-refresh-job-repository";
import type { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import type { PlayerRefreshCountsSummary, PlayerRefreshJobSummary } from "@/lib/read-models/player/player-refresh-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePlayerRefreshSummary(value: unknown): PlayerRefreshCountsSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    new: Number(value.new ?? 0),
    updated: Number(value.updated ?? 0),
    unchanged: Number(value.unchanged ?? 0),
    invalid: Number(value.invalid ?? 0),
    ambiguous: Number(value.ambiguous ?? 0),
    duplicateSuspect: Number(value.duplicateSuspect ?? 0),
    totalSubmitted: Number(value.totalSubmitted ?? 0),
    totalNormalized: Number(value.totalNormalized ?? 0),
    totalProcessed: Number(value.totalProcessed ?? 0),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    errors: Array.isArray(value.errors) ? value.errors.map(String) : [],
  };
}

export function createPlayerRefreshJobSummaryMapper(
  _client: DashboardProjectionDbClient = prisma,
) {
  return function toPlayerRefreshJobSummary(
    job: Awaited<ReturnType<ReturnType<typeof createPlayerRefreshJobRepository>["findById"]>>,
    reviewCounts?: {
      pendingReviewCount?: number;
      appliedReviewCount?: number;
      rejectedReviewCount?: number;
    },
  ): PlayerRefreshJobSummary | null {
    if (!job) {
      return null;
    }

    const adapter = getPlayerDirectoryAdapter(job.adapterKey);

    return {
      id: job.id,
      status: job.status,
      adapterKey: job.adapterKey,
      adapterLabel: adapter?.label ?? job.adapterKey,
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
      changeCount: job._count.changes,
      snapshotCount: job._count.snapshots,
      pendingReviewCount: reviewCounts?.pendingReviewCount ?? 0,
      appliedReviewCount: reviewCounts?.appliedReviewCount ?? 0,
      rejectedReviewCount: reviewCounts?.rejectedReviewCount ?? 0,
      summary: parsePlayerRefreshSummary(job.summaryJson),
    };
  };
}
