import {
  buildFantasyProsDraftRankingLookup,
  fantasyProsDraftRankingLookupKey,
} from "@/lib/fantasypros-draft-rankings";
import {
  AuctionDbClient,
  blindAuctionStartsAt,
  calculateBidValue,
  compareBidValues,
  DEFAULT_AUCTION_BID_RESET_SECONDS,
  DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
  isBlindAuctionWindowActive,
} from "@/lib/domain/auction/shared";
import { VeteranAuctionRoomProjection } from "@/lib/read-models/draft/types";
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

function normalizeStatusFilter(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && normalized !== "ALL" ? normalized : "ALL";
}

function normalizePositionFilter(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && normalized !== "ALL" ? normalized : "ALL";
}

export function createAuctionRoomProjection(client: AuctionDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      draftId: string;
      actor: {
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
      search?: string | null;
      status?: string | null;
      position?: string | null;
      now?: Date;
    }): Promise<VeteranAuctionRoomProjection | null> {
      const now = input.now ?? new Date();
      const draft = await client.draft.findFirst({
        where: {
          id: input.draftId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "VETERAN_AUCTION",
        },
        include: {
          league: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!draft) {
        return null;
      }

      const statusFilter = normalizeStatusFilter(input.status);
      const positionFilter = normalizePositionFilter(input.position);
      // VA-S9: Blind window only active for EMERGENCY_FILL_IN auctions, not owner-facing STANDARD auctions
      const blindWindowActive = 
        draft.auctionMode === "EMERGENCY_FILL_IN" &&
        isBlindAuctionWindowActive({
          auctionEndsAt: draft.auctionEndsAt,
          now,
        });

      const entries = await client.auctionPlayerPoolEntry.findMany({
        where: {
          draftId: draft.id,
          ...(statusFilter !== "ALL"
            ? {
                status: statusFilter as never,
              }
            : {}),
          ...(input.search?.trim()
            ? {
                player: {
                  name: {
                    contains: input.search.trim(),
                  },
                },
              }
            : {}),
          ...(positionFilter !== "ALL"
            ? {
                player: {
                  position: positionFilter as never,
                },
              }
            : {}),
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              nflTeam: true,
              age: true,
              isRestricted: true,
            },
          },
          currentLeadingTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          bids: {
            orderBy: [{ submittedAt: "desc" }],
            include: {
              biddingTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
          },
          award: {
            include: {
              awardedTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      });

      const warnings: VeteranAuctionRoomProjection["warnings"] = [];
      // VAH-1: Removed BLIND_WINDOW_ACTIVE warning banner from owner-facing auction room
      // Backend blind logic preserved for data integrity but not exposed in UI warnings

      if (draft.auctionEndsAt && draft.auctionEndsAt <= now && draft.status !== "COMPLETED") {
        warnings.push({
          code: "AUCTION_STATUS_SYNC_RECOMMENDED",
          message: "Auction end time has passed. Commissioner status sync is required to finalize unresolved entries.",
        });
      }

      return {
        league: draft.league,
        season: {
          id: input.seasonId,
          year: input.seasonYear,
        },
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
            totalPicks: entries.length,
            picksMade: entries.filter((entry) => entry.status === "AWARDED" || entry.status === "EXPIRED").length,
          },
        ),
        config: {
          auctionMode: draft.auctionMode ?? "STANDARD",
          auctionEndsAt: draft.auctionEndsAt?.toISOString() ?? null,
          // VA-S9: blindWindowActive calculated earlier with auction mode consideration
          blindWindowActive,
          auctionOpenBidWindowSeconds:
            draft.auctionOpenBidWindowSeconds ?? DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS,
          auctionBidResetSeconds:
            draft.auctionBidResetSeconds ?? DEFAULT_AUCTION_BID_RESET_SECONDS,
        },
        entries: entries.map((entry) => {
          const myOpenBid = input.actor.teamId
            ? entry.bids.find(
                (bid) =>
                  bid.biddingTeamId === input.actor.teamId &&
                  bid.bidType === "OPEN" &&
                  bid.status === "ACTIVE",
              )
            : null;
          
          // VAH-1: Removed blind bid logic (myBlindBid, blindBids, sortedBlindBids, etc.) 
          // to eliminate owner-facing blind-auction UI elements
          
          const ranking = rankingForPlayer(entry.player);

          return {
            id: entry.id,
            status: entry.status,
            player: {
              id: entry.player.id,
              name: entry.player.name,
              position: entry.player.position,
              nflTeam: entry.player.nflTeam,
              age: entry.player.age,
              draftRank: ranking?.overallRank ?? null,
              draftTier: ranking?.tier ?? null,
              isRestricted: entry.player.isRestricted,
            },
            currentLeadingBidAmount: entry.currentLeadingBidAmount,
            currentLeadingTeam: entry.currentLeadingTeam,
            // Calculate leading bid details for board display
            currentLeadingBidYears: entry.currentLeadingBidAmount
              ? (() => {
                  // Try to find the specific leading bid
                  const leadingBid = entry.bids.find(bid => 
                    bid.biddingTeamId === entry.currentLeadingTeamId && 
                    bid.bidType === "OPEN" && 
                    bid.status === "ACTIVE"
                  );
                  
                  if (leadingBid) {
                    return leadingBid.contractYears;
                  }
                  
                  // Fallback: find the highest value active bid
                  const activeBids = entry.bids.filter(bid => 
                    bid.bidType === "OPEN" && bid.status === "ACTIVE"
                  );
                  
                  if (activeBids.length === 0) return 1; // Default fallback
                  
                  // Find the bid with the highest constitutional value
                  const highestBid = activeBids.reduce((prev, current) => {
                    const prevValue = calculateBidValue(prev.salaryAmount, prev.contractYears);
                    const currentValue = calculateBidValue(current.salaryAmount, current.contractYears);
                    return currentValue > prevValue ? current : prev;
                  });
                  
                  return highestBid.contractYears;
                })()
              : null,
            // Add bid value calculation for current leading bid
            currentLeadingBidValue: entry.currentLeadingBidAmount
              ? (() => {
                  // Try to find the specific leading bid for accurate calculation
                  const leadingBid = entry.bids.find(bid => 
                    bid.biddingTeamId === entry.currentLeadingTeamId && 
                    bid.bidType === "OPEN" && 
                    bid.status === "ACTIVE"
                  );
                  
                  if (leadingBid) {
                    return calculateBidValue(leadingBid.salaryAmount, leadingBid.contractYears);
                  }
                  
                  // Fallback: find the highest value active bid
                  const activeBids = entry.bids.filter(bid => 
                    bid.bidType === "OPEN" && bid.status === "ACTIVE"
                  );
                  
                  if (activeBids.length === 0) {
                    return calculateBidValue(entry.currentLeadingBidAmount, 1); // Default fallback
                  }
                  
                  // Find the bid with the highest constitutional value
                  const highestBid = activeBids.reduce((prev, current) => {
                    const prevValue = calculateBidValue(prev.salaryAmount, prev.contractYears);
                    const currentValue = calculateBidValue(current.salaryAmount, current.contractYears);
                    return currentValue > prevValue ? current : prev;
                  });
                  
                  return calculateBidValue(highestBid.salaryAmount, highestBid.contractYears);
                })()
              : null,
            openBidClosesAt: entry.openBidClosesAt?.toISOString() ?? null,
            // VAH-1: Removed blindBidClosesAt and myBlindBid properties 
            // to eliminate owner-facing blind-auction UI elements
            myOpenBid: myOpenBid
              ? {
                  bidId: myOpenBid.id,
                  salaryAmount: myOpenBid.salaryAmount,
                  contractYears: myOpenBid.contractYears,
                  bidValue: calculateBidValue(myOpenBid.salaryAmount, myOpenBid.contractYears),
                  submittedAt: myOpenBid.submittedAt.toISOString(),
                }
              : null,
            award: entry.award
              ? {
                  id: entry.award.id,
                  awardedTeam: entry.award.awardedTeam,
                  salaryAmount: entry.award.salaryAmount,
                  contractYears: entry.award.contractYears,
                  bidValue: calculateBidValue(entry.award.salaryAmount, entry.award.contractYears),
                  awardedAt: entry.award.awardedAt.toISOString(),
                }
              : null,
            review: {
              // VAH-1: Simplified review logic - blind bid tie resolution removed from owner UI
              // Backend commissioner tools still available for data integrity
              required: false,
              tiedBlindBids: [],
            },
            // VA-3: Add recent bids array for bid history display
            // VA-S17: Include winning bids in finalized state and prioritize them
            recentBids: entry.bids
              .filter(bid => bid.bidType === "OPEN" && (bid.status === "ACTIVE" || bid.status === "OUTBID" || bid.status === "WON" || bid.status === "LOST"))
              .sort((a, b) => {
                // VA-S17: Winning bids appear first
                if (a.status === "WON" && b.status !== "WON") return -1;
                if (b.status === "WON" && a.status !== "WON") return 1;
                // Then sort by submission time (newest first)
                return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
              })
              .slice(0, 10)
              .map(bid => ({
                bidId: bid.id,
                salaryAmount: bid.salaryAmount,
                contractYears: bid.contractYears,
                bidValue: calculateBidValue(bid.salaryAmount, bid.contractYears),
                submittedAt: bid.submittedAt.toISOString(),
                status: bid.status as string,
                team: {
                  id: bid.biddingTeam.id,
                  name: bid.biddingTeam.name,
                  abbreviation: bid.biddingTeam.abbreviation,
                },
              })),
            // Constitutional eligibility for blind bidding
            blindEligibleTeamIds: entry.blindEligibleTeamIds 
              ? JSON.parse(entry.blindEligibleTeamIds) as string[]
              : null,
            reopenInfo: entry.reopenedAt
              ? {
                  reopenedAt: entry.reopenedAt.toISOString(),
                  reason: entry.reopenReason,
                  previousStatus: entry.previousStatus,
                }
              : null,
          };
        }),
        filters: {
          search: input.search?.trim() ?? "",
          status: statusFilter,
          position: positionFilter,
        },
        warnings,
        permissions: {
          canBid:
            draft.status === "IN_PROGRESS" &&
            input.actor.leagueRole === "MEMBER" &&
            Boolean(input.actor.teamId),
          canSubmitBlindBid:
            draft.status === "IN_PROGRESS" &&
            blindWindowActive &&
            input.actor.leagueRole === "MEMBER" &&
            Boolean(input.actor.teamId),
          canSyncStatus: input.actor.leagueRole === "COMMISSIONER",
          canReviewBlindTies: input.actor.leagueRole === "COMMISSIONER",
          canReopenEntries: input.actor.leagueRole === "COMMISSIONER",
        },
        viewer: {
          leagueRole: input.actor.leagueRole,
          teamId: input.actor.teamId,
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
