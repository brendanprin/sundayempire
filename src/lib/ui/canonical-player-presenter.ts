import {
  VeteranAuctionDisplayState,
  getVeteranAuctionDisplayConfig
} from "@/lib/domain/auction/shared";
import type { EnhancedAuctionRoomProjection } from "@/lib/read-models/auction/enhanced-auction-room-projection";

/**
 * VAH-3: Unified canonical presenter for player UI components
 * 
 * This presenter centralizes all player display logic to ensure consistent
 * state presentation across overlay headers, workspace summaries, bid controls,
 * and other player UI components.
 * 
 * Eliminates raw currentLeadingBid* fallback logic by providing a single
 * authoritative source of player state derived from canonical board model.
 */

export type CanonicalPlayerPresentation = {
  // Core player identity
  playerId: string;
  entryId: string; // VAH-4: Pool entry ID for auction actions
  playerName: string;
  position: string;
  nflTeam: string;
  
  // Canonical display state
  displayState: VeteranAuctionDisplayState;
  displayConfig: ReturnType<typeof getVeteranAuctionDisplayConfig>;
  
  // Market summary (derived from canonical state)
  marketSummary: {
    label: string;
    badge: {
      text: string;
      icon: string;
      color: string;
      bgClass: string;
      textClass: string;
      borderClass: string;
    };
    leadingInfo: {
      hasLeader: boolean;
      teamName?: string;
      bidAmount?: number;
      bidYears?: number;
      totalValue?: number;
      isViewerLeading?: boolean;
    };
    awardInfo: {
      isAwarded: boolean;
      winnerTeamName?: string;
      finalSalary?: number;
      finalYears?: number;
      didViewerWin?: boolean;
    };
    timing: {
      hasDeadline: boolean;
      timeLeftSeconds?: number;
      isExpired?: boolean;
    };
  };
  
  // Action availability (derived from canonical state)
  actionAvailability: {
    canBid: boolean;
    canView: boolean;
    buttonText: string;
    helperText: string;
    primaryAction: 'bid' | 'disabled' | 'finalized';
    isBlocked: boolean;
    isActionable: boolean;
    blockingReason: string | null; // Enhanced validation: specific reason for bid blocking
  };
  
  // Header content
  headerContent: {
    title: string;
    subtitle: string;
    marketStateLabel: string; // VA-S1: Market state as secondary info
    statusBadge: {
      text: string;
      variant: 'open' | 'bidding' | 'awarded' | 'ineligible';
    };
  };
};

/**
 * Creates canonical player presentation from auction room data
 * 
 * @param playerId - Player ID to present
 * @param room - Enhanced auction room projection with canonical board data
 * @param permissions - User permissions for action availability
 * @returns Unified canonical presentation or null if player not found
 */
export function createCanonicalPlayerPresentation(
  playerId: string,
  room: EnhancedAuctionRoomProjection,
  permissions: {
    canBid: boolean;
    canSubmitBlindBid: boolean;
    canReviewBlindTies: boolean;
  }
): CanonicalPlayerPresentation | null {
  // Find player in canonical board rows (authoritative source)
  const boardRow = room.boardRows?.find(row => row.playerId === playerId);
  
  if (!boardRow) {
    return null;
  }
  
  // Get canonical display configuration
  const displayState = boardRow.displayState;
  const displayConfig = getVeteranAuctionDisplayConfig(displayState);
  
  // Derive market summary from canonical state
  const marketSummary = createMarketSummary(boardRow, displayState, displayConfig, room.viewer?.teamId || undefined);
  
  // Derive action availability from canonical state
  const actionAvailability = createActionAvailability(boardRow, displayState, displayConfig, permissions, room.auctionConfig);
  
  // Create header content
  const headerContent = createHeaderContent(boardRow, displayState, marketSummary);
  
  return {
    playerId: boardRow.playerId,
    entryId: boardRow.entryId, // VAH-4: Expose entry ID for bid actions 
    playerName: boardRow.playerName,
    position: boardRow.position,
    nflTeam: boardRow.nflTeam || "FA",
    displayState,
    displayConfig,
    marketSummary,
    actionAvailability,
    headerContent
  };
}

/**
 * Creates market summary from canonical board row data
 */
