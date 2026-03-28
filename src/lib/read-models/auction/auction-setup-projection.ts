import {
  buildFantasyProsDraftRankingLookup,
  fantasyProsDraftRankingLookupKey,
} from "@/lib/fantasypros-draft-rankings";
import { createAuctionEligiblePlayersReader } from "@/lib/domain/auction/auction-eligible-players";
import {
  canFinalizeAuctionPool,
  canRegenerateAuctionPool,
  createAuctionPoolBlockers,
  deriveAuctionPoolReviewState,
} from "@/lib/domain/auction/auction-pool-readiness";
import { createAuctionPoolService } from "@/lib/domain/auction/auction-pool-service";
import {
  AuctionDbClient,
  buildDefaultAuctionEndsAt,
  buildDefaultVeteranAuctionTitle,
  DEFAULT_AUCTION_BID_RESET_SECONDS,
  DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
  isBlindAuctionWindowActive,
  parseStringArray,
} from "@/lib/domain/auction/shared";
import { resolveLeagueSeasonContext } from "@/lib/read-models/dashboard/shared";
import { VeteranAuctionSetupProjection } from "@/lib/read-models/draft/types";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { toDraftSummary } from "@/lib/draft";

const rankingLookup = buildFantasyProsDraftRankingLookup();

function rankingForPlayer(player: {
  name: string;
  nflTeam: string | null;
  position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
}) {
  return (
    rankingLookup.get(
      fantasyProsDraftRankingLookupKey({
        name: player.name,
        nflTeam: player.nflTeam,
        position: player.position,
      }),
    ) ?? null
  );
}

function sortByRankThenName<T extends { player: { draftRank: number | null; name: string } }>(
  left: T,
  right: T,
) {
  const leftRank = left.player.draftRank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.player.draftRank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.player.name.localeCompare(right.player.name);
}

