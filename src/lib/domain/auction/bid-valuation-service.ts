import { AuctionBidType } from "@prisma/client";
import { createReadOnlyValidationContextLoader } from "@/lib/compliance/read-context";
import {
  AuctionDbClient,
  canOpenBid,
  calculateBidValue,
  compareBidValues,
  isBlindAuctionWindowActive,
  MIN_OPEN_BID_INCREMENT,
} from "@/lib/domain/auction/shared";
import { createTeamFinancialStateService } from "@/lib/domain/contracts/team-financial-state-service";
import { BidRejectionType, BidRejectionContext } from "@/types/draft";
import { prisma } from "@/lib/prisma";

// VA-S11: Enhanced bid validation response type
type BidValuationResult = {
  legal: boolean;
  blockedReason: string | null;
  rejectionType: BidRejectionType | null;
  context: BidRejectionContext;
  warnings: string[];
  projected: {
    activeCapTotal: number;
    deadCapTotal: number;
    hardCapTotal: number;
    rosterCount: number;
  } | null;
};

export function createBidValuationService(client: AuctionDbClient = prisma) {
  const financialsService = createTeamFinancialStateService(client);
  const validationContextLoader = createReadOnlyValidationContextLoader(client);

  return {
    async evaluate(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      teamId: string;
      poolEntryId: string;
      bidType: AuctionBidType;
      salaryAmount: number;
      contractYears: number;
      now?: Date;
    }): Promise<BidValuationResult> {
      const now = input.now ?? new Date();
      const [draft, poolEntry, ruleset, validationContext, financials] = await Promise.all([
        client.draft.findFirst({
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
            auctionEndsAt: true,
            auctionOpenBidWindowSeconds: true,
            auctionBidResetSeconds: true,
          },
        }),
        client.auctionPlayerPoolEntry.findFirst({
          where: {
            id: input.poolEntryId,
            draftId: input.draftId,
          },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                isRestricted: true,
              },
            },
          },
        }),
        client.leagueRuleSet.findFirst({
          where: {
            leagueId: input.leagueId,
            isActive: true,
          },
          orderBy: [{ version: "desc" }],
        }),
        validationContextLoader.loadTeamValidationContext({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.teamId,
        }),
        financialsService.readTeamSeasonFinancials({
          teamId: input.teamId,
          seasonId: input.seasonId,
        }),
      ]);

      if (!draft || !poolEntry || !ruleset || !validationContext) {
        return {
          legal: false,
          blockedReason: "Auction context could not be resolved.",
          rejectionType: "CONTEXT_MISSING" as const,
          context: {
            poolEntryStatus: poolEntry?.status || null,
            playerName: poolEntry?.player?.name || null,
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (draft.status !== "IN_PROGRESS") {
        return {
          legal: false,
          blockedReason: "Auction must be in progress to place bids.",
          rejectionType: "AUCTION_CLOSED" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            auctionStatus: draft.status,
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (poolEntry.player.isRestricted) {
        return {
          legal: false,
          blockedReason: "Restricted players cannot be awarded through the auction.",
          rejectionType: "PLAYER_RESTRICTED" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            isRestricted: true,
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (input.bidType === "OPEN" && !canOpenBid(poolEntry.status)) {
        return {
          legal: false,
          blockedReason: "Open bids are not allowed for this player.",
          rejectionType: "WRONG_ENTRY_STATUS" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            bidType: input.bidType,
            allowedStatuses: ["ELIGIBLE", "OPEN_BIDDING", "REOPENED", "BLIND_BIDDING"],
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      // Removed BLIND bid validation - canonical model only supports OPEN bids

      const blindWindowActive = isBlindAuctionWindowActive({
        auctionEndsAt: draft.auctionEndsAt,
        now,
      });
      // VA-S9: Allow open bidding during final 24 hours for owner-facing (STANDARD) auctions
      if (input.bidType === "OPEN" && blindWindowActive && draft.auctionMode === "EMERGENCY_FILL_IN") {
        return {
          legal: false,
          blockedReason: "Open bidding is closed during the final 24-hour blind-auction window.",
          rejectionType: "CLOSED_BID_WINDOW" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            auctionMode: draft.auctionMode,
            blindWindowActive,
            auctionEndsAt: draft.auctionEndsAt?.toISOString() || null,
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (input.bidType === "BLIND" && !blindWindowActive) {
        return {
          legal: false,
          blockedReason: "Blind bids are only available in the final 24-hour blind-auction window.",
          rejectionType: "CLOSED_BID_WINDOW" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            auctionMode: draft.auctionMode,
            blindWindowActive,
            auctionEndsAt: draft.auctionEndsAt?.toISOString() || null,
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (!Number.isInteger(input.salaryAmount) || input.salaryAmount < ruleset.minSalary) {
        return {
          legal: false,
          blockedReason: `Salary must be at least ${ruleset.minSalary}.`,
          rejectionType: "RULE_VIOLATION" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            proposedSalary: input.salaryAmount,
            minimumSalary: ruleset.minSalary,
            rule: "minimum_salary",
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (
        !Number.isInteger(input.contractYears) ||
        input.contractYears < ruleset.minContractYears ||
        input.contractYears > ruleset.maxContractYears
      ) {
        return {
          legal: false,
          blockedReason: `Contract years must be between ${ruleset.minContractYears} and ${ruleset.maxContractYears}.`,
          rejectionType: "RULE_VIOLATION" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            proposedYears: input.contractYears,
            minimumYears: ruleset.minContractYears,
            maximumYears: ruleset.maxContractYears,
            rule: "contract_years_range",
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (
        input.salaryAmount < 10 &&
        input.contractYears > ruleset.maxContractYearsIfSalaryBelowTen
      ) {
        return {
          legal: false,
          blockedReason: `Players below $10 cannot exceed ${ruleset.maxContractYearsIfSalaryBelowTen} years.`,
          rejectionType: "RULE_VIOLATION" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            proposedSalary: input.salaryAmount,
            proposedYears: input.contractYears,
            maxYearsForLowSalary: ruleset.maxContractYearsIfSalaryBelowTen,
            rule: "low_salary_year_limit",
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      if (
        input.bidType === "OPEN" &&
        poolEntry.currentLeadingBidAmount !== null &&
        input.salaryAmount < poolEntry.currentLeadingBidAmount + MIN_OPEN_BID_INCREMENT
      ) {
        return {
          legal: false,
          blockedReason: `Open bids must exceed the current leading salary by at least $${MIN_OPEN_BID_INCREMENT}.`,
          rejectionType: "INSUFFICIENT_RAISE" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            currentLeadingSalary: poolEntry.currentLeadingBidAmount,
            proposedSalary: input.salaryAmount,
            minimumRequired: poolEntry.currentLeadingBidAmount + MIN_OPEN_BID_INCREMENT,
            incrementRequired: MIN_OPEN_BID_INCREMENT,
          },
          warnings: [] as string[],
          projected: null,
        };
      }

      // Constitutional bid value comparison for open bids
      if (input.bidType === "OPEN") {
        const activeBids = await client.auctionBid.findMany({
          where: {
            poolEntryId: input.poolEntryId,
            status: "ACTIVE",
            bidType: "OPEN"
          },
          select: {
            id: true,
            salaryAmount: true,
            contractYears: true,
            submittedAt: true,
            biddingTeamId: true,
          },
          orderBy: { submittedAt: "desc" },
        });

        const currentBid = {
          salaryAmount: input.salaryAmount,
          contractYears: input.contractYears
        };

        // Check if this bid beats all existing bids using constitutional formula
        for (const existingBid of activeBids) {
          const comparison = compareBidValues(currentBid, existingBid);
          if (comparison <= 0) {
            const currentValue = calculateBidValue(input.salaryAmount, input.contractYears);
            const existingValue = calculateBidValue(existingBid.salaryAmount, existingBid.contractYears);
            return {
              legal: false,
              blockedReason: `Bid value $${currentValue} does not exceed current leading value of $${existingValue}. Use bid valuation formula: salary × years + (salary × 0.5 × years_not_offered_to_four).`,
              rejectionType: "BID_VALUE_TOO_LOW" as const,
              context: {
                poolEntryStatus: poolEntry.status,
                playerName: poolEntry.player.name,
                proposedValue: currentValue,
                currentLeadingValue: existingValue,
                proposedSalary: input.salaryAmount,
                proposedYears: input.contractYears,
                leadingSalary: existingBid.salaryAmount,
                leadingYears: existingBid.contractYears,
                formula: "salary × years + (salary × 0.5 × years_not_offered_to_four)",
              },
              warnings: [] as string[],
              projected: null,
            };
          }
        }
      }

      const projected = {
        activeCapTotal: financials.activeCapTotal + input.salaryAmount,
        deadCapTotal: financials.deadCapTotal,
        hardCapTotal: financials.hardCapTotal + input.salaryAmount,
        rosterCount: validationContext.rosterSlots.length + 1,
      };

      if (projected.hardCapTotal > ruleset.salaryCapHard) {
        return {
          legal: false,
          blockedReason: `Awarding this bid would exceed the hard cap of $${ruleset.salaryCapHard}.`,
          rejectionType: "CAP_VIOLATION" as const,
          context: {
            poolEntryStatus: poolEntry.status,
            playerName: poolEntry.player.name,
            currentHardCap: financials.hardCapTotal,
            proposedSalary: input.salaryAmount,
            projectedHardCap: projected.hardCapTotal,
            hardCapLimit: ruleset.salaryCapHard,
            overage: projected.hardCapTotal - ruleset.salaryCapHard,
          },
          warnings: [] as string[],
          projected,
        };
      }

      const warnings: string[] = [];
      if (projected.activeCapTotal > ruleset.salaryCapSoft) {
        warnings.push(`Projected active cap would exceed the soft cap of $${ruleset.salaryCapSoft}.`);
      }

      if (projected.rosterCount > ruleset.rosterSize) {
        warnings.push(`Projected roster count would exceed the roster size of ${ruleset.rosterSize}.`);
      }

      return {
        legal: true,
        blockedReason: null,
        rejectionType: null,
        context: {
          poolEntryStatus: poolEntry.status,
          playerName: poolEntry.player.name,
        },
        warnings,
        projected,
      };
    },
  };
}
