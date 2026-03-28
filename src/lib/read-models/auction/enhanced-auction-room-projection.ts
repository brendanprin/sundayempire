import { createAuctionRoomProjection } from "@/lib/read-models/auction/auction-room-projection";
import { 
  AuctionDbClient, 
  VeteranAuctionDisplayState,
  deriveVeteranAuctionDisplayState,
  getVeteranAuctionDisplayConfig
} from "@/lib/domain/auction/shared";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import type { VeteranAuctionRoomProjection } from "@/lib/read-models/draft/types";

/**
 * Enhanced auction room projection that includes board-optimized data
 * for the new dense auction board UX.
 */

export type AuctionBoardRow = {
  // Core identification
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
  draftRank: number | null;
  isRestricted: boolean; // Player eligibility for auction bidding
  
  // Canonical auction state (VA-1)
  entryId: string;
  status: string; // Original database status
  displayState: VeteranAuctionDisplayState; // Canonical display state
  displayConfig: ReturnType<typeof getVeteranAuctionDisplayConfig>; // UI configuration
  
  // Leading bid info - shown based on displayConfig
  currentLeaderTeamName: string | null;
  currentLeaderTeamAbbreviation: string | null;
  // VA-S5: Add team ID for canonical presenter leader checks
  currentLeaderTeamId: string | null;
  leadingSalary: number | null;
  leadingYears: number | null;
  leadingTotalValue: number | null;
  
  // Time information - shown based on displayConfig
  timeLeftSeconds: number | null;
  openBidClosesAt: string | null;
  
  // User involvement
  myInvolvementState: 'leading' | 'bidding' | 'available';
  isMyLeader: boolean;
  isMyBidding: boolean;
  
  // Legacy states removed for canonical model
  isAwarded: boolean;
  isReviewRequired: boolean;
  
  // Quick access
  hasAward: boolean;
  awardedTeamName: string | null;
  // VA-S5: Additional award fields for canonical presenter
  awardedTeamId: string | null;
  awardedTeamAbbreviation: string | null; // VA-S20: Team abbreviation for concise display
  awardedSalary: number | null;
  awardedYears: number | null;
};

