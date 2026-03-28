import type {
  PlayerRefreshChangeReviewStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import type { NormalizedPlayerDirectoryRow, PlayerDirectoryImportEnvelope } from "@/lib/domain/player/adapters/types";
import { createPlayerMasterRefreshService, type PlayerMasterRefreshResult } from "@/lib/domain/player/player-master-refresh-service";
import {
  buildAppliedPlayerSummary,
  diffPlayerData,
  normalizeIncomingPlayerData,
  serializePersistedJson,
  type RefreshablePlayerRecord,
} from "@/lib/domain/player/player-master-refresh-shared";
import { normalizePlayerPosition, normalizePlayerSearchName } from "@/lib/domain/player/normalization";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { createPlayerIdentityMappingRepository } from "@/lib/repositories/player/player-identity-mapping-repository";
import { createPlayerRefreshChangeRepository } from "@/lib/repositories/player/player-refresh-change-repository";
import { createPlayerSeasonSnapshotRepository } from "@/lib/repositories/player/player-season-snapshot-repository";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";

type PlayerRefreshReviewDbClient = PrismaClient | Prisma.TransactionClient;

type ReviewActor = {
  email: string;
  leagueRole: CanonicalLeagueRole;
  teamId: string | null;
};

type ReviewAction =
  | {
      type: "APPLY_MAPPING";
      playerId?: string | null;
      restricted?: boolean | null;
      notes?: string | null;
    }
  | {
      type: "REJECT";
      notes?: string | null;
    };

type CommissionerPlayerRefreshDependencies = {
  masterRefreshService?: Pick<ReturnType<typeof createPlayerMasterRefreshService>, "run">;
};

type ResolveChangeResult = {
  changeId: string;
  jobId: string;
  reviewStatus: PlayerRefreshChangeReviewStatus;
  playerId: string | null;
  snapshotId: string | null;
  mappingCreated: boolean;
};

type UpdatePlayerRestrictionResult = {
  playerId: string;
  isRestricted: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNullableString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNullableNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback = false) {
  return typeof record[key] === "boolean" ? Boolean(record[key]) : fallback;
}

function parseIncomingDirectoryRow(value: Prisma.JsonValue | null): NormalizedPlayerDirectoryRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = readNullableString(value, "name");
  const position = readNullableString(value, "position");
  if (!name || !position) {
    return null;
  }

  const displayName = readNullableString(value, "displayName") ?? name;
  const searchName =
    readNullableString(value, "searchName") ?? normalizePlayerSearchName(displayName);

  return {
    sourceKey: readNullableString(value, "sourceKey") ?? "csv-manual",
    sourcePlayerId:
      readNullableString(value, "sourcePlayerId") ??
      readNullableString(value, "externalId") ??
      `review:${normalizePlayerSearchName(displayName).replace(/[^a-z0-9]+/g, "-")}`,
    externalId: readNullableString(value, "externalId"),
    name,
    displayName,
    searchName,
    position: normalizePlayerPosition(position),
    nflTeam: readNullableString(value, "nflTeam"),
    age: readNullableNumber(value, "age"),
    yearsPro: readNullableNumber(value, "yearsPro"),
    injuryStatus: readNullableString(value, "injuryStatus"),
    statusCode: readNullableString(value, "statusCode"),
    statusText: readNullableString(value, "statusText"),
    isRestricted: readBoolean(value, "isRestricted", false),
    raw: isRecord(value.raw) ? value.raw : {},
  };
}

async function runReviewTransaction<T>(
  client: PlayerRefreshReviewDbClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return client.$transaction(callback, {
      maxWait: 10_000,
      timeout: 20_000,
    });
  }

  return callback(client as Prisma.TransactionClient);
}

