"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { SelectedPlayerWorkspace } from "./selected-player-workspace"; 
import { 
  calculateBidValue, 
  MAX_CONTRACT_YEARS, 
  VeteranAuctionDisplayState,
  getVeteranAuctionDisplayConfig
} from "@/lib/domain/auction/shared";
import type { 
  EnhancedAuctionRoomProjection 
} from "@/lib/read-models/auction/enhanced-auction-room-projection";
import { createCanonicalPlayerPresentation, type CanonicalPlayerPresentation } from "@/lib/ui/canonical-player-presenter";

// VA-1: Use canonical display state for overlay presentation
function getOverlayDisplayConfig(displayState: VeteranAuctionDisplayState, permissions: { canBid: boolean }, canonicalPresentation?: CanonicalPlayerPresentation) {
  const baseConfig = getVeteranAuctionDisplayConfig(displayState);
  
  // Map canonical state to overlay-specific styling and icons
  switch (displayState) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return {
        ...baseConfig,
        phase: {
          label: baseConfig.label,
          color: 'slate',
          bgClass: 'bg-slate-800/50',
          textClass: 'text-slate-400',
          borderClass: 'border-slate-600/50',
          icon: '⏳'
        },
        action: {
          label: 'Place First Bid',
          available: baseConfig.allowBidding && permissions.canBid,
          buttonText: 'Place First Bid',
          helperText: baseConfig.allowBidding && permissions.canBid 
            ? 'Be the first to bid on this player'
            : 'Check cap space and roster eligibility to place first bid'
        }
      };
      
    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return {
        ...baseConfig,
        phase: {
          label: baseConfig.label,
          color: 'emerald',
          bgClass: 'bg-emerald-900/50',
          textClass: 'text-emerald-300',
          borderClass: 'border-emerald-700/50',
          icon: '🔥'
        },
        action: {
          label: 'Submit Bid',
          available: baseConfig.allowBidding && permissions.canBid,
          buttonText: 'Submit Bid',
          helperText: baseConfig.allowBidding && permissions.canBid 
            ? 'Submit your bid for this player'
            : 'Check cap space and roster eligibility to place bid'
        }
      };
      
    case VeteranAuctionDisplayState.AWARDED:
      // VA-S20: Show explicit winner information in finalized overlay with concise format
      const awardText = canonicalPresentation?.marketSummary.awardInfo.isAwarded 
        ? canonicalPresentation.marketSummary.awardInfo.didViewerWin
          ? `You won! Contract: $${(canonicalPresentation.marketSummary.awardInfo.finalSalary! / 1000).toFixed(0)}k × ${canonicalPresentation.marketSummary.awardInfo.finalYears}yr`
          : `Awarded to ${canonicalPresentation.marketSummary.awardInfo.winnerTeamName} for $${(canonicalPresentation.marketSummary.awardInfo.finalSalary! / 1000).toFixed(0)}k × ${canonicalPresentation.marketSummary.awardInfo.finalYears}yr`
        : 'This player has been awarded and the contract is finalized';
      
      return {
        ...baseConfig,
        phase: {
          label: 'Contract Finalized',
          color: 'blue',
          bgClass: 'bg-blue-900/50',
          textClass: 'text-blue-300',
          borderClass: 'border-blue-700/50',
          icon: '✅'
        },
        action: {
          label: 'Contract Finalized',
          available: false,
          buttonText: '',
          helperText: awardText
        }
      };
      
    case VeteranAuctionDisplayState.INELIGIBLE:
      return {
        ...baseConfig,
        phase: {
          label: baseConfig.label,
          color: 'slate',
          bgClass: 'bg-slate-800/50',
          textClass: 'text-slate-400',
          borderClass: 'border-slate-600/50',
          icon: '⏰'
        },
        action: {
          label: 'Not Available',
          available: false,
          buttonText: '',
          helperText: 'This player is not available for bidding'
        }
      };
  }
}

type PlayerDecisionOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedPlayerId: string;
  room: EnhancedAuctionRoomProjection;
  onPlaceBid: (entryId: string, salary: number, years: number) => Promise<void>;
  onSubmitReview?: (entryId: string, winningBidId?: string, reason?: string) => Promise<void>;
  onBidFormChange?: (bid: {salary: number; years: number} | null) => void;
  isLoading?: boolean;
  projectedBid: {salary: number; years: number} | null;
  // VA-S12: Bid error state for inline validation
  bidErrors?: Record<string, {
    hasError: boolean;
    message: string;
    rejectionType?: string;
    context?: Record<string, unknown>;
  }>;
};

// Hook to detect screen size  
// Standardized screen size detection for responsive drawer behavior
type ScreenSize = 'mobile' | 'tablet' | 'desktop';

function useScreenSize() {
  const [screenSize, setScreenSize] = useState<ScreenSize>('desktop');
  
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Mobile: < 768px OR tablet portrait mode 
      if (width < 768 || (width < 1024 && height > width)) {
        setScreenSize('mobile');
      }
      // Tablet: 768-1200px in landscape or wide tablet
      else if (width < 1200) {
        setScreenSize('tablet');
      }
      // Desktop: >= 1200px
      else {
        setScreenSize('desktop');
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return { screenSize, isMobile: screenSize === 'mobile' };
}

// Hook for body scroll lock
function useBodyScrollLock(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    // Store original overflow style
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Calculate scrollbar width to prevent layout shift
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Lock scroll and compensate for scrollbar
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      // Restore original styles
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isActive]);
}

// Hook to detect when bid action panel is out of view
function useStickyBidDetection() {
  const [showStickyBid, setShowStickyBid] = useState(false);
  const bidPanelRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    if (!bidPanelRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky when bid panel is not fully visible
        setShowStickyBid(!entry.isIntersecting);
      },
      {
        threshold: 0.1, // Trigger when panel is 90% outside viewport
        rootMargin: '0px 0px -20px 0px' // Add some buffer
      }
    );
    
    observer.observe(bidPanelRef.current);
    
    return () => observer.disconnect();
  }, []);
  
  return { showStickyBid, bidPanelRef };
}

// Sticky Bid Action Component
type StickyBidActionProps = {
  canonicalPresentation: CanonicalPlayerPresentation;
  room: EnhancedAuctionRoomProjection;
  projectedBid: {salary: number; years: number} | null;
  onPlaceBid: (entryId: string, salary: number, years: number) => Promise<void>;
  isLoading?: boolean;
  isMobile: boolean;
  screenSize?: ScreenSize;
};

