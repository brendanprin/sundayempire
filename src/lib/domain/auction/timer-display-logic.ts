/**
 * Timer display logic for auction interfaces (VA-1: Canonical State Model)
 * 
 * Implements the business rules for when auction timers should be visible
 * using the canonical Veteran Auction display states.
 * This centralizes timer display decisions across all auction components
 * to ensure consistency between board view and player overlay.
 * 
 * CANONICAL STATE MODEL (VA-1):
 * - OPEN_MARKET: no timer, no leader, no salary, no years
 * - ACTIVE_BIDDING: show timer, leader, salary, years, total value
 * - AWARDED: no timer (show finalized state)
 * - INELIGIBLE: no timer
 * 
 * Key principle: Timers only show for ACTIVE_BIDDING state
 */

import type { AuctionBoardRow } from "@/lib/read-models/auction/enhanced-auction-room-projection";
import { VeteranAuctionDisplayState } from "@/lib/domain/auction/shared";

export type TimerEligibilityResult = {
  shouldShow: boolean;
  reason: string;
};

/**
 * Determines if a timer should be displayed for an auction entry
 * using the canonical display state model (VA-1).
 * 
 * Timer should render only for ACTIVE_BIDDING state with valid time data.
 */
export function shouldShowAuctionTimer(row: {
  displayState: VeteranAuctionDisplayState;
  timeLeftSeconds: number | null;
}): TimerEligibilityResult {
  // Only ACTIVE_BIDDING state shows timers in canonical model
  if (row.displayState !== VeteranAuctionDisplayState.ACTIVE_BIDDING) {
    return {
      shouldShow: false,
      reason: `Canonical state ${row.displayState} does not show timer`
    };
  }

  // No timer data configured
  if (row.timeLeftSeconds === null || row.timeLeftSeconds === undefined) {
    return {
      shouldShow: false,
      reason: 'Timer not configured for ACTIVE_BIDDING state'
    };
  }

  // Time has expired
  if (row.timeLeftSeconds <= 0) {
    return {
      shouldShow: false,
      reason: 'Timer expired - state should transition to AWARDED or INELIGIBLE'
    };
  }

  // ACTIVE_BIDDING with valid time remaining gets a timer
  return {
    shouldShow: true,
    reason: 'Active bidding with time remaining'
  };
}

/**
 * Determines if a timer should be displayed for operational status panel
 * using canonical state model (VA-1)
 */
export function shouldShowOperationalTimer(entry: {
  displayState: VeteranAuctionDisplayState;
  openBidClosesAt?: string | null;
}): TimerEligibilityResult {
  // Only ACTIVE_BIDDING state shows operational timers
  if (entry.displayState !== VeteranAuctionDisplayState.ACTIVE_BIDDING) {
    return {
      shouldShow: false,
      reason: `Canonical state ${entry.displayState} does not show operational timer`
    };
  }

  // No deadline configured
  if (!entry.openBidClosesAt) {
    return {
      shouldShow: false,
      reason: 'No deadline configured for ACTIVE_BIDDING state'
    };
  }

  return {
    shouldShow: true,
    reason: 'Active bidding with deadline configured'
  };
}