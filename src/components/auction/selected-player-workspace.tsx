"use client";

import { useState, useMemo, useEffect, memo } from "react";
import { formatEnumLabel } from "@/lib/format-label";
import { 
  calculateBidValue, 
  MAX_CONTRACT_YEARS, 
  BID_VALUE_UNOFFERED_YEAR_MULTIPLIER,
  VeteranAuctionDisplayState,
  getVeteranAuctionDisplayConfig 
} from "@/lib/domain/auction/shared";
import type { EnhancedAuctionRoomProjection } from "@/lib/read-models/auction/enhanced-auction-room-projection";
import { createCanonicalPlayerPresentation, type CanonicalPlayerPresentation } from "@/lib/ui/canonical-player-presenter";


type BidFormState = {
  salaryAmount: string;
  contractYears: string;
};

type SelectedPlayerWorkspaceProps = {
  selectedPlayerId: string;
  room: EnhancedAuctionRoomProjection;
  onPlaceBid: (entryId: string, salary: number, years: number) => Promise<void>;
  onSubmitReview?: (entryId: string, winningBidId: string, reason: string) => Promise<void>;
  onBidFormChange?: (bidData: {salary: number; years: number} | null) => void;
  isLoading?: boolean;
  permissions: {
    canBid: boolean;
    canSubmitBlindBid: boolean;
    canReviewBlindTies: boolean;
  };
  variant?: string;
  onError?: (error: Error) => void;
  className?: string;
  bidPanelRef?: React.MutableRefObject<HTMLDivElement | null>;
  // VA-S12: Bid error state for inline validation
  bidErrors?: Record<string, {
    hasError: boolean;
    message: string;
    rejectionType?: string;
    context?: Record<string, unknown>;
  }>;
};

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString()}`;
}

function formatTimeLeft(deadline: string | null): string {
  if (!deadline) return "—";
  
  const now = new Date();
  const end = new Date(deadline);
  const diffMs = end.getTime() - now.getTime();
  
  if (diffMs <= 0) return "Concluded";
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// VAH-3: Canonical player standing description using presentation data
function describePlayerStanding(canonicalPresentation: CanonicalPlayerPresentation, viewerTeamId: string | null): string {
  const { marketSummary } = canonicalPresentation;
  
  if (marketSummary.awardInfo.isAwarded) {
    return marketSummary.awardInfo.didViewerWin 
      ? `🏆 You won! Contract finalized: $${marketSummary.awardInfo.finalSalary?.toLocaleString()} × ${marketSummary.awardInfo.finalYears}yr.`
      : `✅ ${marketSummary.awardInfo.winnerTeamName} won with finalized contract: $${marketSummary.awardInfo.finalSalary?.toLocaleString()} × ${marketSummary.awardInfo.finalYears}yr.`;
  }
  
  if (marketSummary.leadingInfo.hasLeader) {
    return marketSummary.leadingInfo.isViewerLeading 
      ? `🥇 You're leading with $${marketSummary.leadingInfo.bidAmount?.toLocaleString()}`
      : `${marketSummary.leadingInfo.teamName} leads with $${marketSummary.leadingInfo.bidAmount?.toLocaleString()}`;
  }
  
  return "No bids yet. Be the first to make an offer.";
}

