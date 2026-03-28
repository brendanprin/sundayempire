import { prisma } from "@/lib/prisma";
import { resolveLeagueSeasonContext, type DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { createSyncMismatchRepository } from "@/lib/repositories/sync/sync-mismatch-repository";
import { createSyncJobsProjection } from "@/lib/read-models/sync/sync-jobs-projection";
import type { SyncIssueDetailProjection } from "@/lib/read-models/sync/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSyncIssueDetailProjection(client: DashboardProjectionDbClient = prisma) {
  const mismatchRepository = createSyncMismatchRepository(client);
  const jobsProjection = createSyncJobsProjection(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      issueId: string;
    }): Promise<SyncIssueDetailProjection | null> {
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.league || !context.season) {
        return null;
      }

      const mismatch = await mismatchRepository.findById(input.issueId);
      if (!mismatch || mismatch.leagueId !== input.leagueId) {
        return null;
      }

      const jobPayload = await jobsProjection.read({
        leagueId: input.leagueId,
        seasonId: context.season.id,
        jobId: mismatch.job.id,
      });

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: {
          id: context.season.id,
          year: context.season.year,
        },
        mismatch: {
          id: mismatch.id,
          mismatchType: mismatch.mismatchType,
          severity: mismatch.severity,
          status: mismatch.status,
          resolutionType: mismatch.resolutionType,
          title: mismatch.title,
          message: mismatch.message,
          fingerprint: mismatch.fingerprint,
          hostPlatformReferenceId: mismatch.hostPlatformReferenceId,
          detectionCount: mismatch.detectionCount,
          firstDetectedAt: mismatch.firstDetectedAt.toISOString(),
          lastDetectedAt: mismatch.lastDetectedAt.toISOString(),
          resolvedAt: mismatch.resolvedAt?.toISOString() ?? null,
          resolutionReason: mismatch.resolutionReason,
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
          rosterAssignment: mismatch.rosterAssignment
            ? {
                id: mismatch.rosterAssignment.id,
                teamId: mismatch.rosterAssignment.teamId,
                seasonId: mismatch.rosterAssignment.seasonId,
                playerId: mismatch.rosterAssignment.playerId,
                rosterStatus: mismatch.rosterAssignment.rosterStatus,
                hostPlatformReferenceId: mismatch.rosterAssignment.hostPlatformReferenceId,
              }
            : null,
          complianceIssue: mismatch.complianceIssue
            ? {
                id: mismatch.complianceIssue.id,
                source: mismatch.complianceIssue.source,
                issueType: mismatch.complianceIssue.issueType,
                severity: mismatch.complianceIssue.severity,
                status: mismatch.complianceIssue.status,
                code: mismatch.complianceIssue.code,
                title: mismatch.complianceIssue.title,
              }
            : null,
          resolvedByUser: mismatch.resolvedByUser
            ? {
                id: mismatch.resolvedByUser.id,
                email: mismatch.resolvedByUser.email,
                name: mismatch.resolvedByUser.name,
              }
            : null,
          hostValue: isRecord(mismatch.hostValueJson) ? mismatch.hostValueJson : null,
          dynastyValue: isRecord(mismatch.dynastyValueJson) ? mismatch.dynastyValueJson : null,
          metadata: isRecord(mismatch.metadataJson) ? mismatch.metadataJson : null,
        },
        job: jobPayload?.job ?? null,
        permissions: {
          canResolve: mismatch.status === "OPEN",
          canEscalate: mismatch.status === "OPEN" && mismatch.severity === "HIGH_IMPACT",
        },
      };
    },
  };
}