function StickyBidAction({ 
  canonicalPresentation, 
  room, 
  projectedBid, 
  onPlaceBid, 
  isLoading,
  isMobile,
  screenSize = 'desktop'
}: StickyBidActionProps) {
  const [bidForm, setBidForm] = useState({ salaryAmount: "", contractYears: "" });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const permissions = {
    canBid: room.permissions.canBid,
    canSubmitBlindBid: false, // VA-1: Blind phase removed
    canReviewBlindTies: false // VA-1: Blind phase removed
  };
  
  // VAH-3: Use canonical presentation for all bid action logic
  const canBidOnPlayer = canonicalPresentation.actionAvailability.canBid;
  
  if (!canBidOnPlayer) {
    return null;
  }
  
  const handlePlaceBid = async () => {
    try {
      const salary = Number(bidForm.salaryAmount);
      const years = Number(bidForm.contractYears);
      
      if (!salary || !years) {
        console.error('Please enter both salary amount and contract years');
        return;
      }
      
      // VA-2: Validate minimum values for first bid
      if (salary < 1) {
        console.error('Salary must be at least $1');
        return;
      }
      
      if (years < 1 || years > MAX_CONTRACT_YEARS) {
        console.error(`Contract years must be between 1 and ${MAX_CONTRACT_YEARS}`);
        return;
      }
      
      // VAH-3: Use canonical presentation player ID
      // VAH-4: Use entryId for bid action, not playerId
      await onPlaceBid(canonicalPresentation.entryId, salary, years);
      
      // Only clear form state and collapse after successful bid and refresh
      setBidForm({ salaryAmount: "", contractYears: "" });
      setIsExpanded(false);
    } catch (error) {
      console.error('Bid submission error:', error);
    }
  };
  
  // Calculate projected value for display
  const projectedValue = projectedBid ? calculateBidValue(projectedBid.salary, projectedBid.years) : null;
  const currentFormValue = bidForm.salaryAmount && bidForm.contractYears ? 
    calculateBidValue(Number(bidForm.salaryAmount), Number(bidForm.contractYears)) : null;
  
  const displayValue = currentFormValue || projectedValue;
  
  // Get overlay-specific display config for this function scope
  const overlayConfig = getOverlayDisplayConfig(canonicalPresentation.displayState, permissions, canonicalPresentation);
  
  if (!overlayConfig) {
    return null;
  }
  
  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-900/95 border-t border-slate-600 backdrop-blur-sm">
        {/* Collapsed State */}
        {!isExpanded && (
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Phase indicator from canonical presentation */}
              <div className={`px-2 py-1 rounded text-xs font-medium ${canonicalPresentation.marketSummary.badge.bgClass} ${canonicalPresentation.marketSummary.badge.textClass}`}>
                {canonicalPresentation.marketSummary.badge.icon} {canonicalPresentation.marketSummary.badge.text}
              </div>
              
              {/* Value display */}
              {displayValue && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-500">Value:</span>
                  <span className="text-white font-mono ml-1">
                    ${(displayValue / 1000).toFixed(0)}k
                  </span>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => setIsExpanded(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Place Bid
            </button>
          </div>
        )}
        
        {/* Expanded State */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-white">
                {/* VAH-3: Use canonical action availability for header text */}
                {canonicalPresentation.actionAvailability.buttonText}
              </h4>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Annual Salary</label>
                <input
                  type="number"
                  placeholder="40,000"
                  className="w-full text-sm rounded border border-slate-600 bg-slate-900/50 px-3 py-2 text-white"
                  value={bidForm.salaryAmount}
                  onChange={(e) => setBidForm(prev => ({ ...prev, salaryAmount: e.target.value }))}
                />
                <p className="text-xs text-slate-500 mt-0.5">Full dollars (e.g., 40,000)</p>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Years</label>
                <select
                  className="w-full text-sm rounded border border-slate-600 bg-slate-900/50 px-3 py-2 text-white"
                  value={bidForm.contractYears}
                  onChange={(e) => setBidForm(prev => ({ ...prev, contractYears: e.target.value }))}
                >
                  <option value="">Years</option>
                  {Array.from({ length: MAX_CONTRACT_YEARS }, (_, i) => i + 1).map(year => (
                    <option key={year} value={year}>{year}y</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex gap-2">
              {canBidOnPlayer && (
                <button
                  onClick={() => handlePlaceBid()}
                  disabled={isLoading || isSubmitting || !bidForm.salaryAmount || !bidForm.contractYears}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white text-sm font-medium rounded transition-colors"
                >
                  {(isLoading || isSubmitting) ? 'Submitting...' : canonicalPresentation.actionAvailability.buttonText}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Non-mobile (tablet/desktop) sticky action with responsive sizing
  return (
    <div className="fixed bottom-0 right-0 left-auto z-40 bg-slate-900 border-t border-slate-600">
      <div className={screenSize === 'tablet' ? 'p-3' : 'p-4'}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Phase & Action Reminder from canonical presentation */}
            <div className={screenSize === 'tablet' ? 'text-xs' : 'text-sm'}>
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${canonicalPresentation.marketSummary.badge.bgClass} ${canonicalPresentation.marketSummary.badge.textClass}`}>
                {canonicalPresentation.marketSummary.badge.icon} {canonicalPresentation.marketSummary.badge.text}
              </div>
            </div>
            
            {/* Projected Value Display */}
            {displayValue && (
              <div className={screenSize === 'tablet' ? 'text-xs' : 'text-sm'}>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Projected Value</div>
                <div className="text-white font-mono font-semibold">
                  ${(displayValue / 1000).toFixed(0)}k total
                </div>
              </div>
            )}
            
            {/* Quick inputs */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="40,000"
                className={`rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-white ${
                  screenSize === 'tablet' ? 'w-20 text-xs' : 'w-24 text-sm'
                }`}
                value={bidForm.salaryAmount}
                onChange={(e) => setBidForm(prev => ({ ...prev, salaryAmount: e.target.value }))}
              />
              <select
                className={`rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-white ${
                  screenSize === 'tablet' ? 'text-xs' : 'text-sm'
                }`}
                value={bidForm.contractYears}
                onChange={(e) => setBidForm(prev => ({ ...prev, contractYears: e.target.value }))}
              >
                <option value="">Years</option>
                {Array.from({ length: MAX_CONTRACT_YEARS }, (_, i) => i + 1).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Primary Submit Actions */}
          <div className="flex gap-2">
            {canBidOnPlayer && (
              <button
                onClick={() => handlePlaceBid()}
                disabled={isLoading || isSubmitting || !bidForm.salaryAmount || !bidForm.contractYears}
                className={`bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-medium rounded-lg transition-colors ${
                  screenSize === 'tablet' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
                }`}
              >
                {(isLoading || isSubmitting) ? 'Submitting...' : canonicalPresentation.actionAvailability.buttonText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverlayContent({ 
  onClose, 
  selectedPlayerId, 
  room, 
  onPlaceBid, 
  onSubmitReview, 
  onBidFormChange, 
  isLoading, 
  screenSize,
  projectedBid,
  bidErrors
}: PlayerDecisionOverlayProps & { screenSize: ScreenSize }) {
  const { showStickyBid, bidPanelRef } = useStickyBidDetection();
  const permissions = {
    canBid: room.permissions.canBid,
    canSubmitBlindBid: false, // VA-1: Blind phase removed
    canReviewBlindTies: false // VA-1: Blind phase removed
  };

  // VAH-3: Use canonical player presenter (eliminates raw fallback logic)
  const canonicalPresentation = createCanonicalPlayerPresentation(selectedPlayerId, room, permissions);
  
  const isMobile = screenSize === 'mobile';

  // Early return if player not found in canonical board data
  if (!canonicalPresentation) {
    return null;
  }

  // VAH-3: All player data now comes from canonical presentation
  const playerData = {
    id: canonicalPresentation.playerId,
    name: canonicalPresentation.playerName,
    position: canonicalPresentation.position,
    nflTeam: canonicalPresentation.nflTeam
  };
  
  const displayConfig = getOverlayDisplayConfig(canonicalPresentation.displayState, permissions, canonicalPresentation);

  if (isMobile) {
    // Full-screen mobile overlay
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950" data-testid="player-decision-overlay-mobile">
        {/* Backdrop for click-outside-to-close */}
        <div 
          className="absolute inset-0 z-0"
          onClick={onClose}
        />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Mobile Header - Strengthened with better spacing */}
          <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-4 border-b border-slate-600 safe-area-top">
            <div className="space-y-3">
              {/* Top row: Player name and close button */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-black text-white truncate tracking-tight leading-tight">
                    {canonicalPresentation.headerContent.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-slate-400 text-sm font-medium">
                      {canonicalPresentation.position}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 text-sm">
                      {canonicalPresentation.nflTeam || "FA"}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-700/50">
                      {canonicalPresentation.headerContent.marketStateLabel}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2.5 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-all duration-200 flex-shrink-0"
                  data-testid="overlay-close-mobile"
                  aria-label="Close player details"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* VAH-3: Status using canonical presentation badge */}
              {canonicalPresentation && (
                <div className="flex items-center justify-between">
                  {/* Phase chip from canonical data */}
                  <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold border ${canonicalPresentation.marketSummary.badge.bgClass} ${canonicalPresentation.marketSummary.badge.textClass} ${canonicalPresentation.marketSummary.badge.borderClass}`}>
                    {canonicalPresentation.marketSummary.badge.icon} {canonicalPresentation.marketSummary.badge.text}
                  </div>
                  
                  {/* Current leader/bid info - VAH-3: from canonical data */}
                  <div className="text-right">
                    {/* VA-S20: Show explicit winner for awarded state */}
                    {canonicalPresentation.marketSummary.awardInfo.isAwarded ? (
                      <>
                        <div className="text-xs text-emerald-400 font-medium uppercase tracking-wide">
                          {canonicalPresentation.marketSummary.awardInfo.didViewerWin ? 'You Won!' : 'Winner'}
                        </div>
                        <div className="text-white font-bold text-sm">
                          {canonicalPresentation.marketSummary.awardInfo.didViewerWin 
                            ? 'You' 
                            : canonicalPresentation.marketSummary.awardInfo.winnerTeamName}
                        </div>
                        <div className="text-slate-300 text-xs font-mono">
                          ${canonicalPresentation.marketSummary.awardInfo.finalSalary?.toLocaleString()} × {canonicalPresentation.marketSummary.awardInfo.finalYears}yr
                        </div>
                      </>
                    ) : canonicalPresentation.marketSummary.leadingInfo.hasLeader ? (
                      <>
                        <div className="text-xs text-slate-400">Leader</div>
                        <div className="flex items-center gap-1">
                          <span className="text-white font-bold text-sm">
                            {canonicalPresentation.marketSummary.leadingInfo.teamName}
                          </span>
                          <span className="text-slate-400 text-sm">@</span>
                          <span className="text-white font-mono text-sm">
                            ${canonicalPresentation.marketSummary.leadingInfo.bidAmount?.toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-slate-500">No bids yet</div>
                        <div className="text-slate-400 text-sm font-medium">Open market</div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Operational Summary Strip */}
          <div className="flex-shrink-0 bg-slate-850 border-b border-slate-700 px-4 py-3">
            {displayConfig && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                {/* Leader & Current Bid - only show if displayConfig allows */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 uppercase tracking-wide">Leader</span>
                    <span className="text-white font-medium">
                      {canonicalPresentation.marketSummary.leadingInfo.hasLeader ? 
                        canonicalPresentation.marketSummary.leadingInfo.teamName : 
                        'None'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 uppercase tracking-wide">Current</span>
                    <span className="text-white font-mono font-medium">
                      {canonicalPresentation.marketSummary.awardInfo.isAwarded ? 
                        `$${(canonicalPresentation.marketSummary.awardInfo.finalSalary! / 1000).toFixed(0)}k / ${canonicalPresentation.marketSummary.awardInfo.finalYears}y` :
                        canonicalPresentation.marketSummary.leadingInfo.hasLeader ? 
                        `$${(canonicalPresentation.marketSummary.leadingInfo.bidAmount! / 1000).toFixed(0)}k / ${canonicalPresentation.marketSummary.leadingInfo.bidYears}y` :
                        'Open'
                      }
                    </span>
                  </div>
                </div>
                
                {/* Your Position & Action - VAH-3: from canonical data */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 uppercase tracking-wide">Position</span>
                    <span className={`font-medium ${
                      canonicalPresentation.marketSummary.awardInfo.didViewerWin ? 'text-emerald-400' :
                      canonicalPresentation.marketSummary.leadingInfo.isViewerLeading ? 'text-yellow-400' :
                      canonicalPresentation.marketSummary.awardInfo.isAwarded ? 'text-slate-400' :
                      'text-blue-400'
                    }`}>
                      {canonicalPresentation.marketSummary.awardInfo.didViewerWin ? 'Won' :
                       canonicalPresentation.marketSummary.leadingInfo.isViewerLeading ? 'Leading' :
                       canonicalPresentation.marketSummary.awardInfo.isAwarded ? 'Lost' :
                       'Available'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 uppercase tracking-wide">Action</span>
                    <span className="text-slate-300 font-medium">
                      {canonicalPresentation.actionAvailability.buttonText}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Content with proper mobile spacing */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 pb-6">
              <SelectedPlayerWorkspace
                selectedPlayerId={selectedPlayerId}
                room={room}
                onPlaceBid={onPlaceBid}
                onSubmitReview={onSubmitReview}
                onBidFormChange={onBidFormChange}
                isLoading={isLoading}
                permissions={permissions}
                variant="overlay-mobile"
                bidPanelRef={bidPanelRef}
                bidErrors={bidErrors}
              />
            </div>
            {/* Bottom safe area and sticky action clearance */}
            <div className="h-24 safe-area-bottom" />
          </div>
          
          {/* Sticky Bid Action - Mobile */}
          {showStickyBid && canonicalPresentation && (
            <StickyBidAction
              canonicalPresentation={canonicalPresentation}
              room={room}
              projectedBid={projectedBid}
              onPlaceBid={onPlaceBid}
              isLoading={isLoading}
              isMobile={true}
              screenSize="mobile"
            />
          )}
        </div>
      </div>
    );
  }

  // Desktop slide-over panel
  return (
    <div className="fixed inset-0 z-50" data-testid="player-decision-overlay-desktop">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
        data-testid="overlay-backdrop"
      />
      
      {/* Right-side slide-over panel - Responsive width scaling */}
      <div className={
        `fixed right-0 top-0 bottom-0 bg-slate-950 border-l border-slate-700 shadow-2xl overflow-hidden flex flex-col ${
          screenSize === 'tablet' 
            ? 'w-full max-w-lg sm:max-w-xl md:max-w-2xl' 
            : 'w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl'
        }`
      }>
        {/* Header - Responsive sizing */}
        <div className={`flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-600 shadow-lg ${
          screenSize === 'tablet' ? 'px-5 py-4' : 'px-6 py-5'
        }`}>
          <div className="space-y-3">
            {/* Top row: Player identity and close button */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className={`font-black text-white tracking-tight truncate leading-tight ${
                  screenSize === 'tablet' ? 'text-2xl' : 'text-3xl'
                }`}>
                  {canonicalPresentation.headerContent.title}
                </h1>
                <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                  <span className={`text-slate-300 font-semibold ${
                    screenSize === 'tablet' ? 'text-sm' : 'text-base'
                  }`}>
                    {canonicalPresentation.position}
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className={`text-slate-300 ${
                    screenSize === 'tablet' ? 'text-sm' : 'text-base'
                  }`}>
                    {canonicalPresentation.nflTeam || "FA"}
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md font-medium bg-blue-900/30 text-blue-300 border border-blue-700/50 ${
                    screenSize === 'tablet' ? 'text-xs' : 'text-sm'
                  }`}>
                    {canonicalPresentation.headerContent.marketStateLabel}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2.5 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-all duration-200 flex-shrink-0"
                data-testid="overlay-close-desktop"
                aria-label="Close player details"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Bottom row: Status, leader, and current bid */}
            {canonicalPresentation && displayConfig && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Phase status chip */}
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border ${canonicalPresentation.marketSummary.badge.bgClass} ${canonicalPresentation.marketSummary.badge.textClass} ${canonicalPresentation.marketSummary.badge.borderClass}`}>
                    <div className={`w-2 h-2 ${canonicalPresentation.displayState === 'ACTIVE_BIDDING' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'} rounded-full`}></div>
                    {canonicalPresentation.marketSummary.badge.text}
                  </div>
                  
                  {/* My standing indicator */}
                  {canonicalPresentation.marketSummary.leadingInfo.isViewerLeading && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-900/30 text-yellow-300 border border-yellow-700/50">
                      <span className="text-lg">👑</span>
                      <span className="text-sm font-medium">You're Leading</span>
                    </div>
                  )}
                </div>
                
                {/* Current market state - from canonical data */}
                <div className="text-right">
                  {/* VA-S20: Show explicit winner for awarded state */}
                  {canonicalPresentation.marketSummary.awardInfo.isAwarded ? (
                    <>
                      <div className="text-sm text-emerald-400 font-medium uppercase tracking-wide">
                        {canonicalPresentation.marketSummary.awardInfo.didViewerWin ? 'You Won!' : 'Winner'}
                      </div>
                      <div className="text-lg font-bold text-emerald-200 mb-1">
                        {canonicalPresentation.marketSummary.awardInfo.didViewerWin 
                          ? 'You' 
                          : canonicalPresentation.marketSummary.awardInfo.winnerTeamName}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                      {canonicalPresentation.marketSummary.leadingInfo.hasLeader ? 'Current Leader' : 'Market Status'}
                    </div>
                  )}
                  <div className="flex items-baseline gap-1">
                    {canonicalPresentation.marketSummary.awardInfo.isAwarded ? (
                      <>
                        <span className="text-xl font-black text-emerald-200 font-mono">
                          ${canonicalPresentation.marketSummary.awardInfo.finalSalary?.toLocaleString()}
                        </span>
                        <span className="text-emerald-400 text-sm">
                          × {canonicalPresentation.marketSummary.awardInfo.finalYears}yr
                        </span>
                      </>
                    ) : canonicalPresentation.marketSummary.leadingInfo.hasLeader ? (
                      <>
                        <span className="text-xl font-black text-white font-mono">
                          ${canonicalPresentation.marketSummary.leadingInfo.bidAmount?.toLocaleString()}
                        </span>
                        <span className="text-slate-400 text-sm">
                          × {canonicalPresentation.marketSummary.leadingInfo.bidYears}yr
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-medium text-slate-400">
                        Open Market
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Content - Responsive padding */}
        <div className="flex-1 overflow-y-auto">
          <div className={screenSize === 'tablet' ? 'p-4' : 'p-5'}>
            <SelectedPlayerWorkspace
              selectedPlayerId={selectedPlayerId}
              room={room}
              onPlaceBid={onPlaceBid}
              onSubmitReview={onSubmitReview}
              onBidFormChange={onBidFormChange}
              isLoading={isLoading}
              permissions={permissions}
              variant={screenSize === 'tablet' ? 'overlay-tablet' : 'overlay-desktop'}
              bidPanelRef={bidPanelRef}
              bidErrors={bidErrors}
            />
          </div>
          {/* Bottom padding for sticky action clearance */}
          <div className="h-24" />
        </div>
        
        {/* Sticky Bid Action - Non-mobile */}
        {showStickyBid && canonicalPresentation && (
          <StickyBidAction 
            canonicalPresentation={canonicalPresentation}
            room={room}
            projectedBid={projectedBid}
            onPlaceBid={onPlaceBid}
            isLoading={isLoading}
            isMobile={false}
            screenSize={screenSize}
          />
        )}
      </div>
    </div>
  );
}

export function PlayerDecisionOverlay(props: PlayerDecisionOverlayProps) {
  const { isOpen, projectedBid, bidErrors } = props;
  const { screenSize } = useScreenSize();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Keep body scroll locked when open
  useBodyScrollLock(isOpen);

  // Create portal container on mount
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, props.onClose]);

  // Don't render anything if not open or no portal container
  if (!isOpen || !portalContainer) {
    return null;
  }

  return createPortal(
    <OverlayContent {...props} screenSize={screenSize} projectedBid={projectedBid} />,
    portalContainer
  );
}