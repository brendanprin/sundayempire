import { prisma } from "@/lib/prisma";
import { resolveLeagueSeasonContext, type DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { createSyncMismatchRepository } from "@/lib/repositories/sync/sync-mismatch-repository";
import { createSyncJobsProjection } from "@/lib/read-models/sync/sync-jobs-projection";
import type { SyncIssuesQueueProjection, SyncMismatchSummary } from "@/lib/read-models/sync/types";
import { listSyncProviderAdapters } from "@/lib/domain/sync/adapters/registry";

function toMismatchSummary(
  mismatch: Awaited<ReturnType<ReturnType<typeof createSyncMismatchRepository>["findById"]>>,
): SyncMismatchSummary | null {
  if (!mismatch) {
    return null;
  }

  return {
    id: mismatch.id,
    mismatchType: mismatch.mismatchType,
    severity: mismatch.severity,
    status: mismatch.status,
    title: mismatch.title,
    message: mismatch.message,
    team: mismatch.team
      ? {
          id: mismatch.team.id,
          name: mismatch.team.name,
          abbreviation: mismatch.team.abbreviation,
        }
      : null,
    player: mismatch.player
      ? {
          id: mismatch.player.id,
          name: mismatch.player.name,
          position: mismatch.player.position,
          nflTeam: mismatch.player.nflTeam,
        }
      : null,
    hostPlatformReferenceId: mismatch.hostPlatformReferenceId,
    lastDetectedAt: mismatch.lastDetectedAt.toISOString(),
    detectionCount: mismatch.detectionCount,
    complianceIssueId: mismatch.complianceIssue?.id ?? null,
    job: {
      id: mismatch.job.id,
      jobType: mismatch.job.jobType,
      status: mismatch.job.status,
      createdAt: mismatch.job.createdAt.toISOString(),
    },
  };
}

export function createSyncIssuesQueueProjection(client: DashboardProjectionDbClient = prisma) {
  const mismatchRepository = createSyncMismatchRepository(client);
  const jobsProjection = createSyncJobsProjection(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      status?: string | null;
      severity?: string | null;
      teamId?: string | null;
    }): Promise<SyncIssuesQueueProjection | null> {
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.league || !context.season) {
        return null;
      }

      const [teams, mismatches, jobsPayload] = await Promise.all([
        client.team.findMany({
          where: {
            leagueId: input.leagueId,
          },
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        }),
        mismatchRepository.listForLeague({
          leagueId: input.leagueId,
          seasonId: context.season.id,
          statuses:
            input.status && input.status !== "ALL" ? [input.status as never] : undefined,
          severities:
            input.severity && input.severity !== "ALL" ? [input.severity as never] : undefined,
          teamId: input.teamId && input.teamId !== "ALL" ? input.teamId : null,
        }),
        jobsProjection.list({
          leagueId: input.leagueId,
          seasonId: context.season.id,
        }),
      ]);

      const summaries = mismatches.map((mismatch) => toMismatchSummary(mismatch)).filter(Boolean) as SyncMismatchSummary[];

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: {
          id: context.season.id,
          year: context.season.year,
        },
        filters: {
          status: input.status && input.status !== "ALL" ? input.status : null,
          severity: input.severity && input.severity !== "ALL" ? input.severity : null,
          teamId: input.teamId && input.teamId !== "ALL" ? input.teamId : null,
        },
        summary: {
          openCount: mismatches.filter((mismatch) => mismatch.status === "OPEN").length,
          escalatedCount: mismatches.filter((mismatch) => mismatch.status === "ESCALATED").length,
          highImpactCount: mismatches.filter((mismatch) => mismatch.severity === "HIGH_IMPACT").length,
        },
        teams,
        recentJobs: jobsPayload?.jobs.slice(0, 8) ?? [],
        issues: summaries,
        adapters: listSyncProviderAdapters().map((adapter) => ({
          key: adapter.key,
          label: adapter.label,
        })),
      };
    },
  };
}