function createMarketSummary(
  boardRow: any,
  displayState: VeteranAuctionDisplayState,
  displayConfig: ReturnType<typeof getVeteranAuctionDisplayConfig>,
  viewerTeamId?: string
) {
  // VA-S4: Use unified validity check for complete leading bid data
  // VA-S8: But respect canonical display state - OPEN_MARKET never has leaders
  const hasValidLeadingData = !!(boardRow.currentLeaderTeamName && boardRow.leadingSalary && boardRow.leadingYears && boardRow.leadingTotalValue);
  const hasLeader = hasValidLeadingData && displayConfig.showLeader;
  // VA-S5: Use board row's team ID field now that it's populated 
  const isViewerLeading = !!(viewerTeamId && boardRow.currentLeaderTeamId === viewerTeamId && hasLeader);
  const isAwarded = !!boardRow.isAwarded;
  // VA-S5: Use board row's awarded team ID now that it's populated
  const didViewerWin = !!(isAwarded && boardRow.awardedTeamId === viewerTeamId);
  
  // Create badge based on canonical state
  const badge = {
    text: displayConfig.label,
    icon: getBadgeIcon(displayState),
    color: getBadgeColor(displayState),
    bgClass: getBadgeBgClass(displayState),
    textClass: getBadgeTextClass(displayState),
    borderClass: getBadgeBorderClass(displayState)
  };
  
  // Market status label
  const label = createMarketLabel(displayState, hasLeader, isAwarded, isViewerLeading, didViewerWin);
  
  return {
    label,
    badge,
    leadingInfo: {
      hasLeader,
      teamName: boardRow.currentLeaderTeamName,
      bidAmount: boardRow.leadingSalary,
      bidYears: boardRow.leadingYears,
      totalValue: boardRow.leadingTotalValue,
      isViewerLeading
    },
    awardInfo: {
      isAwarded,
      // VA-S20: Use team abbreviation for more concise display in finalized overlays
      winnerTeamName: boardRow.awardedTeamAbbreviation || boardRow.awardedTeamName,
      // VA-S5: Use proper awarded contract fields now that they're populated
      finalSalary: boardRow.awardedSalary,
      finalYears: boardRow.awardedYears,
      didViewerWin
    },
    timing: {
      hasDeadline: boardRow.timeLeftSeconds !== null,
      timeLeftSeconds: boardRow.timeLeftSeconds,
      isExpired: boardRow.timeLeftSeconds !== null && boardRow.timeLeftSeconds <= 0
    }
  };
}

/**
 * Creates action availability from canonical display state with enhanced backend validation
 */
function createActionAvailability(
  boardRow: any, // AuctionBoardRow with player and entry data
  displayState: VeteranAuctionDisplayState,
  displayConfig: ReturnType<typeof getVeteranAuctionDisplayConfig>,
  permissions: { canBid: boolean },
  auctionConfig: { mode: string; blindWindowActive: boolean; isEmergencyFillIn: boolean }
) {
  // Base bid availability from display config and permissions
  let canBid = displayConfig.allowBidding && permissions.canBid;
  
  // Enhanced validation to match backend bid-valuation-service.ts rules
  let blockingReason: string | null = null;
  
  // Check 1: Player restriction (matches backend validation)
  if (canBid && boardRow.isRestricted) {
    canBid = false;
    blockingReason = "Restricted players cannot be bid on";
  }
  
  // Check 2: Auction mode + blind window validation (matches backend validation)
  // For EMERGENCY_FILL_IN mode during blind window, open bids are blocked
  if (canBid && auctionConfig.isEmergencyFillIn && auctionConfig.blindWindowActive) {
    canBid = false;
    blockingReason = "Open bidding is closed during the final 24-hour blind auction window";
  }
  
  // Note: Financial validation (cap space, roster limits) would require additional data
  // that's not currently available in the projection. This could be added in future
  // enhancement if needed for better UX.
  
  let primaryAction: 'bid' | 'disabled' | 'finalized';
  let buttonText: string;
  let helperText: string;
  
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      primaryAction = canBid ? 'bid' : 'disabled';
      buttonText = canBid ? 'Place First Bid' : 'Place First Bid';
      helperText = canBid 
        ? 'Be the first to bid on this player' 
        : blockingReason || 'Check cap space and roster eligibility to place first bid';
      break;
      
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      primaryAction = canBid ? 'bid' : 'disabled';
      buttonText = canBid ? 'Submit Bid' : 'Submit Bid';
      helperText = canBid 
        ? 'Submit your bid to compete for this player' 
        : blockingReason || 'Check cap space and roster eligibility to place bid';
      break;
      
    case VeteranAuctionDisplayState.AWARDED:
      primaryAction = 'finalized';
      buttonText = 'Contract Finalized';
      helperText = 'This player has been awarded and the contract is finalized';
      break;
      
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      primaryAction = 'disabled';
      buttonText = 'Not Available';
      helperText = 'This player is not available for bidding';
      break;
  }
  
  return {
    canBid,
    canView: true, // All players can be viewed
    buttonText,
    helperText,
    primaryAction,
    isBlocked: !canBid && (displayState === VeteranAuctionDisplayState.OPEN_MARKET || displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING),
    isActionable: displayState === VeteranAuctionDisplayState.OPEN_MARKET || displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING,
    blockingReason, // Expose specific blocking reason for debugging
  };
}

