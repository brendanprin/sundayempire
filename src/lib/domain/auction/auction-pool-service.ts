import { DraftStatus } from "@prisma/client";
import { createAuctionEligiblePlayersReader } from "@/lib/domain/auction/auction-eligible-players";
import { canFinalizeAuctionPool } from "@/lib/domain/auction/auction-pool-readiness";
import {
  AuctionDbClient,
  AuctionWarning,
  buildDefaultAuctionEndsAt,
  buildDefaultVeteranAuctionTitle,
  DEFAULT_AUCTION_BID_RESET_SECONDS,
  DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
  DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT,
  normalizeAuctionMode,
  parseStringArray,
} from "@/lib/domain/auction/shared";
import { createAuctionPlayerPoolEntryRepository } from "@/lib/repositories/auction/auction-player-pool-entry-repository";
import { createAuctionPlayerPoolExclusionRepository } from "@/lib/repositories/auction/auction-player-pool-exclusion-repository";
import { prisma } from "@/lib/prisma";

export function createAuctionPoolService(client: AuctionDbClient = prisma) {
  const poolRepository = createAuctionPlayerPoolEntryRepository(client);
  const exclusionRepository = createAuctionPlayerPoolExclusionRepository(client);
  const eligiblePlayersReader = createAuctionEligiblePlayersReader(client);

  async function loadPoolCandidates(input: {
    seasonId: string;
    search?: string;
    auctionMode?: "STANDARD" | "EMERGENCY_FILL_IN";
    selectedPlayerIds?: string[];
  }) {
    return eligiblePlayersReader.list({
      seasonId: input.seasonId,
      search: input.search ?? "",
      auctionMode: input.auctionMode,
      selectedPlayerIds: input.selectedPlayerIds,
    });
  }

  return {
    async ensureAuctionDraft(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      title?: string | null;
      draftId?: string | null;
      auctionMode?: unknown;
      auctionEndsAt?: Date | string | null;
      auctionOpenBidWindowSeconds?: unknown;
      auctionBidResetSeconds?: unknown;
    }) {
      const mode = normalizeAuctionMode(input.auctionMode);
      const auctionEndsAt =
        input.auctionEndsAt instanceof Date
          ? input.auctionEndsAt
          : typeof input.auctionEndsAt === "string" && input.auctionEndsAt.trim()
            ? new Date(input.auctionEndsAt)
            : buildDefaultAuctionEndsAt(new Date());
      const auctionOpenBidWindowSeconds =
        typeof input.auctionOpenBidWindowSeconds === "number" &&
        Number.isInteger(input.auctionOpenBidWindowSeconds) &&
        input.auctionOpenBidWindowSeconds > 0
          ? input.auctionOpenBidWindowSeconds
          : DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS;
      const auctionBidResetSeconds =
        typeof input.auctionBidResetSeconds === "number" &&
        Number.isInteger(input.auctionBidResetSeconds) &&
        input.auctionBidResetSeconds > 0
          ? input.auctionBidResetSeconds
          : DEFAULT_AUCTION_BID_RESET_SECONDS;

      const draft =
        input.draftId
          ? await client.draft.findFirst({
              where: {
                id: input.draftId,
                leagueId: input.leagueId,
                seasonId: input.seasonId,
                type: "VETERAN_AUCTION",
              },
            })
          : await client.draft.findFirst({
              where: {
                leagueId: input.leagueId,
                seasonId: input.seasonId,
                type: "VETERAN_AUCTION",
                status: {
                  in: ["NOT_STARTED", "IN_PROGRESS"],
                },
              },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            });

      if (draft) {
        return client.draft.update({
          where: {
            id: draft.id,
          },
          data: {
            title:
              typeof input.title === "string" && input.title.trim()
                ? input.title.trim()
                : draft.title,
            auctionMode: mode,
            auctionEndsAt,
            auctionOpenBidWindowSeconds:
              typeof input.auctionOpenBidWindowSeconds === "number"
                ? auctionOpenBidWindowSeconds
                : draft.auctionOpenBidWindowSeconds ?? DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
            auctionBidResetSeconds:
              typeof input.auctionBidResetSeconds === "number"
                ? auctionBidResetSeconds
                : draft.auctionBidResetSeconds ?? DEFAULT_AUCTION_BID_RESET_SECONDS,
          },
        });
      }

      return client.draft.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "VETERAN_AUCTION",
          title:
            typeof input.title === "string" && input.title.trim()
              ? input.title.trim()
              : buildDefaultVeteranAuctionTitle(input.seasonYear),
          status: "NOT_STARTED",
          currentPickIndex: 0,
          auctionMode: mode,
          auctionEndsAt,
          auctionOpenBidWindowSeconds,
          auctionBidResetSeconds,
        },
      });
    },

    async generatePool(input: {
      draftId: string;
      leagueId: string;
      seasonId: string;
      createdByUserId?: string | null;
      regenerate?: boolean;
      selectedPlayerIds?: unknown;
      search?: string;
    }): Promise<{
      draftId: string;
      draftStatus: DraftStatus;
      createdCount: number;
      excludedCount: number;
      warnings: AuctionWarning[];
      auctionMode: "STANDARD" | "EMERGENCY_FILL_IN";
    }> {
      const draft = await client.draft.findFirst({
        where: {
          id: input.draftId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "VETERAN_AUCTION",
        },
        select: {
          id: true,
          status: true,
          auctionMode: true,
          auctionPoolReviewStatus: true,
        },
      });

      if (!draft) {
        throw new Error("DRAFT_NOT_FOUND");
      }

      const [bidCount, awardCount, poolEntryCount] = await Promise.all([
        client.auctionBid.count({
          where: {
            draftId: draft.id,
          },
        }),
        client.auctionAward.count({
          where: {
            draftId: draft.id,
          },
        }),
        client.auctionPlayerPoolEntry.count({
          where: {
            draftId: draft.id,
          },
        }),
      ]);

      if (draft.auctionPoolReviewStatus === "FINALIZED") {
        throw new Error("AUCTION_POOL_FINALIZED");
      }

      if (
        (input.regenerate || poolEntryCount > 0) &&
        (draft.status !== "NOT_STARTED" || bidCount > 0 || awardCount > 0)
      ) {
        throw new Error("AUCTION_POOL_RECOVERY_REQUIRED");
      }

      const warnings: AuctionWarning[] = [];
      const auctionMode = draft.auctionMode ?? "STANDARD";
      const requestedPlayerIds =
        auctionMode === "EMERGENCY_FILL_IN"
          ? parseStringArray(input.selectedPlayerIds)
          : [];

      if (auctionMode === "EMERGENCY_FILL_IN" && requestedPlayerIds.length === 0) {
        throw new Error("EMERGENCY_POOL_REQUIRED");
      }

      const { eligible, excluded } = await loadPoolCandidates({
        seasonId: input.seasonId,
        search: input.search,
        auctionMode,
        selectedPlayerIds: requestedPlayerIds,
      });

      let selectedPlayers = eligible;
      const persistedExclusions = [...excluded];

      if (auctionMode === "EMERGENCY_FILL_IN") {
        if (selectedPlayers.length === 0) {
          throw new Error("EMERGENCY_POOL_REQUIRED");
        }

        if (selectedPlayers.length < requestedPlayerIds.length) {
          warnings.push({
            code: "EMERGENCY_POOL_PARTIAL",
            message: "Some requested emergency fill-in players were not eligible and were skipped.",
          });
        }

        if (selectedPlayers.length > DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT) {
          const overflowPlayers = selectedPlayers.slice(DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT);
          selectedPlayers = selectedPlayers.slice(0, DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT);
          persistedExclusions.push(
            ...overflowPlayers.map((player) => ({
              ...player,
              primaryExclusionReason: "EMERGENCY_POOL_LIMIT" as const,
              exclusionReasons: ["EMERGENCY_POOL_LIMIT" as const],
            })),
          );
          warnings.push({
            code: "EMERGENCY_POOL_TRUNCATED",
            message: `Emergency fill-in pool was limited to ${DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT} players.`,
          });
        }
      }

      if (selectedPlayers.length === 0) {
        warnings.push({
          code: "AUCTION_POOL_EMPTY",
          message: "No eligible veteran players were found for the auction pool.",
        });
      }

      await poolRepository.replaceForDraft({
        draftId: draft.id,
        entries: selectedPlayers.map((player) => ({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          playerId: player.id,
          status: "ELIGIBLE",
          openedByUserId: null,
          nominatedByTeamId: null,
        })),
      });

      await exclusionRepository.replaceForDraft({
        draftId: draft.id,
        entries: persistedExclusions.map((player) => ({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          playerId: player.id,
          reason: player.primaryExclusionReason,
          reasonDetailsJson: player.exclusionReasons,
        })),
      });

      await client.draft.update({
        where: {
          id: draft.id,
        },
        data: {
          auctionPoolReviewStatus: "PENDING_REVIEW",
          auctionPoolGeneratedAt: new Date(),
          auctionPoolGeneratedByUserId: input.createdByUserId ?? null,
          auctionPoolFinalizedAt: null,
          auctionPoolFinalizedByUserId: null,
        },
      });

      return {
        draftId: draft.id,
        draftStatus: draft.status,
        createdCount: selectedPlayers.length,
        excludedCount: persistedExclusions.length,
        warnings,
        auctionMode,
      };
    },

    async finalizePool(input: {
      draftId: string;
      leagueId: string;
      seasonId: string;
      finalizedByUserId?: string | null;
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const draft = await client.draft.findFirst({
        where: {
          id: input.draftId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "VETERAN_AUCTION",
        },
        select: {
          id: true,
          status: true,
          auctionPoolReviewStatus: true,
        },
      });

      if (!draft) {
        throw new Error("DRAFT_NOT_FOUND");
      }

      const [includedCount, bidCount, awardCount] = await Promise.all([
        client.auctionPlayerPoolEntry.count({
          where: {
            draftId: draft.id,
          },
        }),
        client.auctionBid.count({
          where: {
            draftId: draft.id,
          },
        }),
        client.auctionAward.count({
          where: {
            draftId: draft.id,
          },
        }),
      ]);

      if (
        !canFinalizeAuctionPool({
          draftStatus: draft.status,
          bidCount,
          awardCount,
          includedCount,
          reviewStatus: draft.auctionPoolReviewStatus,
        })
      ) {
        throw new Error("AUCTION_POOL_NOT_READY");
      }

      return client.draft.update({
        where: {
          id: draft.id,
        },
        data: {
          auctionPoolReviewStatus: "FINALIZED",
          auctionPoolFinalizedAt: now,
          auctionPoolFinalizedByUserId: input.finalizedByUserId ?? null,
        },
      });
    },

    async listEmergencyCandidates(input: {
      draftId: string;
      seasonId: string;
      search?: string;
    }) {
      const players = await loadPoolCandidates({
        seasonId: input.seasonId,
        search: input.search,
      });
      return players.eligible.slice(0, DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT);
    },
  };
}