// VA-S12: Enhanced bid action panel with inline error validation
function BidActionPanel({ canonicalPresentation, room, permissions, onPlaceBid, onSubmitReview, onBidFormChange, isLoading, onError, bidErrors }: any) {
  const [bidForm, setBidForm] = useState<BidFormState>({
    salaryAmount: "",
    contractYears: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const salaryInputId = `${canonicalPresentation.entryId}-auction-bid-salary`;
  const contractYearsSelectId = `${canonicalPresentation.entryId}-auction-bid-years`;
  
  // VA-S12: Get bid error for this specific entry
  const bidError = bidErrors?.[canonicalPresentation.entryId];
  const hasInlineError = bidError?.hasError;

  // VAH-3: Use canonical presentation for all action configuration  
  const canBidOnPlayer = canonicalPresentation.actionAvailability.canBid;
  // VA-S7: Check if player is in actionable state (open market or active bidding) but blocked by constraints
  const isActionableButBlocked = canonicalPresentation.actionAvailability.isBlocked;

  // Call onBidFormChange when form values change
  useEffect(() => {
    const salary = Number(bidForm.salaryAmount);
    const years = Number(bidForm.contractYears);
    
    if (salary && years && onBidFormChange) {
      onBidFormChange({ salary, years });
    } else if (onBidFormChange) {
      onBidFormChange(null);
    }
  }, [bidForm.salaryAmount, bidForm.contractYears, onBidFormChange]);

  const handlePlaceBid = async () => {
    if (isSubmitting) return; // Prevent double submission
    
    try {
      const salary = Number(bidForm.salaryAmount);
      const years = Number(bidForm.contractYears);
      
      if (!salary || !years) {
        onError?.(new Error('Please enter both salary amount and contract years'));
        return;
      }
      
      // VA-2: Validate minimum values for first bid
      if (salary < 1) {
        onError?.(new Error('Salary must be at least $1'));
        return;
      }
      
      if (years < 1 || years > MAX_CONTRACT_YEARS) {
        onError?.(new Error(`Contract years must be between 1 and ${MAX_CONTRACT_YEARS}`));
        return;
      }
      
      setIsSubmitting(true);
      
      // VAH-3: Use canonical presentation player ID
      // VAH-4: Use entryId for bid action, not playerId
      await onPlaceBid(canonicalPresentation.entryId, salary, years);
      
      // VA-S12: Only clear form state after successful bid (no errors thrown)
      setBidForm({ salaryAmount: "", contractYears: "" });
    } catch (error) {
      // VA-S12: Don't use onError for bid rejections - they're handled by parent with inline validation
      // Only use onError for unexpected/network errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('rejected') && !errorMessage.includes('not accepted')) {
        onError?.(error as Error);
      }
      // For bid rejections, form state is preserved and inline error is shown via bidErrors prop
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canBidOnPlayer && !isActionableButBlocked) {
    // VA-S7: Only show unavailable panel for truly ineligible/awarded players
    return (
      <div className="p-4 bg-slate-800/50 rounded-lg text-center text-slate-400">
        <div className="space-y-2">
          <p>{canonicalPresentation.actionAvailability.helperText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="grid gap-3 md:grid-cols-2 mb-3">
        <div>
          <label
            htmlFor={salaryInputId}
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Annual Salary
          </label>
          <input
            id={salaryInputId}
            type="number"
            min={1}
            placeholder="40,000"
            className="w-full rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-2.5 text-white placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            aria-label="Annual Salary"
            data-testid="auction-bid-salary-input"
            value={bidForm.salaryAmount}
            onChange={(e) => setBidForm(prev => ({ ...prev, salaryAmount: e.target.value }))}
          />
          <p className="text-xs text-slate-500 mt-1">Enter full dollar amount (e.g., 40,000 for $40,000)</p>
        </div>
        
        <div>
          <label
            htmlFor={contractYearsSelectId}
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Contract Years
          </label>
          <select
            id={contractYearsSelectId}
            className="w-full rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-2.5 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            aria-label="Contract Years"
            data-testid="auction-bid-years-select"
            value={bidForm.contractYears}
            onChange={(e) => setBidForm(prev => ({ ...prev, contractYears: e.target.value }))}
          >
            <option value="">Select years</option>
            {Array.from({ length: MAX_CONTRACT_YEARS }, (_, i) => i + 1).map(year => (
              <option key={year} value={year}>{year} year{year > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* VA-S12: Inline bid rejection error display */}
      {hasInlineError && (
        <div className="mb-3 p-2.5 bg-red-900/20 border border-red-700/30 rounded-lg">
          <p className="text-sm text-red-200">
            <span className="inline-flex items-center gap-2">
              <span className="text-red-400">❌</span>
              {bidError.message}
            </span>
          </p>
        </div>
      )}
      
      <div className="flex gap-3">
        {/* VA-S7: Show bid form and button for all actionable states, with contextual messaging */}
        <button
          type="button"
          onClick={() => handlePlaceBid()}
          disabled={isLoading || isSubmitting || !bidForm.salaryAmount || !bidForm.contractYears || isActionableButBlocked}
          className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-medium rounded-lg transition-colors"
          data-testid="auction-bid-submit-button"
        >
          {(isLoading || isSubmitting) ? 'Submitting...' : canonicalPresentation.actionAvailability.buttonText}
        </button>
      </div>
      
      {/* VA-S7: Show contextual help for blocked but actionable states */}
      {isActionableButBlocked && (
        <div className="mt-2.5 p-2.5 bg-amber-900/20 border border-amber-700/30 rounded-lg">
          <p className="text-sm text-amber-200">
            <span className="inline-flex items-center gap-1">
              <span className="text-amber-400">⚠️</span>
              {canonicalPresentation.actionAvailability.helperText}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// VA-3: Enhanced bid history display with proper data
function BidHistoryPanel({ selectedEntry, room }: any) {
  const recentBids = selectedEntry.recentBids || [];
  
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg">
      <h4 className="text-sm font-medium text-slate-300 mb-3">Bid History</h4>
      <div className="space-y-2">
        {recentBids.length > 0 ? (
          recentBids.slice(0, 5).map((bid: any, index: number) => (
            <div key={bid.bidId || index} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <span className={
                  bid.status === 'ACTIVE' || bid.status === 'WON' 
                    ? 'text-emerald-400' 
                    : 'text-slate-400'
                }>
                  {bid.team.abbreviation || bid.team.name}
                </span>
                {/* VA-S17: Update labels for finalized state */}
                {bid.status === 'ACTIVE' && (
                  <span className="px-1 py-0.5 bg-emerald-600/20 text-emerald-400 text-xs rounded text-[10px]">LEADING</span>
                )}
                {bid.status === 'WON' && (
                  <span className="px-1 py-0.5 bg-green-600/20 text-green-400 text-xs rounded text-[10px]">WINNER</span>
                )}
              </div>
              <div className="text-right">
                <div className={
                  bid.status === 'ACTIVE' || bid.status === 'WON' 
                    ? 'text-white' 
                    : 'text-slate-400'
                }>
                  ${bid.salaryAmount.toLocaleString()}/{bid.contractYears}yr
                </div>
                <div className="text-[10px] text-slate-500">
                  {bid.bidValue != null ? `${formatMoney(bid.bidValue)} value` : "— value"}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">No bids yet - be the first!</p>
        )}
      </div>
    </div>
  );
}

// Removed ValueExplanationPanel and CapRosterImpactPanel - redundant with header/summary information
// ValueExplanationPanel: Current bid already shown in header and summary strip, "Market value: TBD" provides no actionable information
// CapRosterImpactPanel: "Cap space: TBD" and "Roster slots: TBD" are placeholder content with no decision value

export const SelectedPlayerWorkspace = memo(function SelectedPlayerWorkspace({
  selectedPlayerId,
  room,
  onPlaceBid,
  onSubmitReview,
  onBidFormChange,
  isLoading = false,
  permissions,
  variant,
  onError,
  className = "",
  bidPanelRef,
  bidErrors,
}: SelectedPlayerWorkspaceProps) {
  // VAH-3: Use canonical presenter instead of raw selectedEntry
  const canonicalPresentation = createCanonicalPlayerPresentation(selectedPlayerId, room, permissions);
  
  if (!canonicalPresentation) {
    return (
      <div className="text-center text-slate-400 p-8">
        <p>Player not found in auction room</p>
      </div>
    );
  }

  // Keep selectedEntry for backwards compatibility with bid history (entries.find)
  const selectedEntry = room.entries.find(entry => entry.player.id === selectedPlayerId);

  const isOverlay = variant?.includes('overlay');

  return (
    <div className={`space-y-8 ${className}`} data-testid="selected-player-workspace">
      {/* SECTION 1: BID ACTION - Start immediately with primary action */}
      <div className="space-y-6" ref={bidPanelRef}>
        <BidActionPanel
          canonicalPresentation={canonicalPresentation}
          room={room}
          permissions={permissions}
          onPlaceBid={onPlaceBid}
          onSubmitReview={onSubmitReview}
          onBidFormChange={onBidFormChange}
          isLoading={isLoading}
          onError={onError}
          bidErrors={bidErrors}
        />
      </div>
      
      {/* SECTION 2: CONTEXT - Streamlined to focus on actionable information */}
      <div className="space-y-6">
        {/* Bid History - Keep as it provides actionable bidding context */}
        <BidHistoryPanel 
          selectedEntry={selectedEntry} 
          room={room}
        />
      </div>
    </div>
  );
});