function calculateTimeLeftSeconds(closesAt: string | null, now: Date): number | null {
  if (!closesAt) return null;
  
  const closeTime = new Date(closesAt);
  const diffMs = closeTime.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

function determineMyInvolvementState(
  currentLeaderTeamId: string | null,
  myTeamId: string | null,
  hasMyBid: boolean,
  hasValidLeadingBid: boolean, // VA-S4: Require valid bid for leading state
): 'leading' | 'bidding' | 'available' {
  if (!myTeamId) return 'available';
  
  // VA-S4: Only consider someone "leading" if there's both team match AND valid leading bid data
  if (currentLeaderTeamId === myTeamId && hasValidLeadingBid) return 'leading';
  if (hasMyBid) return 'bidding';
  return 'available';
}

export type EnhancedAuctionRoomProjection = VeteranAuctionRoomProjection & {
  boardRows: AuctionBoardRow[];
  summary: {
    totalEntries: number;
    myLeadingCount: number;
    myBiddingCount: number;
    openMarketCount: number;
    activeBiddingCount: number;
    awardedCount: number;
    ineligibleCount: number;
    reviewRequiredCount: number;
  };
  contextualPermissions: {
    canPlaceBids: boolean;
    hasActiveTeam: boolean;
    isCommissioner: boolean;
  };
  auctionConfig: {
    mode: string;
    blindWindowActive: boolean;
    isEmergencyFillIn: boolean;
  };
};

export function createEnhancedAuctionRoomProjection(client: AuctionDbClient = prisma) {
  const baseProjection = createAuctionRoomProjection(client);
  
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
    }): Promise<EnhancedAuctionRoomProjection | null> {
      const now = input.now ?? new Date();
      
      // Get the base projection first
      const base = await baseProjection.read(input);
      if (!base) return null;
      
      // Transform entries to board-optimized rows with canonical state
      const boardRows: AuctionBoardRow[] = base.entries.map((entry) => {
        // VA-1: Derive canonical display state from database state
        const hasActiveBid = Boolean(entry.currentLeadingBidAmount && entry.currentLeadingTeam);
        const isAwarded = entry.status === 'AWARDED' || Boolean(entry.award);
        
        const displayState = deriveVeteranAuctionDisplayState({
          status: entry.status,
          hasActiveBid,
          isAwarded,
        });
        
        const displayConfig = getVeteranAuctionDisplayConfig(displayState);
        
        // Only use open bid timer for canonical model (no blind bidding)
        const timeLeftSeconds = calculateTimeLeftSeconds(entry.openBidClosesAt, now);
        
        // Get leading bid years from enhanced base projection
        const leadingYears = entry.currentLeadingBidYears;
        
        // Ensure data consistency - if we have a leading bid amount, we should have years and value  
        const hasValidLeadingBid = Boolean(entry.currentLeadingBidAmount && leadingYears && entry.currentLeadingBidValue);
        
        // Determine user involvement - ensure consistency with leading bid state (VA-S4)
        const hasMyBid = Boolean(entry.myOpenBid); // Removed myBlindBid for canonical model
        const myInvolvementState = determineMyInvolvementState(
          entry.currentLeadingTeam?.id || null,
          input.actor.teamId,
          hasMyBid,
          hasValidLeadingBid, // VA-S4: Pass validity check for unified leader logic
        );
        
        return {
          // Core identification
          playerId: entry.player.id,
          playerName: entry.player.name,
          position: entry.player.position,
          nflTeam: entry.player.nflTeam,
          draftRank: entry.player.draftRank,
          isRestricted: entry.player.isRestricted,
          
          // Canonical auction state (VA-1)
          entryId: entry.id,
          status: entry.status,
          displayState,
          displayConfig,
          
          // VA-4: Use authoritative award data for awarded players, not reconstructed leading bid data
          // For awarded players, use award record instead of currentLeadingBid
          currentLeaderTeamName: displayState === VeteranAuctionDisplayState.AWARDED && entry.award
            ? entry.award.awardedTeam.name
            : (displayConfig.showLeader && hasValidLeadingBid ? (entry.currentLeadingTeam?.name || null) : null),
          currentLeaderTeamAbbreviation: displayState === VeteranAuctionDisplayState.AWARDED && entry.award
            ? entry.award.awardedTeam.abbreviation
            : (displayConfig.showLeader && hasValidLeadingBid ? (entry.currentLeadingTeam?.abbreviation || null) : null),
          // VA-S5: Add team ID for canonical presenter
          currentLeaderTeamId: displayState === VeteranAuctionDisplayState.AWARDED && entry.award
            ? entry.award.awardedTeam.id
            : (displayConfig.showLeader && hasValidLeadingBid ? (entry.currentLeadingTeam?.id || null) : null),
          leadingSalary: displayState === VeteranAuctionDisplayState.AWARDED && entry.award
            ? entry.award.salaryAmount
            : (displayConfig.showSalary && hasValidLeadingBid ? entry.currentLeadingBidAmount : null),
          leadingYears: displayState === VeteranAuctionDisplayState.AWARDED && entry.award
            ? entry.award.contractYears
            : (displayConfig.showYears && hasValidLeadingBid ? leadingYears : null),
          leadingTotalValue: displayState === VeteranAuctionDisplayState.AWARDED && entry.award
            ? entry.award.bidValue
            : (displayConfig.showSalary && hasValidLeadingBid ? entry.currentLeadingBidValue : null),
          
          // Time information - only shown if displayConfig allows
          timeLeftSeconds: displayConfig.showTimer ? timeLeftSeconds : null,
          openBidClosesAt: entry.openBidClosesAt,
          
          // User involvement
          myInvolvementState,
          isMyLeader: myInvolvementState === 'leading',
          isMyBidding: myInvolvementState === 'bidding',
          
          // Legacy states for backwards compatibility
          isAwarded,
          isReviewRequired: entry.review.required,
          
          // Quick access
          hasAward: Boolean(entry.award),
          awardedTeamName: entry.award?.awardedTeam.name || null,
          // VA-S5: Additional award fields for canonical presenter
          awardedTeamId: entry.award?.awardedTeam.id || null,
          awardedTeamAbbreviation: entry.award?.awardedTeam.abbreviation || null, // VA-S20: Team abbreviation for concise display
          awardedSalary: entry.award?.salaryAmount || null,
          awardedYears: entry.award?.contractYears || null,
        };
      });
      
      // Calculate summary stats using canonical states (VA-1)
      const summary = {
        totalEntries: boardRows.length,
        myLeadingCount: boardRows.filter(row => row.isMyLeader).length,
        myBiddingCount: boardRows.filter(row => row.isMyBidding).length,
        openMarketCount: boardRows.filter(row => row.displayState === VeteranAuctionDisplayState.OPEN_MARKET).length,
        activeBiddingCount: boardRows.filter(row => row.displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING).length,
        awardedCount: boardRows.filter(row => row.displayState === VeteranAuctionDisplayState.AWARDED).length,
        ineligibleCount: boardRows.filter(row => row.displayState === VeteranAuctionDisplayState.INELIGIBLE).length,
        reviewRequiredCount: boardRows.filter(row => row.isReviewRequired).length,
      };
      
      // Enhanced permissions (VA-1: Unified bidding permission)
      const contextualPermissions = {
        canPlaceBids: base.permissions.canBid, // Simplified from split open/blind permissions
        hasActiveTeam: Boolean(input.actor.teamId),
        isCommissioner: input.actor.leagueRole === "COMMISSIONER",
      };
      
      // Enhanced auction configuration for UI validation
      const auctionConfig = {
        mode: base.config.auctionMode,
        blindWindowActive: base.config.blindWindowActive ?? false,
        isEmergencyFillIn: base.config.auctionMode === 'EMERGENCY_FILL_IN',
      };
      
      return {
        ...base,
        boardRows,
        summary,
        contextualPermissions,
        auctionConfig,
      };
    },
    
    // Utility methods for board sorting and filtering
    sortBoardRows(
      rows: AuctionBoardRow[], 
      sortBy: 'timeLeft' | 'totalValue' | 'playerName' | 'position' | 'myInvolvement',
      direction: 'asc' | 'desc' = 'asc'
    ): AuctionBoardRow[] {
      const multiplier = direction === 'desc' ? -1 : 1;
      
      return [...rows].sort((a, b) => {
        switch (sortBy) {
          case 'timeLeft':
            const aTime = a.timeLeftSeconds ?? Infinity;
            const bTime = b.timeLeftSeconds ?? Infinity;
            return (aTime - bTime) * multiplier;
            
          case 'totalValue':
            const aValue = a.leadingTotalValue ?? 0;
            const bValue = b.leadingTotalValue ?? 0;
            return (aValue - bValue) * multiplier;
            
          case 'playerName':
            return a.playerName.localeCompare(b.playerName) * multiplier;
            
          case 'position':
            const posOrder = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 6 };
            const aPos = (posOrder as any)[a.position] ?? 99;
            const bPos = (posOrder as any)[b.position] ?? 99;
            if (aPos !== bPos) return (aPos - bPos) * multiplier;
            return a.playerName.localeCompare(b.playerName) * multiplier;
            
          case 'myInvolvement':
            const involvementOrder = { leading: 1, bidding: 2, available: 3 };
            const aInv = involvementOrder[a.myInvolvementState];
            const bInv = involvementOrder[b.myInvolvementState];
            if (aInv !== bInv) return (aInv - bInv) * multiplier;
            return a.playerName.localeCompare(b.playerName);
            
          default:
            return 0;
        }
      });
    },
    
    filterBoardRows(
      rows: AuctionBoardRow[],
      filters: {
        status?: string;
        position?: string;
        myInvolvement?: 'all' | 'leading' | 'bidding' | 'available';
        search?: string;
      }
    ): AuctionBoardRow[] {
      return rows.filter(row => {
        // Status filter
        if (filters.status && filters.status !== 'ALL' && row.status !== filters.status) {
          return false;
        }
        
        // Position filter  
        if (filters.position && filters.position !== 'ALL' && row.position !== filters.position) {
          return false;
        }
        
        // Involvement filter
        if (filters.myInvolvement && filters.myInvolvement !== 'all') {
          if (row.myInvolvementState !== filters.myInvolvement) {
            return false;
          }
        }
        
        // Search filter
        if (filters.search?.trim()) {
          const searchTerm = filters.search.trim().toLowerCase();
          const playerName = row.playerName.toLowerCase();
          const nflTeam = row.nflTeam?.toLowerCase() || '';
          
          if (!playerName.includes(searchTerm) && !nflTeam.includes(searchTerm)) {
            return false;
          }
        }
        
        return true;
      });
    },
  };
}