export function createAuctionSetupProjection(client: AuctionDbClient = prisma) {
  const poolService = createAuctionPoolService(client);
  const eligiblePlayersReader = createAuctionEligiblePlayersReader(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      draftId?: string | null;
      actorRole: CanonicalLeagueRole;
      search?: string | null;
      now?: Date;
    }): Promise<VeteranAuctionSetupProjection | null> {
      const now = input.now ?? new Date();
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.season) {
        return null;
      }

      const teams = await client.team.findMany({
        where: {
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
        orderBy: [{ name: "asc" }],
      });

      const draft =
        input.draftId
          ? await client.draft.findFirst({
              where: {
                id: input.draftId,
                leagueId: input.leagueId,
                seasonId: context.season.id,
                type: "VETERAN_AUCTION",
              },
            })
          : await client.draft.findFirst({
              where: {
                leagueId: input.leagueId,
                seasonId: context.season.id,
                type: "VETERAN_AUCTION",
                status: {
                  in: ["NOT_STARTED", "IN_PROGRESS"],
                },
              },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            });

      if (!draft) {
        const preview = await eligiblePlayersReader.list({
          seasonId: context.season.id,
          search: input.search ?? "",
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
          defaultTitle: buildDefaultVeteranAuctionTitle(context.season.year),
          draft: null,
          config: {
            auctionMode: "STANDARD",
            auctionEndsAt: buildDefaultAuctionEndsAt(now).toISOString(),
            auctionOpenBidWindowSeconds: DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
            auctionBidResetSeconds: DEFAULT_AUCTION_BID_RESET_SECONDS,
          },
          status: {
            needsDraftCreation: true,
            needsPoolGeneration: false,
            poolEntryCount: 0,
            includedCount: preview.eligible.length,
            excludedCount: preview.excluded.length,
            warningCount: 0,
            reviewState: "NOT_GENERATED",
            reviewStatus: null,
            isFinalized: false,
            canFinalize: false,
            canRegenerate: false,
            readyForStart: false,
            blockers: [
              {
                code: "AUCTION_DRAFT_REQUIRED",
                message: "Create the veteran auction draft before generating and finalizing the pool.",
              },
            ],
          },
          warnings: [],
          poolEntries: [],
          excludedPlayers: preview.excluded
            .map((player) => ({
              id: `preview-${player.id}`,
              reason: player.primaryExclusionReason,
              reasons: player.exclusionReasons,
              player: {
                id: player.id,
                name: player.name,
                position: player.position,
                nflTeam: player.nflTeam,
                draftRank: player.draftRank,
                ownerTeam: player.ownerTeam,
                isRestricted: player.isRestricted,
              },
            }))
            .sort(sortByRankThenName),
          emergencyCandidates: preview.eligible.slice(0, 40).map((player) => ({
            id: player.id,
            name: player.name,
            position: player.position,
            nflTeam: player.nflTeam,
            draftRank: player.draftRank,
            draftTier: player.draftTier,
          })),
          teams,
          permissions: {
            canManage: input.actorRole === "COMMISSIONER",
            canCreateEmergencyFillIn: input.actorRole === "COMMISSIONER",
          },
          generatedAt: now.toISOString(),
        };
      }

      const [poolEntries, poolExclusions, bidCount, awardCount, emergencyCandidates] =
        await Promise.all([
          client.auctionPlayerPoolEntry.findMany({
            where: {
              draftId: draft.id,
            },
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  nflTeam: true,
                },
              },
              nominatedByTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              currentLeadingTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
          }),
          client.auctionPlayerPoolExclusion.findMany({
            where: {
              draftId: draft.id,
            },
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  nflTeam: true,
                  isRestricted: true,
                  rosterSlots: {
                    where: {
                      seasonId: context.season.id,
                    },
                    select: {
                      team: {
                        select: {
                          id: true,
                          name: true,
                          abbreviation: true,
                        },
                      },
                    },
                    take: 1,
                  },
                  contracts: {
                    where: {
                      seasonId: context.season.id,
                      status: {
                        in: ["ACTIVE", "EXPIRING", "TAGGED"],
                      },
                    },
                    select: {
                      team: {
                        select: {
                          id: true,
                          name: true,
                          abbreviation: true,
                        },
                      },
                    },
                    take: 1,
                  },
                },
              },
            },
            orderBy: [{ createdAt: "asc" }],
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
          poolService.listEmergencyCandidates({
            draftId: draft.id,
            seasonId: context.season.id,
            search: input.search ?? "",
          }),
        ]);

      const warnings: VeteranAuctionSetupProjection["warnings"] = [];
      const blindWindowActive =
        draft.auctionMode === "EMERGENCY_FILL_IN" &&
        isBlindAuctionWindowActive({
          auctionEndsAt: draft.auctionEndsAt,
          now,
        });

      if (draft.auctionEndsAt && draft.auctionEndsAt <= now && draft.status !== "COMPLETED") {
        warnings.push({
          code: "AUCTION_STATUS_SYNC_RECOMMENDED",
          message: "Auction end time has passed. Run status sync to finalize awards and expirations.",
        });
      }

      if (blindWindowActive) {
        warnings.push({
          code: "BLIND_WINDOW_ACTIVE",
          message: "Final 24-hour blind auction window is now active.",
        });
      }

      const blockers = createAuctionPoolBlockers({
        draftStatus: draft.status,
        includedCount: poolEntries.length,
        reviewStatus: draft.auctionPoolReviewStatus,
      });
      const reviewState = deriveAuctionPoolReviewState({
        includedCount: poolEntries.length,
        reviewStatus: draft.auctionPoolReviewStatus,
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
        defaultTitle: buildDefaultVeteranAuctionTitle(context.season.year),
        draft: toDraftSummary(
          {
            id: draft.id,
            leagueId: draft.leagueId,
            seasonId: draft.seasonId,
            type: draft.type,
            status: draft.status,
            title: draft.title,
            currentPickIndex: draft.currentPickIndex,
            startedAt: draft.startedAt,
            completedAt: draft.completedAt,
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
          },
          {
            totalPicks: poolEntries.length,
            picksMade: poolEntries.filter((entry) => entry.status === "AWARDED" || entry.status === "EXPIRED").length,
          },
        ),
        config: {
          auctionMode: draft.auctionMode ?? "STANDARD",
          auctionEndsAt: draft.auctionEndsAt?.toISOString() ?? null,
          auctionOpenBidWindowSeconds:
            draft.auctionOpenBidWindowSeconds ?? DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
          auctionBidResetSeconds:
            draft.auctionBidResetSeconds ?? DEFAULT_AUCTION_BID_RESET_SECONDS,
        },
        status: {
          needsDraftCreation: false,
          needsPoolGeneration: poolEntries.length === 0,
          poolEntryCount: poolEntries.length,
          includedCount: poolEntries.length,
          excludedCount: poolExclusions.length,
          warningCount: warnings.length,
          reviewState,
          reviewStatus: draft.auctionPoolReviewStatus,
          isFinalized: draft.auctionPoolReviewStatus === "FINALIZED",
          canFinalize: canFinalizeAuctionPool({
            draftStatus: draft.status,
            bidCount,
            awardCount,
            includedCount: poolEntries.length,
            reviewStatus: draft.auctionPoolReviewStatus,
          }),
          canRegenerate: canRegenerateAuctionPool({
            draftStatus: draft.status,
            bidCount,
            awardCount,
            reviewStatus: draft.auctionPoolReviewStatus,
          }),
          readyForStart: blockers.length === 0,
          blockers,
          blindWindowActive,
        },
        warnings,
        poolEntries: poolEntries.map((entry) => ({
          id: entry.id,
          status: entry.status,
          player: {
            id: entry.player.id,
            name: entry.player.name,
            position: entry.player.position,
            nflTeam: entry.player.nflTeam,
            draftRank: rankingForPlayer(entry.player)?.overallRank ?? null,
          },
          nominatedByTeam: entry.nominatedByTeam,
          currentLeadingTeam: entry.currentLeadingTeam,
          currentLeadingBidAmount: entry.currentLeadingBidAmount,
        })),
        excludedPlayers: poolExclusions
          .map((entry) => {
            const player = entry.player;
            const ownerTeam = player.contracts[0]?.team ?? player.rosterSlots[0]?.team ?? null;
            const reasons = parseStringArray(entry.reasonDetailsJson) as Array<typeof entry.reason>;
            return {
              id: entry.id,
              reason: entry.reason,
              reasons,
              player: {
                id: player.id,
                name: player.name,
                position: player.position,
                nflTeam: player.nflTeam,
                draftRank: rankingForPlayer(player)?.overallRank ?? null,
                ownerTeam,
                isRestricted: player.isRestricted,
              },
            };
          })
          .map((entry) => ({
            ...entry,
            reasons: entry.reasons.length > 0 ? entry.reasons : [entry.reason],
          }))
          .sort(sortByRankThenName),
        emergencyCandidates: emergencyCandidates.map((player) => ({
          id: player.id,
          name: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          draftRank: player.draftRank,
          draftTier: player.draftTier,
        })),
        teams,
        permissions: {
          canManage: input.actorRole === "COMMISSIONER",
          canCreateEmergencyFillIn: input.actorRole === "COMMISSIONER",
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
