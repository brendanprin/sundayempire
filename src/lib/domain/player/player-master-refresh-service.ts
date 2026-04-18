import { createHash } from "node:crypto";
import type {
  PlayerRefreshChangeReviewStatus,
  PlayerRefreshChangeType,
  PlayerRefreshJobStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { getPlayerDirectoryAdapter } from "@/lib/domain/player/adapters/registry";
import type {
  NormalizedPlayerDirectoryRow,
  PlayerDirectoryImportEnvelope,
} from "@/lib/domain/player/adapters/types";
import {
  buildPlayerIdentityFingerprintKey,
  createPlayerIdentityResolver,
  type CanonicalPlayerIdentityRecord,
} from "@/lib/domain/player/player-identity-resolver";
import {
  buildAppliedPlayerSummary,
  diffPlayerData,
  normalizeIncomingPlayerData,
  serializePersistedJson,
  type RefreshablePlayerRecord,
} from "@/lib/domain/player/player-master-refresh-shared";
import { prisma } from "@/lib/prisma";
import { createPlayerRefreshChangeRepository } from "@/lib/repositories/player/player-refresh-change-repository";
import { createPlayerRefreshJobRepository } from "@/lib/repositories/player/player-refresh-job-repository";

type PlayerMasterRefreshDbClient = PrismaClient | Prisma.TransactionClient;

type Classification = Extract<
  PlayerRefreshChangeType,
  "NEW" | "UPDATED" | "UNCHANGED" | "INVALID" | "AMBIGUOUS" | "DUPLICATE_SUSPECT"
>;

type RefreshCounts = {
  new: number;
  updated: number;
  unchanged: number;
  invalid: number;
  ambiguous: number;
  duplicateSuspect: number;
};

type RefreshTransactionResult = {
  counts: RefreshCounts;
};

const REFRESH_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

function digestPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function emptyCounts(): RefreshCounts {
  return {
    new: 0,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    ambiguous: 0,
    duplicateSuspect: 0,
  };
}

function buildCanonicalPlayerIdentity(player: {
  id: string;
  name: string;
  displayName: string;
  searchName: string;
  position: string;
  nflTeam: string | null;
  externalId: string | null;
  sourceKey: string | null;
  sourcePlayerId: string | null;
}): CanonicalPlayerIdentityRecord {
  return {
    id: player.id,
    name: player.name,
    displayName: player.displayName,
    searchName: player.searchName,
    position: player.position,
    nflTeam: player.nflTeam,
    externalId: player.externalId,
    sourceKey: player.sourceKey,
    sourcePlayerId: player.sourcePlayerId,
  };
}

async function runPlayerRefreshTransaction(
  client: PlayerMasterRefreshDbClient,
  callback: (tx: Prisma.TransactionClient) => Promise<RefreshTransactionResult>,
) {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return client.$transaction(callback, REFRESH_TRANSACTION_OPTIONS);
  }

  return callback(client as Prisma.TransactionClient);
}

function supportsAutomaticSourceBinding(input: {
  strategy:
    | "source_identity"
    | "approved_mapping"
    | "legacy_external_id"
    | "exact_name_position_team"
    | "exact_name_position";
  existingPlayer: RefreshablePlayerRecord;
  row: NormalizedPlayerDirectoryRow;
}) {
  if (input.strategy === "approved_mapping") {
    return true;
  }

  if (!input.row.sourceKey || !input.row.sourcePlayerId) {
    return true;
  }

  if (!input.existingPlayer.sourceKey && !input.existingPlayer.sourcePlayerId) {
    return true;
  }

  return (
    input.existingPlayer.sourceKey === input.row.sourceKey &&
    input.existingPlayer.sourcePlayerId === input.row.sourcePlayerId
  );
}

export type PlayerMasterRefreshResult = {
  job: {
    id: string;
    status: PlayerRefreshJobStatus;
    adapterKey: string;
    createdAt: string;
    completedAt: string | null;
  };
  summary: RefreshCounts & {
    warnings: string[];
    errors: string[];
    totalSubmitted: number;
    totalNormalized: number;
    totalProcessed: number;
  };
};

