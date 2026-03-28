import { Prisma, TransactionType } from "@prisma/client";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import {
  formatAuctionCompletedActivity,
  formatAuctionPlayerAwardedActivity,
} from "@/lib/domain/activity/formatters";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createPostDraftWarningService } from "@/lib/domain/draft/post-draft-warning-service";
import { createAuctionContractCreationService } from "@/lib/domain/auction/auction-contract-creation-service";
import { createBidValuationService } from "@/lib/domain/auction/bid-valuation-service";
import { createPostAuctionService } from "@/lib/domain/auction/post-auction-service";
import {
  acquisitionTypeForAuctionMode,
  assertAuctionActorCanBid,
  assertAuctionActorCanManage,
  AuctionDbClient,
  calculateBidValue,
  canOpenBid,
  compareBidValues,
  isBlindAuctionWindowActive,
  isResolvedAuctionEntryStatus,
  MIN_OPEN_BID_INCREMENT,
} from "@/lib/domain/auction/shared";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { logTransaction } from "@/lib/transactions";

class AuctionActionError extends Error {
  status: number;
  code: string;
  context?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

type DraftContext = {
  id: string;
  leagueId: string;
  seasonId: string;
  type: "VETERAN_AUCTION";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  title: string;
  auctionMode: "STANDARD" | "EMERGENCY_FILL_IN" | null;
  auctionEndsAt: Date | null;
  auctionOpenBidWindowSeconds: number | null;
  auctionBidResetSeconds: number | null;
  season: {
    year: number;
  };
};

export function createAuctionBiddingService(client: AuctionDbClient = prisma) {
  const bidValuationService = createBidValuationService(client);
  const activityPublisher = createActivityPublisher(prisma);

  /**
   * Resolve blind bid ties using deterministic random draw
   */
  async function resolveBlindTieRandomly(input: {
    tx: Prisma.TransactionClient;
    draft: DraftContext;
    poolEntryId: string;
    tiedBids: Array<{ id: string; biddingTeamId: string; salaryAmount: number; contractYears: number }>;
    resolvedAt: Date;
  }) {
    // Create deterministic seed from pool entry and tied bid IDs
    const seedData = [
      input.poolEntryId,
      ...input.tiedBids.map(b => b.id).sort(),
      input.resolvedAt.getTime(),
    ].join('::');
    
    // Simple deterministic random selection using seed hash
    let hash = 0;
    for (let i = 0; i < seedData.length; i++) {
      const char = seedData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    const selectedIndex = Math.abs(hash) % input.tiedBids.length;
    const winningBid = input.tiedBids[selectedIndex]!;
    
    const tieResolution = await input.tx.auctionBlindTieResolution.create({
      data: {
        draftId: input.draft.id,
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        poolEntryId: input.poolEntryId,
        tiedBidIds: JSON.stringify(input.tiedBids.map(b => b.id)),
        drawSeed: seedData,
        drawResult: JSON.stringify({
          tiedBids: input.tiedBids,
          selectedIndex,
          hash,
          algorithm: 'Simple hash modulo',
        }),
        winningBidId: winningBid.id,
        resolvedAt: input.resolvedAt,
      },
    });
    
    return {
      tieResolutionId: tieResolution.id,
      winningBidId: winningBid.id,
    };
  }

  async function loadDraftContext(input: {
    draftId: string;
    leagueId: string;
    seasonId: string;
  }): Promise<DraftContext> {
    const draft = await client.draft.findFirst({
      where: {
        id: input.draftId,
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        type: "VETERAN_AUCTION",
      },
      include: {
        season: {
          select: {
            year: true,
          },
        },
      },
    });

    if (!draft) {
      throw new AuctionActionError(404, "DRAFT_NOT_FOUND", "Veteran auction was not found.", {
        draftId: input.draftId,
      });
    }

    return {
      ...draft,
      type: "VETERAN_AUCTION",
    };
  }

  async function synchronizeAuctionStateTx(input: {
    tx: Prisma.TransactionClient;
    draft: DraftContext;
    now: Date;
  }) {
    const unresolvedEntries = await input.tx.auctionPlayerPoolEntry.findMany({
      where: {
        draftId: input.draft.id,
        status: {
          in: ["ELIGIBLE", "OPEN_BIDDING", "BLIND_BIDDING"], // Re-added BLIND_BIDDING for sync processing
        },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
          },
        },
        bids: {
          where: {
            status: "ACTIVE",
          },
          orderBy: [{ salaryAmount: "desc" }, { submittedAt: "asc" }],
        },
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });

    const blindWindowActive = isBlindAuctionWindowActive({
      auctionEndsAt: input.draft.auctionEndsAt,
      now: input.now,
    });

    let awardsCreated = 0;
    let expiredCount = 0;
    let reviewRequiredCount = 0;
    const affectedTeamIds = new Set<string>();
    const activityEvents: ReturnType<typeof formatAuctionPlayerAwardedActivity>[] = [];

    for (const entry of unresolvedEntries) {
      // VA-S9: Skip BLIND_BIDDING conversion for owner-facing (STANDARD) veteran auctions
      // Only EMERGENCY_FILL_IN auctions should use blind bidding final phase
      if (blindWindowActive && entry.status !== "BLIND_BIDDING" && input.draft.auctionMode === "EMERGENCY_FILL_IN") {
        // Track which teams held the lead during final 24 hours
        const blindStartsAt = new Date(input.draft.auctionEndsAt!.getTime() - 24 * 60 * 60 * 1000);
        const eligibleTeamIds: string[] = [];
        
        // Include current leading team
        if (entry.currentLeadingTeamId) {
          eligibleTeamIds.push(entry.currentLeadingTeamId);
        }
        
        // Find teams that held lead during final 24 hours by looking at bid history
        const recentBids = await input.tx.auctionBid.findMany({
          where: {
            poolEntryId: entry.id,
            status: "ACTIVE",
            submittedAt: {
              gte: blindStartsAt,
            },
          },
          select: {
            biddingTeamId: true,
            salaryAmount: true,
            contractYears: true,
            submittedAt: true,
          },
          orderBy: { submittedAt: "asc" },
        });
        
        // Track teams that achieved leading status during final 24 hours
        for (const bid of recentBids) {
          if (!eligibleTeamIds.includes(bid.biddingTeamId)) {
            eligibleTeamIds.push(bid.biddingTeamId);
          }
        }

        await input.tx.auctionPlayerPoolEntry.update({
          where: {
            id: entry.id,
          },
          data: {
            status: "BLIND_BIDDING",
            blindEligibleAt: entry.blindEligibleAt ?? input.now,
            blindConvertedAt: entry.blindConvertedAt ?? input.now,
            blindBiddingOpenedAt: entry.blindBiddingOpenedAt ?? input.now,
            blindBidClosesAt: entry.blindBidClosesAt ?? input.draft.auctionEndsAt,
            blindEligibleTeamIds: JSON.stringify(eligibleTeamIds),
            leadHistoryJson: JSON.stringify({
              finalLeadingTeamId: entry.currentLeadingTeamId,
              eligibleTeamIds,
              transitionedAt: input.now.toISOString(),
            }),
          },
        });
      }

      if (!blindWindowActive && entry.status === "OPEN_BIDDING" && entry.openBidClosesAt && entry.openBidClosesAt <= input.now) {
        const winningOpenBid = entry.bids.find((bid) => bid.bidType === "OPEN");
        if (winningOpenBid) {
          const awardResult = await awardWinningBidTx({
            tx: input.tx,
            draft: input.draft,
            poolEntryId: entry.id,
            winningBidId: winningOpenBid.id,
            awardedAt: input.now,
          });
          awardsCreated += 1;
          affectedTeamIds.add(awardResult.teamId);
          activityEvents.push(awardResult.activityEvent);
        } else {
          await input.tx.auctionPlayerPoolEntry.update({
            where: { id: entry.id },
            data: {
              status: "EXPIRED",
            },
          });
          expiredCount += 1;
        }
      }

      if (input.draft.auctionEndsAt && input.now >= input.draft.auctionEndsAt) {
        const currentEntry = await input.tx.auctionPlayerPoolEntry.findUnique({
          where: { id: entry.id },
          include: {
            bids: {
              where: {
                status: "ACTIVE",
              },
              orderBy: [{ salaryAmount: "desc" }, { submittedAt: "asc" }],
            },
          },
        });

        if (!currentEntry || isResolvedAuctionEntryStatus(currentEntry.status)) {
          continue;
        }

        const blindBids = currentEntry.bids.filter((bid) => bid.bidType === "BLIND");
        if (blindBids.length > 0) {
          // Sort by bid value using constitutional formula 
          const sortedBlindBids = blindBids.sort((a, b) => -compareBidValues(a, b));
          const highestValue = calculateBidValue(sortedBlindBids[0]!.salaryAmount, sortedBlindBids[0]!.contractYears);
          const topBlindBids = sortedBlindBids.filter(bid => 
            calculateBidValue(bid.salaryAmount, bid.contractYears) === highestValue
          );
          
          if (topBlindBids.length === 1) {
            const awardResult = await awardWinningBidTx({
              tx: input.tx,
              draft: input.draft,
              poolEntryId: currentEntry.id,
              winningBidId: topBlindBids[0]!.id,
              awardedAt: input.now,
            });
            awardsCreated += 1;
            affectedTeamIds.add(awardResult.teamId);
            activityEvents.push(awardResult.activityEvent);
            continue;
          }

          // Handle tied bids with deterministic random draw
          if (topBlindBids.length > 1) {
            const tieResult = await resolveBlindTieRandomly({
              tx: input.tx,
              draft: input.draft,
              poolEntryId: currentEntry.id,
              tiedBids: topBlindBids,
              resolvedAt: input.now,
            });
            
            const awardResult = await awardWinningBidTx({
              tx: input.tx,
              draft: input.draft,
              poolEntryId: currentEntry.id,
              winningBidId: tieResult.winningBidId,
              awardedAt: input.now,
            });
            awardsCreated += 1;
            affectedTeamIds.add(awardResult.teamId);
            activityEvents.push(awardResult.activityEvent);
            continue;
          }

          reviewRequiredCount += 1;
          continue;
        }

        const openBid = currentEntry.bids.find((bid) => bid.bidType === "OPEN");
        if (openBid) {
          const awardResult = await awardWinningBidTx({
            tx: input.tx,
            draft: input.draft,
            poolEntryId: currentEntry.id,
            winningBidId: openBid.id,
            awardedAt: input.now,
          });
          awardsCreated += 1;
          affectedTeamIds.add(awardResult.teamId);
          activityEvents.push(awardResult.activityEvent);
          continue;
        }

        await input.tx.auctionPlayerPoolEntry.update({
          where: {
            id: currentEntry.id,
          },
          data: {
            status: "EXPIRED",
          },
        });
        expiredCount += 1;
      }
    }

    const remainingReviewCount = await input.tx.auctionPlayerPoolEntry.count({
      where: {
        draftId: input.draft.id,
        status: {
          in: ["ELIGIBLE", "OPEN_BIDDING", "BLIND_BIDDING"],
        },
      },
    });

    let completed = false;
    if (remainingReviewCount === 0 && input.draft.status !== "COMPLETED") {
      await input.tx.draft.update({
        where: {
          id: input.draft.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: input.now,
        },
      });
      completed = true;
    }

    return {
      awardsCreated,
      expiredCount,
      reviewRequiredCount,
      completed,
      affectedTeamIds: [...affectedTeamIds],
      activityEvents,
      completionEvent: completed
        ? formatAuctionCompletedActivity({
            draftId: input.draft.id,
            title: input.draft.title,
            occurredAt: input.now,
          })
        : null,
    };
  }

  async function awardWinningBidTx(input: {
    tx: Prisma.TransactionClient;
    draft: DraftContext;
    poolEntryId: string;
    winningBidId: string;
    awardedAt: Date;
  }) {
    const entry = await input.tx.auctionPlayerPoolEntry.findUnique({
      where: {
        id: input.poolEntryId,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
        bids: {
          where: {
            status: "ACTIVE",
          },
          orderBy: [{ submittedAt: "asc" }],
        },
      },
    });

    if (!entry || isResolvedAuctionEntryStatus(entry.status)) {
      throw new AuctionActionError(409, "AUCTION_ENTRY_INVALID", "Auction entry is no longer available to award.", {
        poolEntryId: input.poolEntryId,
      });
    }

    const winningBid = entry.bids.find((bid) => bid.id === input.winningBidId);
    if (!winningBid) {
      throw new AuctionActionError(404, "AUCTION_BID_NOT_FOUND", "Winning bid was not found for this entry.", {
        winningBidId: input.winningBidId,
      });
    }

    const auctionContractCreationService = createAuctionContractCreationService(input.tx);
    const contractEffects = await auctionContractCreationService.createAwardedContract({
      leagueId: input.draft.leagueId,
      seasonId: input.draft.seasonId,
      seasonYear: input.draft.season.year,
      teamId: winningBid.biddingTeamId,
      playerId: entry.playerId,
      salary: winningBid.salaryAmount,
      yearsTotal: winningBid.contractYears,
      auctionMode: input.draft.auctionMode,
      effectiveAt: input.awardedAt,
    });

    const award = await input.tx.auctionAward.create({
      data: {
        draftId: input.draft.id,
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        poolEntryId: entry.id,
        winningBidId: winningBid.id,
        awardedTeamId: winningBid.biddingTeamId,
        playerId: entry.playerId,
        contractId: contractEffects.contract.id,
        rosterAssignmentId: contractEffects.rosterAssignment.id,
        salaryAmount: winningBid.salaryAmount,
        contractYears: winningBid.contractYears,
        acquisitionType: acquisitionTypeForAuctionMode(input.draft.auctionMode),
        status: "FINALIZED",
        awardedAt: input.awardedAt,
      },
    });

    await input.tx.auctionBid.update({
      where: {
        id: winningBid.id,
      },
      data: {
        status: "WON",
      },
    });

    await input.tx.auctionBid.updateMany({
      where: {
        poolEntryId: entry.id,
        id: {
          not: winningBid.id,
        },
        status: "ACTIVE",
      },
      data: {
        status: "LOST",
      },
    });

    await input.tx.auctionPlayerPoolEntry.update({
      where: {
        id: entry.id,
      },
      data: {
        status: "AWARDED",
        currentLeadingBidAmount: winningBid.salaryAmount,
        currentLeadingTeamId: winningBid.biddingTeamId,
        awardedAt: input.awardedAt,
      },
    });

    await logTransaction(input.tx, {
      leagueId: input.draft.leagueId,
      seasonId: input.draft.seasonId,
      teamId: winningBid.biddingTeamId,
      playerId: entry.playerId,
      type: TransactionType.ADD,
      summary: `Auction awarded ${entry.player.name} to ${contractEffects.team.name}.`,
      metadata: {
        draftId: input.draft.id,
        auctionAwardId: award.id,
        auctionBidId: winningBid.id,
        salaryAmount: winningBid.salaryAmount,
        contractYears: winningBid.contractYears,
        updatedBy: "auction-bidding-service award",
      },
    });

    await logTransaction(input.tx, {
      leagueId: input.draft.leagueId,
      seasonId: input.draft.seasonId,
      teamId: winningBid.biddingTeamId,
      playerId: entry.playerId,
      type: TransactionType.CONTRACT_CREATE,
      summary: `Auction created ${winningBid.contractYears}-year $${winningBid.salaryAmount} contract for ${entry.player.name}.`,
      metadata: {
        draftId: input.draft.id,
        auctionAwardId: award.id,
        contractId: contractEffects.contract.id,
        updatedBy: "auction-bidding-service award",
      },
    });

    return {
      awardId: award.id,
      teamId: winningBid.biddingTeamId,
      activityEvent: formatAuctionPlayerAwardedActivity({
        draftId: input.draft.id,
        awardId: award.id,
        team: {
          id: winningBid.biddingTeamId,
          name: contractEffects.team.name,
        },
        player: {
          id: entry.player.id,
          name: entry.player.name,
        },
        salaryAmount: winningBid.salaryAmount,
        contractYears: winningBid.contractYears,
        occurredAt: input.awardedAt,
      }),
    };
  }

  async function syncAndMaybeWarn(input: {
    draft: DraftContext;
    actorUserId?: string | null;
    actorRoleSnapshot?: CanonicalLeagueRole | null;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const syncResult = await prisma.$transaction(
      async (tx) => synchronizeAuctionStateTx({ tx, draft: input.draft, now }),
      { timeout: 15_000 },
    );

    for (const teamId of syncResult.affectedTeamIds) {
      await createComplianceIssueService(prisma).syncTeamComplianceState({
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        teamId,
        actorUserId: input.actorUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
      });
    }

    if (syncResult.completed) {
      await createPostDraftWarningService(prisma).createCutdownWarnings({
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        draftId: input.draft.id,
        draftLabel: "veteran auction",
        actorUserId: input.actorUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        now,
      });

      // Execute emergency fill-in if teams have short rosters
      const postAuctionService = createPostAuctionService(prisma);
      const emergencyFillResult = await postAuctionService.detectAndExecuteEmergencyFillIn({
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        draftId: input.draft.id,
        actorUserId: input.actorUserId,
        now,
      });
      
      if (emergencyFillResult.triggered && emergencyFillResult.fillInResults.length > 0) {
        // TODO: Add activity event for emergency fill-in completion
        console.log(`Emergency fill-in completed: ${emergencyFillResult.fillInResults.length} players assigned.`);
      }
    }

    for (const activityEvent of syncResult.activityEvents) {
      await activityPublisher.publishSafe({
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        actorUserId: input.actorUserId ?? null,
        ...activityEvent,
      });
    }

    if (syncResult.completionEvent) {
      await activityPublisher.publishSafe({
        leagueId: input.draft.leagueId,
        seasonId: input.draft.seasonId,
        actorUserId: input.actorUserId ?? null,
        ...syncResult.completionEvent,
      });
    }

    return syncResult;
  }

  return {
    isActionError(error: unknown): error is AuctionActionError {
      return error instanceof AuctionActionError;
    },

    async syncAuctionState(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      actorUserId?: string | null;
      actorRoleSnapshot?: CanonicalLeagueRole | null;
      now?: Date;
    }) {
      const draft = await loadDraftContext(input);
      return syncAndMaybeWarn({
        draft,
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot,
        now: input.now,
      });
    },

    async placeOpenBid(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      poolEntryId: string;
      biddingTeamId: string;
      salaryAmount: number;
      contractYears: number;
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const draft = await loadDraftContext(input);

      await syncAndMaybeWarn({
        draft,
        actorUserId: input.actor.userId,
        actorRoleSnapshot: input.actor.leagueRole,
        now,
      });

      assertAuctionActorCanBid({
        actorRole: input.actor.leagueRole,
        actorTeamId: input.actor.teamId,
        biddingTeamId: input.biddingTeamId,
      });

      const valuation = await bidValuationService.evaluate({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        draftId: input.draftId,
        teamId: input.biddingTeamId,
        poolEntryId: input.poolEntryId,
        bidType: "OPEN",
        salaryAmount: input.salaryAmount,
        contractYears: input.contractYears,
        now,
      });

      if (!valuation.legal) {
        throw new AuctionActionError(409, "AUCTION_BID_INVALID", valuation.blockedReason ?? "Open bid is invalid.", {
          rejectionType: valuation.rejectionType,
          rejectionContext: valuation.context,
          warnings: valuation.warnings,
          projected: valuation.projected,
        });
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const draftInTx = await tx.draft.findUnique({
            where: { id: input.draftId },
            include: {
              season: {
                select: { year: true },
              },
            },
          });
          if (!draftInTx || draftInTx.status !== "IN_PROGRESS") {
            throw new AuctionActionError(409, "DRAFT_STATE_CONFLICT", "Veteran auction must be in progress to place open bids.", {
              draftId: input.draftId,
            });
          }

          const poolEntry = await tx.auctionPlayerPoolEntry.findUnique({
            where: {
              id: input.poolEntryId,
            },
          });

          if (!poolEntry || poolEntry.draftId !== input.draftId || !canOpenBid(poolEntry.status)) {
            throw new AuctionActionError(409, "AUCTION_ENTRY_INVALID", "This player is not available for open bidding.", {
              poolEntryId: input.poolEntryId,
            });
          }

          if (
            poolEntry.currentLeadingBidAmount !== null &&
            input.salaryAmount < poolEntry.currentLeadingBidAmount + MIN_OPEN_BID_INCREMENT
          ) {
            throw new AuctionActionError(409, "AUCTION_BID_INVALID", `Open bids must exceed the current leading salary by at least $${MIN_OPEN_BID_INCREMENT}.`, {
              poolEntryId: input.poolEntryId,
              currentLeadingBidAmount: poolEntry.currentLeadingBidAmount,
            });
          }

          // Validate against constitutional bid valuation  
          const existingBids = await tx.auctionBid.findMany({
            where: {
              poolEntryId: input.poolEntryId,
              bidType: "OPEN",
              status: "ACTIVE",
            },
            select: {
              id: true,
              salaryAmount: true,
              contractYears: true,
            },
          });

          // Check that new bid beats all existing bids using constitutional formula
          const newBidValue = calculateBidValue(input.salaryAmount, input.contractYears);
          for (const existingBid of existingBids) {
            const existingBidValue = calculateBidValue(existingBid.salaryAmount, existingBid.contractYears);
            if (newBidValue <= existingBidValue) {
              throw new AuctionActionError(409, "AUCTION_BID_INVALID", `Bid value $${newBidValue} must exceed current leading value of $${existingBidValue}.`, {
                poolEntryId: input.poolEntryId,
                newBidValue,
                existingBidValue,
              });
            }
          }

          await tx.auctionBid.updateMany({
            where: {
              poolEntryId: input.poolEntryId,
              bidType: "OPEN",
              status: "ACTIVE",
            },
            data: {
              status: "OUTBID",
            },
          });

          const bid = await tx.auctionBid.create({
            data: {
              draftId: input.draftId,
              leagueId: input.leagueId,
              seasonId: input.seasonId,
              poolEntryId: input.poolEntryId,
              biddingTeamId: input.biddingTeamId,
              bidderUserId: input.actor.userId,
              bidType: "OPEN",
              salaryAmount: input.salaryAmount,
              contractYears: input.contractYears,
              status: "ACTIVE",
              submittedAt: now,
            },
          });

          const resetSeconds =
            poolEntry.status === "ELIGIBLE"
              ? draftInTx.auctionOpenBidWindowSeconds ?? 300 // 5 minutes per constitution
              : draftInTx.auctionBidResetSeconds ?? 300; // 5 minutes per constitution

          await tx.auctionPlayerPoolEntry.update({
            where: {
              id: poolEntry.id,
            },
            data: {
              nominatedByTeamId: poolEntry.nominatedByTeamId ?? input.biddingTeamId,
              openedByUserId: poolEntry.openedByUserId ?? input.actor.userId,
              status: "OPEN_BIDDING",
              openBiddingOpenedAt: poolEntry.openBiddingOpenedAt ?? now,
              openBidClosesAt: new Date(now.getTime() + resetSeconds * 1000),
              currentLeadingBidAmount: input.salaryAmount,
              currentLeadingTeamId: input.biddingTeamId,
            },
          });

          return {
            bidId: bid.id,
          };
        },
        { timeout: 15_000 },
      );

      return {
        bidId: result.bidId,
        warnings: valuation.warnings,
      };
    },

    async placeBlindBid(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      poolEntryId: string;
      biddingTeamId: string;
      salaryAmount: number;
      contractYears: number;
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const draft = await loadDraftContext(input);

      await syncAndMaybeWarn({
        draft,
        actorUserId: input.actor.userId,
        actorRoleSnapshot: input.actor.leagueRole,
        now,
      });

      assertAuctionActorCanBid({
        actorRole: input.actor.leagueRole,
        actorTeamId: input.actor.teamId,
        biddingTeamId: input.biddingTeamId,
      });

      const valuation = await bidValuationService.evaluate({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        draftId: input.draftId,
        teamId: input.biddingTeamId,
        poolEntryId: input.poolEntryId,
        bidType: "BLIND",
        salaryAmount: input.salaryAmount,
        contractYears: input.contractYears,
        now,
      });

      if (!valuation.legal) {
        throw new AuctionActionError(409, "AUCTION_BID_INVALID", valuation.blockedReason ?? "Blind bid is invalid.", {
          warnings: valuation.warnings,
          projected: valuation.projected,
        });
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const draftInTx = await tx.draft.findUnique({
            where: { id: input.draftId },
          });

          if (!draftInTx || draftInTx.status !== "IN_PROGRESS") {
            throw new AuctionActionError(409, "DRAFT_STATE_CONFLICT", "Veteran auction must be in progress to submit blind bids.", {
              draftId: input.draftId,
            });
          }

          const poolEntry = await tx.auctionPlayerPoolEntry.findUnique({
            where: { id: input.poolEntryId },
          });

          if (!poolEntry || poolEntry.draftId !== input.draftId) {
            throw new AuctionActionError(409, "AUCTION_ENTRY_INVALID", "This player is not available for blind bidding.", {
              poolEntryId: input.poolEntryId,
            });
          }

          // Blind bidding is no longer supported - throw error
          throw new AuctionActionError(410, "FEATURE_REMOVED", "Blind bidding has been removed in favor of the canonical three-state auction model.", {
            poolEntryId: input.poolEntryId,
          });
        },
        { timeout: 15_000 },
      );

      // This code should never be reached due to the error above
      return {
        bidId: "",
        warnings: [],
      };
    },