export function createCommissionerPlayerRefreshService(
  client: PlayerRefreshReviewDbClient = prisma,
  dependencies: CommissionerPlayerRefreshDependencies = {},
) {
  const masterRefreshService =
    dependencies.masterRefreshService ?? createPlayerMasterRefreshService(client);

  return {
    async triggerRefresh(input: {
      leagueId: string;
      seasonId: string;
      adapterKey?: string | null;
      sourceLabel?: string | null;
      requestedByUserId?: string | null;
      payload?: PlayerDirectoryImportEnvelope | null;
      now?: Date;
      actor?: ReviewActor | null;
    }): Promise<PlayerMasterRefreshResult> {
      const result = await masterRefreshService.run({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        adapterKey: input.adapterKey ?? null,
        sourceLabel: input.sourceLabel ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        payload: input.payload ?? null,
        now: input.now,
      });

      await logTransaction(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        type: "COMMISSIONER_OVERRIDE",
        summary: `Triggered player refresh via ${result.job.adapterKey}.`,
        metadata: {
          refreshJobId: result.job.id,
          status: result.job.status,
          adapterKey: result.job.adapterKey,
          summary: result.summary,
        },
        audit: {
          actor: auditActorFromRequestActor(input.actor ?? null),
          source: "player.refresh.trigger",
          entities: {
            refreshJobId: result.job.id,
          },
        },
      });

      return result;
    },

    async resolveChange(input: {
      leagueId: string;
      seasonId: string;
      changeId: string;
      reviewedByUserId: string;
      action: ReviewAction;
      now?: Date;
      actor?: ReviewActor | null;
    }): Promise<ResolveChangeResult> {
      const now = input.now ?? new Date();

      return runReviewTransaction(client, async (tx) => {
        const changeRepository = createPlayerRefreshChangeRepository(tx);
        const mappingRepository = createPlayerIdentityMappingRepository(tx);
        const snapshotRepository = createPlayerSeasonSnapshotRepository(tx);
        const change = await changeRepository.findById(input.changeId);

        if (!change || change.leagueId !== input.leagueId || change.seasonId !== input.seasonId) {
          throw new Error("PLAYER_REFRESH_CHANGE_NOT_FOUND");
        }

        if (change.reviewStatus !== "PENDING") {
          throw new Error("PLAYER_REFRESH_CHANGE_STATE_CONFLICT");
        }

        if (input.action.type === "REJECT") {
          await changeRepository.update(change.id, {
            reviewStatus: "REJECTED",
            notes: input.action.notes ?? change.notes ?? null,
            reviewedAt: now,
            reviewedByUserId: input.reviewedByUserId,
          });

          await logTransaction(tx, {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            type: "COMMISSIONER_OVERRIDE",
            summary: "Rejected player refresh change.",
            playerId: change.player?.id ?? null,
            metadata: {
              refreshJobId: change.job.id,
              changeId: change.id,
              changeType: change.changeType,
              notes: input.action.notes ?? change.notes ?? null,
            },
            audit: {
              actor: auditActorFromRequestActor(input.actor ?? null),
              source: "player.refresh.reject",
              entities: {
                refreshJobId: change.job.id,
                refreshChangeId: change.id,
              },
            },
          });

          return {
            changeId: change.id,
            jobId: change.job.id,
            reviewStatus: "REJECTED",
            playerId: change.player?.id ?? null,
            snapshotId: change.snapshot?.id ?? null,
            mappingCreated: false,
          };
        }

        const incomingRow = parseIncomingDirectoryRow(change.incomingValuesJson);
        if (!incomingRow) {
          throw new Error("PLAYER_REFRESH_CHANGE_NOT_RESOLVABLE");
        }

        const targetPlayerId = input.action.playerId ?? change.player?.id ?? null;
        if (!targetPlayerId) {
          throw new Error("PLAYER_REFRESH_TARGET_REQUIRED");
        }

        const existingPlayer = await tx.player.findUnique({
          where: {
            id: targetPlayerId,
          },
          select: {
            id: true,
            sourceKey: true,
            sourcePlayerId: true,
            externalId: true,
            name: true,
            displayName: true,
            searchName: true,
            position: true,
            nflTeam: true,
            age: true,
            yearsPro: true,
            injuryStatus: true,
            statusCode: true,
            statusText: true,
            isRestricted: true,
          },
        });

        if (!existingPlayer) {
          throw new Error("PLAYER_NOT_FOUND");
        }

        let mappingCreated = false;
        if (incomingRow.sourceKey && incomingRow.sourcePlayerId) {
          const existingMapping = await mappingRepository.findBySourceIdentity({
            sourceKey: incomingRow.sourceKey,
            sourcePlayerId: incomingRow.sourcePlayerId,
          });

          if (existingMapping && existingMapping.playerId !== existingPlayer.id) {
            throw new Error("PLAYER_IDENTITY_MAPPING_CONFLICT");
          }

          if (!existingMapping) {
            await mappingRepository.create({
              playerId: existingPlayer.id,
              sourceKey: incomingRow.sourceKey,
              sourcePlayerId: incomingRow.sourcePlayerId,
              approvedByUserId: input.reviewedByUserId,
              notes: input.action.notes ?? change.notes ?? null,
              approvedAt: now,
            });
            mappingCreated = true;
          }
        }

        const nextPlayerData = normalizeIncomingPlayerData(
          incomingRow,
          existingPlayer as RefreshablePlayerRecord,
          "approved_mapping",
        );
        if (typeof input.action.restricted === "boolean") {
          nextPlayerData.isRestricted = input.action.restricted;
        }

        const diff = diffPlayerData(existingPlayer as RefreshablePlayerRecord, nextPlayerData);
        const persistedPlayer = diff.isChanged
          ? await tx.player.update({
              where: {
                id: existingPlayer.id,
              },
              data: nextPlayerData,
            })
          : existingPlayer;

        const existingSnapshot = await tx.playerSeasonSnapshot.findFirst({
          where: {
            refreshJobId: change.job.id,
            playerId: persistedPlayer.id,
          },
          select: {
            id: true,
          },
        });

        const snapshot =
          existingSnapshot ??
          (await snapshotRepository.create({
            playerId: persistedPlayer.id,
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            refreshJobId: change.job.id,
            sourceKey: persistedPlayer.sourceKey,
            sourcePlayerId: persistedPlayer.sourcePlayerId,
            externalId: persistedPlayer.externalId,
            name: persistedPlayer.name,
            displayName: persistedPlayer.displayName,
            searchName: persistedPlayer.searchName,
            position: persistedPlayer.position,
            nflTeam: persistedPlayer.nflTeam,
            age: persistedPlayer.age,
            yearsPro: persistedPlayer.yearsPro,
            injuryStatus: persistedPlayer.injuryStatus,
            statusCode: persistedPlayer.statusCode,
            statusText: persistedPlayer.statusText,
            isRestricted: persistedPlayer.isRestricted,
            capturedAt: now,
          }));

        await changeRepository.update(change.id, {
          playerId: persistedPlayer.id,
          snapshotId: snapshot.id,
          reviewStatus: "APPLIED",
          fieldMaskJson: serializePersistedJson(diff.changedFields),
          previousValuesJson: serializePersistedJson(
            diff.isChanged
              ? diff.changedFields.reduce<Record<string, unknown>>((result, field) => {
                  result[field] = (existingPlayer as Record<string, unknown>)[field];
                  return result;
                }, {})
              : {},
          ),
          appliedValuesJson: serializePersistedJson({
            ...buildAppliedPlayerSummary(persistedPlayer.id, nextPlayerData),
            mappingCreated,
            reviewedAction: input.action.type,
          }),
          notes: input.action.notes ?? change.notes ?? null,
          reviewedAt: now,
          reviewedByUserId: input.reviewedByUserId,
        });

        await logTransaction(tx, {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "COMMISSIONER_OVERRIDE",
          summary: "Applied reviewed player refresh change.",
          playerId: persistedPlayer.id,
          metadata: {
            refreshJobId: change.job.id,
            changeId: change.id,
            changeType: change.changeType,
            mappingCreated,
            changedFields: diff.changedFields,
            restricted: persistedPlayer.isRestricted,
          },
          audit: {
            actor: auditActorFromRequestActor(input.actor ?? null),
            source: "player.refresh.resolve",
            entities: {
              refreshJobId: change.job.id,
              refreshChangeId: change.id,
              playerId: persistedPlayer.id,
            },
            before: diff.isChanged
              ? diff.changedFields.reduce<Record<string, Prisma.InputJsonValue | null>>(
                  (result, field) => {
                    result[field] = ((existingPlayer as Record<string, unknown>)[field] ??
                      null) as Prisma.InputJsonValue | null;
                    return result;
                  },
                  {},
                )
              : null,
            after: diff.isChanged
              ? diff.changedFields.reduce<Record<string, Prisma.InputJsonValue | null>>(
                  (result, field) => {
                    result[field] = ((nextPlayerData as Record<string, unknown>)[field] ??
                      null) as Prisma.InputJsonValue | null;
                    return result;
                  },
                  {},
                )
              : null,
          },
        });

        return {
          changeId: change.id,
          jobId: change.job.id,
          reviewStatus: "APPLIED",
          playerId: persistedPlayer.id,
          snapshotId: snapshot.id,
          mappingCreated,
        };
      });
    },

    async updatePlayerRestriction(input: {
      leagueId: string;
      seasonId: string;
      playerId: string;
      restricted: boolean;
      reviewedByUserId: string;
      now?: Date;
      actor?: ReviewActor | null;
      changeId?: string | null;
      notes?: string | null;
    }): Promise<UpdatePlayerRestrictionResult> {
      const now = input.now ?? new Date();

      return runReviewTransaction(client, async (tx) => {
        const player = await tx.player.findUnique({
          where: {
            id: input.playerId,
          },
          select: {
            id: true,
            isRestricted: true,
            name: true,
          },
        });

        if (!player) {
          throw new Error("PLAYER_NOT_FOUND");
        }

        if (player.isRestricted !== input.restricted) {
          await tx.player.update({
            where: {
              id: player.id,
            },
            data: {
              isRestricted: input.restricted,
            },
          });
        }

        await logTransaction(tx, {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "COMMISSIONER_OVERRIDE",
          summary: `${input.restricted ? "Restricted" : "Reactivated"} player availability.`,
          playerId: player.id,
          metadata: {
            changeId: input.changeId ?? null,
            notes: input.notes ?? null,
            restricted: input.restricted,
          },
          audit: {
            actor: auditActorFromRequestActor(input.actor ?? null),
            source: "player.refresh.restriction",
            entities: {
              playerId: player.id,
              refreshChangeId: input.changeId ?? null,
            },
            before: {
              isRestricted: player.isRestricted,
            },
            after: {
              isRestricted: input.restricted,
            },
          },
        });

        return {
          playerId: player.id,
          isRestricted: input.restricted,
        };
      });
    },
  };
}
