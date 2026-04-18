import { prisma } from "@/lib/prisma";
import type { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { createPlayerRefreshChangeRepository } from "@/lib/repositories/player/player-refresh-change-repository";
import { createPlayerRefreshJobRepository } from "@/lib/repositories/player/player-refresh-job-repository";
import {
  createPlayerRefreshJobSummaryMapper,
  isRecord,
  parsePlayerRefreshSummary,
} from "@/lib/read-models/player/player-refresh-projection-shared";
import type {
  PlayerRefreshChangeCandidate,
  PlayerRefreshChangeDetail,
  PlayerRefreshJobDetailProjection,
} from "@/lib/read-models/player/player-refresh-types";

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function extractCandidatePlayerIds(input: {
  playerId: string | null;
  appliedValuesJson: unknown;
}) {
  const ids = new Set<string>();

  if (input.playerId) {
    ids.add(input.playerId);
  }

  if (!isRecord(input.appliedValuesJson)) {
    return [...ids];
  }

  const matchedPlayerId =
    typeof input.appliedValuesJson.matchedPlayerId === "string"
      ? input.appliedValuesJson.matchedPlayerId
      : null;
  if (matchedPlayerId) {
    ids.add(matchedPlayerId);
  }

  for (const candidateId of parseStringArray(input.appliedValuesJson.candidatePlayerIds)) {
    ids.add(candidateId);
  }

  for (const conflictId of parseStringArray(input.appliedValuesJson.conflictingPlayerIds)) {
    ids.add(conflictId);
  }

  return [...ids];
}

function buildSourceIdentity(incomingValuesJson: unknown) {
  if (!isRecord(incomingValuesJson)) {
    return null;
  }

  return {
    sourceKey:
      typeof incomingValuesJson.sourceKey === "string" ? incomingValuesJson.sourceKey : null,
    sourcePlayerId:
      typeof incomingValuesJson.sourcePlayerId === "string"
        ? incomingValuesJson.sourcePlayerId
        : null,
    externalId:
      typeof incomingValuesJson.externalId === "string" ? incomingValuesJson.externalId : null,
  };
}

function canResolveChange(change: {
  reviewStatus: string;
  changeType: string;
  incomingValuesJson: unknown;
}) {
  if (change.reviewStatus !== "PENDING") {
    return false;
  }

  if (change.changeType !== "AMBIGUOUS" && change.changeType !== "DUPLICATE_SUSPECT") {
    return false;
  }

  if (!isRecord(change.incomingValuesJson)) {
    return false;
  }

  return (
    typeof change.incomingValuesJson.name === "string" &&
    typeof change.incomingValuesJson.position === "string"
  );
}

function buildChangeDetail(
  change: Awaited<ReturnType<ReturnType<typeof createPlayerRefreshChangeRepository>["findById"]>>,
  playerCandidatesById: Map<string, PlayerRefreshChangeCandidate>,
): PlayerRefreshChangeDetail | null {
  if (!change) {
    return null;
  }

  const candidatePlayerIds = extractCandidatePlayerIds({
    playerId: change.player?.id ?? null,
    appliedValuesJson: change.appliedValuesJson,
  });

  return {
    id: change.id,
    changeType: change.changeType,
    reviewStatus: change.reviewStatus,
    notes: change.notes,
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString(),
    reviewedAt: change.reviewedAt?.toISOString() ?? null,
    fieldMask: parseStringArray(change.fieldMaskJson),
    sourceIdentity: buildSourceIdentity(change.incomingValuesJson),
    player: change.player
      ? {
          id: change.player.id,
          name: change.player.name,
          displayName: change.player.displayName,
          position: change.player.position,
          nflTeam: change.player.nflTeam,
        }
      : null,
    reviewedByUser: change.reviewedByUser
      ? {
          id: change.reviewedByUser.id,
          email: change.reviewedByUser.email,
          name: change.reviewedByUser.name,
        }
      : null,
    previousValues: isRecord(change.previousValuesJson) ? change.previousValuesJson : null,
    incomingValues: isRecord(change.incomingValuesJson) ? change.incomingValuesJson : null,
    appliedValues: isRecord(change.appliedValuesJson) ? change.appliedValuesJson : null,
    candidatePlayers: candidatePlayerIds
      .map((id) => playerCandidatesById.get(id))
      .filter(Boolean) as PlayerRefreshChangeCandidate[],
    permissions: {
      canResolve: canResolveChange(change),
      canReject: change.reviewStatus === "PENDING",
    },
  };
}

export function createPlayerRefreshJobDetailProjection(
  client: DashboardProjectionDbClient = prisma,
) {
  const jobRepository = createPlayerRefreshJobRepository(client);
  const changeRepository = createPlayerRefreshChangeRepository(client);
  const toJobSummary = createPlayerRefreshJobSummaryMapper(client);

  return {
    async read(input: {
      jobId: string;
    }): Promise<PlayerRefreshJobDetailProjection | null> {
      const job = await jobRepository.findById(input.jobId);
      if (!job) {
        return null;
      }

      const changes = await changeRepository.listForJob(job.id);
      const candidatePlayerIds = new Set<string>();
      for (const change of changes) {
        for (const candidateId of extractCandidatePlayerIds({
          playerId: change.player?.id ?? null,
          appliedValuesJson: change.appliedValuesJson,
        })) {
          candidatePlayerIds.add(candidateId);
        }
      }

      const candidatePlayers =
        candidatePlayerIds.size > 0
          ? await client.player.findMany({
              where: {
                id: {
                  in: [...candidatePlayerIds],
                },
              },
              select: {
                id: true,
                name: true,
                displayName: true,
                position: true,
                nflTeam: true,
                externalId: true,
                sourceKey: true,
                sourcePlayerId: true,
                isRestricted: true,
              },
              orderBy: [{ name: "asc" }],
            })
          : [];

      const playerCandidatesById = new Map<string, PlayerRefreshChangeCandidate>(
        candidatePlayers.map((player) => [
          player.id,
          {
            id: player.id,
            name: player.name,
            displayName: player.displayName,
            position: player.position,
            nflTeam: player.nflTeam,
            externalId: player.externalId,
            sourceKey: player.sourceKey,
            sourcePlayerId: player.sourcePlayerId,
            isRestricted: player.isRestricted,
          },
        ]),
      );

      const detailedChanges = changes
        .map((change) => buildChangeDetail(change, playerCandidatesById))
        .filter(Boolean) as PlayerRefreshChangeDetail[];

      const pending = detailedChanges.filter((change) => change.reviewStatus === "PENDING");
      const applied = detailedChanges.filter(
        (change) => change.reviewStatus === "APPLIED" || change.reviewStatus === "APPROVED",
      );
      const rejected = detailedChanges.filter((change) => change.reviewStatus === "REJECTED");

      const jobSummary = toJobSummary(job, {
        pendingReviewCount: pending.length,
        appliedReviewCount: applied.length,
        rejectedReviewCount: rejected.length,
      });
      if (!jobSummary) {
        return null;
      }

      const baseSummary = parsePlayerRefreshSummary(job.summaryJson) ?? {
        new: 0,
        updated: 0,
        unchanged: 0,
        invalid: 0,
        ambiguous: 0,
        duplicateSuspect: 0,
        totalSubmitted: 0,
        totalNormalized: 0,
        totalProcessed: 0,
        warnings: [],
        errors: [],
      };

      return {
        job: jobSummary,
        summary: {
          ...baseSummary,
          pendingReviewCount: pending.length,
          appliedReviewCount: applied.length,
          rejectedReviewCount: rejected.length,
        },
        groups: [
          {
            id: "pending",
            label: "Pending Review",
            description: "Rows that still require explicit commissioner action before full trust.",
            changes: pending,
          },
          {
            id: "applied",
            label: "Applied Results",
            description: "Rows already applied by the refresh pipeline or a later commissioner review.",
            changes: applied,
          },
          {
            id: "rejected",
            label: "Rejected Changes",
            description: "Rows intentionally rejected or dismissed during review.",
            changes: rejected,
          },
        ],
      };
    },
  };
}