    async reopenAuctionEntry(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      poolEntryId: string;
      reason: string;
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
      };
      now?: Date;
    }) {
      assertAuctionActorCanManage(input.actor.leagueRole);

      const reason = input.reason.trim();
      if (!reason) {
        throw new AuctionActionError(400, "OVERRIDE_REASON_REQUIRED", "Commissioner reopen requires a written reason for entry, sync, or administrative error.");
      }

      // Validate reason contains allowed terms
      const allowedReasons = ['entry error', 'sync error', 'administrative error'];
      const reasonLower = reason.toLowerCase();
      const hasValidReason = allowedReasons.some(validReason => reasonLower.includes(validReason));
      
      if (!hasValidReason) {
        throw new AuctionActionError(400, "INVALID_REOPEN_REASON", "Reopen reason must reference entry error, sync error, or administrative error.", {
          reason,
          allowedReasons,
        });
      }

      const now = input.now ?? new Date();
      const draft = await loadDraftContext(input);

      const result = await prisma.$transaction(
        async (tx) => {
          const entry = await tx.auctionPlayerPoolEntry.findUnique({
            where: { id: input.poolEntryId },
            include: {
              award: true,
              bids: {
                where: { status: "ACTIVE" },
              },
            },
          });

          if (!entry || entry.draftId !== input.draftId) {
            throw new AuctionActionError(404, "AUCTION_ENTRY_NOT_FOUND", "Auction entry not found.", {
              poolEntryId: input.poolEntryId,
            });
          }

          if (!isResolvedAuctionEntryStatus(entry.status)) {
            throw new AuctionActionError(409, "AUCTION_ENTRY_NOT_RESOLVED", "Only awarded or expired entries can be reopened.", {
              poolEntryId: input.poolEntryId,
              currentStatus: entry.status,
            });
          }

          // Void any existing award
          if (entry.award) {
            await tx.auctionAward.update({
              where: { id: entry.award.id },
              data: { status: "VOIDED" },
            });
          }

          // Update all bids to CANCELED status
          await tx.auctionBid.updateMany({
            where: { poolEntryId: entry.id },
            data: { status: "CANCELED" },
          });

          // Navigate back to ELIGIBLE status
          const reopenedEntry = await tx.auctionPlayerPoolEntry.update({
            where: { id: entry.id },
            data: {
              previousStatus: entry.status,
              status: "REOPENED",
              reopenedAt: now,
              reopenedByUserId: input.actor.userId,
              reopenReason: reason,
              currentLeadingBidAmount: null,
              currentLeadingTeamId: null,
              awardedAt: null,
              openBidClosesAt: null,
              blindBidClosesAt: null,
            },
          });

          return { entryId: reopenedEntry.id };
        },
        { timeout: 15_000 },
      );

      // Record commissioner override
      await createCommissionerOverrideService(prisma).recordOverride({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: null, // Auction-level override
        overrideType: "MANUAL_RULING",
        reason,
        entityType: "auction_entry",
        entityId: input.poolEntryId,
        actorUserId: input.actor.userId,
        notificationTitle: `Auction entry reopened: ${reason}`,
      });

      return result;
    },

    async reviewBlindTie(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      poolEntryId: string;
      winningBidId: string;
      reason: string;
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
      };
      now?: Date;
    }) {
      assertAuctionActorCanManage(input.actor.leagueRole);

      const reason = input.reason.trim();
      if (!reason) {
        throw new AuctionActionError(400, "OVERRIDE_REASON_REQUIRED", "Commissioner review requires a written reason.");
      }

      const now = input.now ?? new Date();
      const draft = await loadDraftContext(input);

      const result = await prisma.$transaction(
        async (tx) => {
          const entry = await tx.auctionPlayerPoolEntry.findUnique({
            where: { id: input.poolEntryId },
            include: {
              bids: {
                where: {
                  status: "ACTIVE",
                  bidType: "BLIND",
                },
                orderBy: [{ submittedAt: "asc" }],
              },
            },
          });

          if (!entry || entry.draftId !== input.draftId || entry.status !== "BLIND_BIDDING") {
            throw new AuctionActionError(409, "AUCTION_ENTRY_INVALID", "Only unresolved blind-auction entries can be reviewed.", {
              poolEntryId: input.poolEntryId,
            });
          }

          // Sort bids by constitutional valuation, then find ties
          const sortedBids = entry.bids.sort((a, b) => -compareBidValues(a, b));
          const highestValue = calculateBidValue(sortedBids[0]!.salaryAmount, sortedBids[0]!.contractYears);
          const tiedBids = sortedBids.filter(bid => 
            calculateBidValue(bid.salaryAmount, bid.contractYears) === highestValue
          );
          
          if (tiedBids.length < 2 || !tiedBids.some((bid) => bid.id === input.winningBidId)) {
            throw new AuctionActionError(409, "AUCTION_REVIEW_INVALID", "Commissioner review is only available for tied highest-value blind bids.", {
              poolEntryId: input.poolEntryId,
            });
          }

          const awardResult = await awardWinningBidTx({
            tx,
            draft,
            poolEntryId: input.poolEntryId,
            winningBidId: input.winningBidId,
            awardedAt: now,
          });

          const override = await createCommissionerOverrideService(tx).recordOverride({
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: awardResult.teamId,
            actorUserId: input.actor.userId,
            actorRoleSnapshot: input.actor.leagueRole,
            overrideType: "MANUAL_RULING",
            reason,
            entityType: "AUCTION_BLIND_TIE",
            entityId: input.poolEntryId,
            metadata: {
              draftId: input.draftId,
              poolEntryId: input.poolEntryId,
              winningBidId: input.winningBidId,
            },
            notificationTitle: "Commissioner resolved auction blind-bid tie",
            notificationBody: reason,
          });

          const syncResult = await synchronizeAuctionStateTx({
            tx,
            draft,
            now,
          });

          return {
            overrideId: override.id,
            completed: syncResult.completed,
            teamId: awardResult.teamId,
            activityEvents: [awardResult.activityEvent, ...syncResult.activityEvents],
            completionEvent: syncResult.completionEvent,
          };
        },
        { timeout: 15_000 },
      );

      await createComplianceIssueService(prisma).syncTeamComplianceState({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: result.teamId,
        actorUserId: input.actor.userId,
        actorRoleSnapshot: input.actor.leagueRole,
      });

      if (result.completed) {
        await createPostDraftWarningService(prisma).createCutdownWarnings({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          draftId: input.draftId,
          draftLabel: "veteran auction",
          actorUserId: input.actor.userId,
          actorRoleSnapshot: input.actor.leagueRole,
          now,
        });
      }

      for (const activityEvent of result.activityEvents) {
        await activityPublisher.publishSafe({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          actorUserId: input.actor.userId,
          ...activityEvent,
        });
      }

      if (result.completionEvent) {
        await activityPublisher.publishSafe({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          actorUserId: input.actor.userId,
          ...result.completionEvent,
        });
      }

      return result;
    },
  };
}