/**
 * Creates header content from canonical data
 */
function createHeaderContent(
  boardRow: any,
  displayState: VeteranAuctionDisplayState,
  marketSummary: any
) {
  // VA-S1: Always use player name as title, market state as secondary info
  const title = boardRow.playerName;
  let subtitle: string;
  let marketStateLabel: string;
  
  if (marketSummary.awardInfo.isAwarded) {
    // VA-S5: Full award display now that all fields are available
    marketStateLabel = marketSummary.awardInfo.didViewerWin ? 'You Won!' : 'Contract Finalized';
    subtitle = `${marketSummary.awardInfo.winnerTeamName} • $${marketSummary.awardInfo.finalSalary?.toLocaleString()} × ${marketSummary.awardInfo.finalYears}yr`;
  } else if (marketSummary.leadingInfo.hasLeader) {
    marketStateLabel = marketSummary.leadingInfo.isViewerLeading ? 'You\'re Leading' : 'Active Bidding';
    subtitle = `${marketSummary.leadingInfo.teamName} leads • $${marketSummary.leadingInfo.bidAmount?.toLocaleString()} × ${marketSummary.leadingInfo.bidYears}yr`;
  } else {
    // VA-S7: For open market, always show as available - constraints are handled in action panel
    marketStateLabel = displayState === VeteranAuctionDisplayState.OPEN_MARKET ? 'Open Market' : 'Not Available';
    subtitle = displayState === VeteranAuctionDisplayState.OPEN_MARKET ? 'No bids yet • Be the first to bid' : 'Player not available for bidding';
  }
  
  let statusVariant: 'open' | 'bidding' | 'awarded' | 'ineligible';
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      statusVariant = 'open';
      break;
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      statusVariant = 'bidding';
      break;
    case VeteranAuctionDisplayState.AWARDED:
      statusVariant = 'awarded';
      break;
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      statusVariant = 'ineligible';
      break;
  }
  
  return {
    title,
    subtitle,
    marketStateLabel, // VA-S1: Market state as secondary info
    statusBadge: {
      text: marketSummary.badge.text,
      variant: statusVariant
    }
  };
}

/**
 * Helper functions for badge styling based on canonical state
 */
function getBadgeIcon(displayState: VeteranAuctionDisplayState): string {
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return '🎯';
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return '🔥';
    case VeteranAuctionDisplayState.AWARDED:
      return '✅';
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      return '⏰';
  }
}

function getBadgeColor(displayState: VeteranAuctionDisplayState): string {
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return 'blue';
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return 'emerald';
    case VeteranAuctionDisplayState.AWARDED:
      return 'blue';
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      return 'slate';
  }
}

function getBadgeBgClass(displayState: VeteranAuctionDisplayState): string {
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return 'bg-blue-900/50';
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return 'bg-emerald-900/50';
    case VeteranAuctionDisplayState.AWARDED:
      return 'bg-blue-900/50';
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      return 'bg-slate-800/50';
  }
}

function getBadgeTextClass(displayState: VeteranAuctionDisplayState): string {
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return 'text-blue-300';
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return 'text-emerald-300';
    case VeteranAuctionDisplayState.AWARDED:
      return 'text-blue-300';
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      return 'text-slate-400';
  }
}

function getBadgeBorderClass(displayState: VeteranAuctionDisplayState): string {
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return 'border-blue-700/50';
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return 'border-emerald-700/50';
    case VeteranAuctionDisplayState.AWARDED:
      return 'border-blue-700/50';
    case VeteranAuctionDisplayState.INELIGIBLE:
    default:
      return 'border-slate-600/50';
  }
}

function createMarketLabel(
  displayState: VeteranAuctionDisplayState,
  hasLeader: boolean,
  isAwarded: boolean,
  isViewerLeading: boolean,
  didViewerWin: boolean
): string {
  if (isAwarded) {
    return didViewerWin ? 'You won this player!' : 'Contract finalized';
  }
  
  if (hasLeader) {
    return isViewerLeading ? 'You\'re currently leading' : 'Active bidding in progress';
  }
  
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return 'Open for first bid';
    case VeteranAuctionDisplayState.INELIGIBLE:
      return 'Not available for bidding';
    default:
      return 'Auction status unknown';
  }
}