export function createPlayerMasterRefreshService(client: PlayerMasterRefreshDbClient = prisma) {
  const jobRepository = createPlayerRefreshJobRepository(client);

  return {
    async run(input: {
      adapterKey?: string | null;
      sourceLabel?: string | null;
      requestedByUserId?: string | null;
      payload?: PlayerDirectoryImportEnvelope | null;
      now?: Date;
    }): Promise<PlayerMasterRefreshResult> {
      const now = input.now ?? new Date();
      const adapter = getPlayerDirectoryAdapter(input.adapterKey);

      if (!adapter) {
        throw new Error("INVALID_PLAYER_DIRECTORY_ADAPTER");
      }

      const job = await jobRepository.create({
        requestedByUserId: input.requestedByUserId ?? null,
        triggerType: "MANUAL",
        adapterKey: adapter.key,
        sourceLabel: input.sourceLabel?.trim() || null,
        status: "RUNNING",
        startedAt: now,
        payloadDigest: digestPayload({
          adapterKey: adapter.key,
          payload: input.payload ?? null,
        }),
        inputJson: serializePersistedJson({
          sourceLabel: input.sourceLabel?.trim() || null,
          payload: input.payload ?? null,
        }),
      });

      try {
        const parsed = await adapter.read({
          sourceLabel: input.sourceLabel?.trim() || null,
          payload: input.payload ?? null,
        });

        if (parsed.requestError) {
          const summary = {
            ...emptyCounts(),
            warnings: parsed.warnings,
            errors: [parsed.requestError, ...parsed.errors],
            totalSubmitted: parsed.rawRows.length,
            totalNormalized: parsed.rows.length,
            totalProcessed: 0,
          };

          await jobRepository.update(job.id, {
            status: "FAILED",
            completedAt: now,
            summaryJson: serializePersistedJson(summary),
            errorJson: serializePersistedJson({ messages: summary.errors }),
          });

          return {
            job: {
              id: job.id,
              status: "FAILED",
              adapterKey: adapter.key,
              createdAt: job.createdAt.toISOString(),
              completedAt: now.toISOString(),
            },
            summary,
          };
        }

        const transactionResult = await runPlayerRefreshTransaction(client, async (tx) => {
          const changeRepository = createPlayerRefreshChangeRepository(tx);

          const counts = emptyCounts();

          const [players, approvedMappings] = await Promise.all([
            tx.player.findMany({
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
                createdAt: true,
                updatedAt: true,
              },
            }),
            tx.playerIdentityMapping.findMany({
              select: {
                playerId: true,
                sourceKey: true,
                sourcePlayerId: true,
              },
            }),
          ]);

          const mutablePlayerStates = [...players];
          let resolver = createPlayerIdentityResolver({
            players: mutablePlayerStates.map((player) => buildCanonicalPlayerIdentity(player)),
            approvedMappings,
          });

          const rebuildResolver = () => {
            resolver = createPlayerIdentityResolver({
              players: mutablePlayerStates.map((player) => buildCanonicalPlayerIdentity(player)),
              approvedMappings,
            });
          };

          for (const error of parsed.errors) {
            counts.invalid += 1;
            await changeRepository.create({
              jobId: job.id,
              changeType: "INVALID",
              reviewStatus: "PENDING",
              incomingValuesJson: serializePersistedJson({
                error,
              }),
              notes: error,
            });
          }

          const seenSourceIdentities = new Set<string>();
          const processedPlayerIds = new Set<string>();

          for (const row of parsed.rows) {
            const sourceIdentityKey = `${row.sourceKey}::${row.sourcePlayerId}`;
            if (seenSourceIdentities.has(sourceIdentityKey)) {
              counts.duplicateSuspect += 1;
              await changeRepository.create({
                jobId: job.id,
                changeType: "DUPLICATE_SUSPECT",
                reviewStatus: "PENDING",
                incomingValuesJson: serializePersistedJson(row),
                notes: `Duplicate source identity detected within refresh payload: ${sourceIdentityKey}.`,
              });
              continue;
            }

            seenSourceIdentities.add(sourceIdentityKey);

            const resolution = resolver.resolve(row);

            if (resolution.status === "ambiguous") {
              counts.ambiguous += 1;
              await changeRepository.create({
                jobId: job.id,
                playerId: null,
                changeType: "AMBIGUOUS",
                reviewStatus: "PENDING",
                incomingValuesJson: serializePersistedJson(row),
                appliedValuesJson: serializePersistedJson({
                  strategy: resolution.strategy,
                  candidatePlayerIds: resolution.candidates.map((candidate) => candidate.id),
                }),
                notes: resolution.reason,
              });
              continue;
            }

            if (resolution.status === "unresolved") {
              const createdPlayer = await tx.player.create({
                data: normalizeIncomingPlayerData(row, null, "new"),
              });

              await changeRepository.create({
                jobId: job.id,
                playerId: createdPlayer.id,
                changeType: "NEW",
                reviewStatus: "APPLIED",
                fieldMaskJson: serializePersistedJson([
                  "sourceKey",
                  "sourcePlayerId",
                  "externalId",
                  "name",
                  "displayName",
                  "searchName",
                  "position",
                  "nflTeam",
                  "age",
                  "yearsPro",
                  "injuryStatus",
                  "statusCode",
                  "statusText",
                  "isRestricted",
                ]),
                previousValuesJson: null,
                incomingValuesJson: serializePersistedJson(row),
                appliedValuesJson: serializePersistedJson(
                  buildAppliedPlayerSummary(
                    createdPlayer.id,
                    normalizeIncomingPlayerData(row, null, "new"),
                  ),
                ),
                notes: "Created canonical player from refresh row.",
              });

              counts.new += 1;
              processedPlayerIds.add(createdPlayer.id);
              mutablePlayerStates.push(createdPlayer);
              rebuildResolver();
              continue;
            }

            const existingPlayer =
              mutablePlayerStates.find((player) => player.id === resolution.player.id) ?? null;
            if (!existingPlayer) {
              throw new Error(`PLAYER_NOT_FOUND:${resolution.player.id}`);
            }

            if (processedPlayerIds.has(existingPlayer.id)) {
              counts.duplicateSuspect += 1;
              await changeRepository.create({
                jobId: job.id,
                playerId: existingPlayer.id,
                changeType: "DUPLICATE_SUSPECT",
                reviewStatus: "PENDING",
                incomingValuesJson: serializePersistedJson(row),
                appliedValuesJson: serializePersistedJson({
                  matchedPlayerId: existingPlayer.id,
                  strategy: resolution.strategy,
                }),
                notes:
                  "Multiple incoming rows attempted to modify the same canonical player within one refresh job.",
              });
              continue;
            }

            if (resolution.conflicts.length > 0) {
              counts.duplicateSuspect += 1;
              await changeRepository.create({
                jobId: job.id,
                playerId: existingPlayer.id,
                changeType: "DUPLICATE_SUSPECT",
                reviewStatus: "PENDING",
                incomingValuesJson: serializePersistedJson(row),
                appliedValuesJson: serializePersistedJson({
                  matchedPlayerId: existingPlayer.id,
                  conflictingPlayerIds: resolution.conflicts.map((player) => player.id),
                  strategy: resolution.strategy,
                }),
                notes:
                  "Incoming row collided with a different canonical player through compatibility identity matching.",
              });
              continue;
            }

            if (
              !supportsAutomaticSourceBinding({
                strategy: resolution.strategy,
                existingPlayer,
                row,
              })
            ) {
              counts.ambiguous += 1;
              await changeRepository.create({
                jobId: job.id,
                playerId: existingPlayer.id,
                changeType: "AMBIGUOUS",
                reviewStatus: "PENDING",
                incomingValuesJson: serializePersistedJson(row),
                appliedValuesJson: serializePersistedJson({
                  matchedPlayerId: existingPlayer.id,
                  strategy: resolution.strategy,
                  existingSourceKey: existingPlayer.sourceKey,
                  existingSourcePlayerId: existingPlayer.sourcePlayerId,
                }),
                notes:
                  "Refresh row matched an existing player through fallback logic but would overwrite a different canonical source identity.",
              });
              continue;
            }

            const nextPlayerData = normalizeIncomingPlayerData(row, existingPlayer, resolution.strategy);
            const diff = diffPlayerData(existingPlayer, nextPlayerData);
            const classification: Classification = diff.isChanged ? "UPDATED" : "UNCHANGED";
            const reviewStatus: PlayerRefreshChangeReviewStatus = "APPLIED";

            const persistedPlayer = diff.isChanged
              ? await tx.player.update({
                  where: {
                    id: existingPlayer.id,
                  },
                  data: nextPlayerData,
                })
              : existingPlayer;

            await changeRepository.create({
              jobId: job.id,
              playerId: persistedPlayer.id,
              changeType: classification,
              reviewStatus,
              fieldMaskJson: serializePersistedJson(diff.changedFields),
              previousValuesJson: serializePersistedJson(
                diff.isChanged
                  ? diff.changedFields.reduce<Record<string, unknown>>((result, field) => {
                      result[field] = (existingPlayer as Record<string, unknown>)[field];
                      return result;
                    }, {})
                  : {},
              ),
              incomingValuesJson: serializePersistedJson(row),
              appliedValuesJson: serializePersistedJson(
                buildAppliedPlayerSummary(persistedPlayer.id, nextPlayerData),
              ),
              notes:
                classification === "UPDATED"
                  ? `Updated canonical player via ${resolution.strategy} matching.`
                  : `Refresh row matched canonical player via ${resolution.strategy} with no field changes.`,
            });

            if (classification === "UPDATED") {
              counts.updated += 1;
            } else {
              counts.unchanged += 1;
            }

            processedPlayerIds.add(persistedPlayer.id);
            const mutableIndex = mutablePlayerStates.findIndex(
              (player) => player.id === persistedPlayer.id,
            );
            if (mutableIndex >= 0) {
              mutablePlayerStates[mutableIndex] = persistedPlayer;
              rebuildResolver();
            }
          }

          return {
            counts,
          };
        });

        const totalProcessed =
          transactionResult.counts.new +
          transactionResult.counts.updated +
          transactionResult.counts.unchanged;
        const errors = parsed.errors;
        const unresolvedCount =
          transactionResult.counts.invalid +
          transactionResult.counts.ambiguous +
          transactionResult.counts.duplicateSuspect;

        const status: PlayerRefreshJobStatus =
          unresolvedCount > 0 || errors.length > 0
            ? totalProcessed > 0
              ? "PARTIAL"
              : "FAILED"
            : "SUCCEEDED";

        const summary = {
          ...transactionResult.counts,
          warnings: parsed.warnings,
          errors,
          totalSubmitted: parsed.rawRows.length,
          totalNormalized: parsed.rows.length,
          totalProcessed,
        };

        await jobRepository.update(job.id, {
          status,
          completedAt: now,
          summaryJson: serializePersistedJson(summary),
          errorJson:
            errors.length > 0 || unresolvedCount > 0
              ? serializePersistedJson({
                  messages: [
                    ...errors,
                    ...(transactionResult.counts.ambiguous > 0
                      ? [
                          `${transactionResult.counts.ambiguous} row(s) were classified as AMBIGUOUS.`,
                        ]
                      : []),
                    ...(transactionResult.counts.duplicateSuspect > 0
                      ? [
                          `${transactionResult.counts.duplicateSuspect} row(s) were classified as DUPLICATE_SUSPECT.`,
                        ]
                      : []),
                    ...(transactionResult.counts.invalid > 0
                      ? [`${transactionResult.counts.invalid} row(s) were classified as INVALID.`]
                      : []),
                  ],
                })
              : null,
        });

        return {
          job: {
            id: job.id,
            status,
            adapterKey: adapter.key,
            createdAt: job.createdAt.toISOString(),
            completedAt: now.toISOString(),
          },
          summary,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await jobRepository.update(job.id, {
          status: "FAILED",
          completedAt: now,
          errorJson: serializePersistedJson({
            messages: [message],
          }),
        });

        throw error;
      }
    },
  };
}
