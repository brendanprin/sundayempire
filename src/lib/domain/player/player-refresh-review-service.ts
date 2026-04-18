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
import { createPlayerIdentityMappingRepository } from "@/lib/repositories/player/player-identity-mapping-repository";
import { createPlayerRefreshChangeRepository } from "@/lib/repositories/player/player-refresh-change-repository";

type PlayerRefreshReviewDbClient = PrismaClient | Prisma.TransactionClient;

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
      adapterKey?: string | null;
      sourceLabel?: string | null;
      requestedByUserId?: string | null;
      payload?: PlayerDirectoryImportEnvelope | null;
      now?: Date;
    }): Promise<PlayerMasterRefreshResult> {
      return masterRefreshService.run({
        adapterKey: input.adapterKey ?? null,
        sourceLabel: input.sourceLabel ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        payload: input.payload ?? null,
        now: input.now,
      });
    },

    async resolveChange(input: {
      changeId: string;
      reviewedByUserId: string;
      action: ReviewAction;
      now?: Date;
    }): Promise<ResolveChangeResult> {
      const now = input.now ?? new Date();

      return runReviewTransaction(client, async (tx) => {
        const changeRepository = createPlayerRefreshChangeRepository(tx);
        const mappingRepository = createPlayerIdentityMappingRepository(tx);
        const change = await changeRepository.findById(input.changeId);

        if (!change) {
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

          return {
            changeId: change.id,
            jobId: change.job.id,
            reviewStatus: "REJECTED",
            playerId: change.player?.id ?? null,
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

        await changeRepository.update(change.id, {
          playerId: persistedPlayer.id,
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

        return {
          changeId: change.id,
          jobId: change.job.id,
          reviewStatus: "APPLIED",
          playerId: persistedPlayer.id,
          mappingCreated,
        };
      });
    },

    async updatePlayerRestriction(input: {
      playerId: string;
      restricted: boolean;
      reviewedByUserId: string;
      now?: Date;
      changeId?: string | null;
      notes?: string | null;
    }): Promise<UpdatePlayerRestrictionResult> {
      const now = input.now ?? new Date();

      const player = await (client as PrismaClient).player.findUnique({
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
        await (client as PrismaClient).player.update({
          where: {
            id: player.id,
          },
          data: {
            isRestricted: input.restricted,
            updatedAt: now,
          },
        });
      }

      return {
        playerId: player.id,
        isRestricted: input.restricted,
      };
    },
  };
}
