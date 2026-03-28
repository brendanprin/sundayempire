import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createSyncMismatchRepository } from "@/lib/repositories/sync/sync-mismatch-repository";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";
import { createRosterAssignmentRepository } from "@/lib/domain/roster-assignment/repository";

type SyncResolutionDbClient = PrismaClient | Prisma.TransactionClient;

export function createSyncResolutionService(client: SyncResolutionDbClient = prisma) {
  const mismatchRepository = createSyncMismatchRepository(client);
  const rosterAssignmentRepository = createRosterAssignmentRepository(client);
  const complianceIssueService = createComplianceIssueService(client);

  return {
    async resolve(input: {
      mismatchId: string;
      resolutionType: "ACCEPT_HOST_PLATFORM" | "KEEP_DYNASTY_TRUTH" | "DISMISS_FALSE_POSITIVE";
      resolutionReason?: string | null;
      actorUserId?: string | null;
      actor?: {
        email: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      } | null;
    }) {
      const mismatch = await mismatchRepository.findById(input.mismatchId);
      if (!mismatch) {
        throw new Error("SYNC_MISMATCH_NOT_FOUND");
      }

      if (mismatch.status !== "OPEN") {
        throw new Error("SYNC_MISMATCH_STATE_CONFLICT");
      }

      // Safe Sprint 10 side effect only: attach host reference when accepting host truth.
      if (
        input.resolutionType === "ACCEPT_HOST_PLATFORM" &&
        mismatch.rosterAssignmentId &&
        mismatch.hostPlatformReferenceId
      ) {
        await rosterAssignmentRepository.updateActiveAssignment({
          id: mismatch.rosterAssignmentId,
          hostPlatformReferenceId: mismatch.hostPlatformReferenceId,
        });
      }

      const resolved = await mismatchRepository.update(mismatch.id, {
        status: "RESOLVED",
        resolutionType: input.resolutionType,
        resolvedAt: new Date(),
        resolvedByUserId: input.actorUserId ?? null,
        resolutionReason: input.resolutionReason?.trim() || null,
      });

      await logTransaction(client, {
        leagueId: mismatch.leagueId,
        seasonId: mismatch.seasonId,
        type: "COMMISSIONER_OVERRIDE",
        teamId: mismatch.teamId ?? null,
        playerId: mismatch.playerId ?? null,
        summary: `Resolved sync mismatch: ${mismatch.title}.`,
        metadata: {
          mismatchId: mismatch.id,
          resolutionType: input.resolutionType,
          resolutionReason: input.resolutionReason?.trim() || null,
        },
        audit: {
          actor: auditActorFromRequestActor(input.actor ?? null),
          source: "sync.resolve",
          entities: {
            syncMismatchId: mismatch.id,
          },
        },
      });

      return resolved;
    },

    async escalateToCompliance(input: {
      mismatchId: string;
      reason?: string | null;
      actorUserId?: string | null;
      actorRoleSnapshot?: CanonicalLeagueRole | null;
      actor?: {
        email: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      } | null;
    }) {
      const mismatch = await mismatchRepository.findById(input.mismatchId);
      if (!mismatch) {
        throw new Error("SYNC_MISMATCH_NOT_FOUND");
      }

      if (mismatch.status !== "OPEN") {
        throw new Error("SYNC_MISMATCH_STATE_CONFLICT");
      }

      if (mismatch.severity !== "HIGH_IMPACT") {
        throw new Error("SYNC_MISMATCH_NOT_ESCALATABLE");
      }

      const issue = await complianceIssueService.createSyncIssue({
        leagueId: mismatch.leagueId,
        seasonId: mismatch.seasonId,
        teamId: mismatch.teamId ?? null,
        playerId: mismatch.playerId ?? null,
        title: mismatch.title,
        message: mismatch.message,
        mismatchId: mismatch.id,
        mismatchType: mismatch.mismatchType,
        fingerprint: mismatch.fingerprint,
        createdByUserId: input.actorUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        metadata: {
          hostValue: mismatch.hostValueJson,
          dynastyValue: mismatch.dynastyValueJson,
          syncMetadata: mismatch.metadataJson,
          resolutionReason: input.reason?.trim() || null,
        } as Prisma.InputJsonValue,
      });

      const updatedMismatch = await mismatchRepository.update(mismatch.id, {
        status: "ESCALATED",
        resolutionType: "ESCALATE_TO_COMPLIANCE",
        complianceIssueId: issue.id,
        resolvedAt: new Date(),
        resolvedByUserId: input.actorUserId ?? null,
        resolutionReason: input.reason?.trim() || null,
      });

      await logTransaction(client, {
        leagueId: mismatch.leagueId,
        seasonId: mismatch.seasonId,
        type: "COMMISSIONER_OVERRIDE",
        teamId: mismatch.teamId ?? null,
        playerId: mismatch.playerId ?? null,
        summary: `Escalated sync mismatch to compliance: ${mismatch.title}.`,
        metadata: {
          mismatchId: mismatch.id,
          complianceIssueId: issue.id,
          reason: input.reason?.trim() || null,
        },
        audit: {
          actor: auditActorFromRequestActor(input.actor ?? null),
          source: "sync.escalate",
          entities: {
            syncMismatchId: mismatch.id,
            complianceIssueId: issue.id,
          },
        },
      });

      return {
        mismatch: updatedMismatch,
        complianceIssueId: issue.id,
      };
    },
  };
}
