"use client";

import { useState, useEffect } from "react";
import { AuctionBoard } from "./auction-board";
import { PlayerDecisionOverlay } from "./player-decision-overlay";
import { ManagerDecisionRail } from "./manager-decision-rail";
import type { 
  EnhancedAuctionRoomProjection, 
  AuctionBoardRow 
} from "@/lib/read-models/auction/enhanced-auction-room-projection";

type ResponsiveAuctionLayoutProps = {
  room: EnhancedAuctionRoomProjection;
  selectedPlayerId: string | null;
  onPlayerSelect: (playerId: string | null) => void;
  onPlaceBid: (entryId: string, salary?: number, years?: number) => Promise<void>;
  onSubmitReview: (entryId: string, winningBidId?: string, reason?: string) => Promise<void>;
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

type ScreenSize = 'mobile' | 'tablet' | 'desktop';

// Custom hook for responsive behavior
function useScreenSize(): ScreenSize {
  const [screenSize, setScreenSize] = useState<ScreenSize>('desktop');

  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth < 768) {
        setScreenSize('mobile');
      } else if (window.innerWidth < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return screenSize;
}

export function ResponsiveAuctionLayout({
  room,
  selectedPlayerId,
  onPlayerSelect,
  onPlaceBid,
  onSubmitReview,
  onBidFormChange,
  isLoading,
  projectedBid,
  bidErrors,
}: ResponsiveAuctionLayoutProps) {
  const screenSize = useScreenSize();
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isRailOpen, setIsRailOpen] = useState(false);

  // Auto-open workspace overlay when player selected 
  useEffect(() => {
    if (selectedPlayerId) {
      setIsWorkspaceOpen(true);
    } else {
      setIsWorkspaceOpen(false);
    }
  }, [selectedPlayerId]);

  // Auto-show rail on desktop when player is selected
  useEffect(() => {
    if (selectedPlayerId && screenSize === 'desktop') {
      setIsRailOpen(true);
    }
  }, [selectedPlayerId, screenSize]);

  const handlePlayerSelect = (playerId: string | null) => {
    onPlayerSelect(playerId);
  };

  const closeWorkspace = () => {
    setIsWorkspaceOpen(false);
    // Also deselect player when overlay is closed
    onPlayerSelect(null);
  };

  const permissions = {
    canBid: room.permissions.canBid,
    canSubmitBlindBid: room.permissions.canSubmitBlindBid,
    canReviewBlindTies: room.permissions.canReviewBlindTies,
  };

  return (
    <>
      {/* Player Decision Overlay */}
      {selectedPlayerId && (
        <PlayerDecisionOverlay
          isOpen={isWorkspaceOpen}
          onClose={closeWorkspace}
          selectedPlayerId={selectedPlayerId}
          room={room}
          onPlaceBid={onPlaceBid}
          onSubmitReview={onSubmitReview}
          onBidFormChange={onBidFormChange}
          isLoading={isLoading}
          projectedBid={projectedBid}
          bidErrors={bidErrors}
        />
      )}

      {/* Responsive Layout - Desktop: grid, Tablet/Mobile: stack with modal manager rail */}
      {(() => {
        if (screenSize === 'desktop') {
          return (
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]" data-testid="auction-layout-desktop">
              <div className="space-y-4">
                <AuctionBoard
                  rows={room.boardRows ?? []}
                  selectedPlayerId={selectedPlayerId}
                  onPlayerSelect={handlePlayerSelect}
                  permissions={{
                    canBid: room.contextualPermissions?.canPlaceBids ?? false,
                  }}
                  auctionConfig={room.auctionConfig}
                  isLoading={isLoading}
                />
              </div>
              <div className="space-y-4" data-testid="auction-rail-desktop">
                <ManagerDecisionRail
                  room={room}
                  selectedPlayerId={selectedPlayerId}
                  projectedBid={projectedBid}
                />
              </div>
            </div>
          );
        }

        if (screenSize === 'tablet') {
          return (
            <div className="space-y-4" data-testid="auction-layout-tablet">
              <AuctionBoard
                rows={room.boardRows ?? []}
                selectedPlayerId={selectedPlayerId}
                onPlayerSelect={handlePlayerSelect}
                permissions={{
                  canBid: room.contextualPermissions?.canPlaceBids ?? false,
                }}
                auctionConfig={room.auctionConfig}
                isLoading={isLoading}
              />
              {!selectedPlayerId && (
                <div className="fixed bottom-6 right-6 z-30">
                  <button
                    type="button"
                    onClick={() => setIsRailOpen(true)}
                    className="rounded-full bg-slate-800 border border-slate-600 p-3 text-slate-300 hover:bg-slate-700 hover:text-slate-200 transition-colors shadow-lg"
                    title="Open Manager Info"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </button>
                </div>
              )}
              {isRailOpen && (
                <div className="fixed inset-0 z-40" data-testid="auction-rail-tablet">
                  <div 
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => setIsRailOpen(false)}
                  />
                  <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-950 border-l border-slate-700 shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
                      <h3 className="text-lg font-semibold text-slate-100">Manager Context</h3>
                      <button
                        type="button"
                        onClick={() => setIsRailOpen(false)}
                        className="rounded-lg p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="overflow-y-auto p-4">
                      <ManagerDecisionRail
                        room={room}
                        selectedPlayerId={selectedPlayerId}
                        projectedBid={projectedBid}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Mobile Layout
        return (
          <div className="space-y-3" data-testid="auction-layout-mobile">
            <AuctionBoard
              rows={room.boardRows ?? []}
              selectedPlayerId={selectedPlayerId}
              onPlayerSelect={handlePlayerSelect}
              isLoading={isLoading}
            />
            {!selectedPlayerId && (
              <div className="fixed bottom-4 right-4 z-30">
                <button
                  type="button"
                  onClick={() => setIsRailOpen(true)}
                  className="rounded-full bg-slate-800 border border-slate-600 p-2.5 text-slate-300 hover:bg-slate-700 hover:text-slate-200 transition-colors shadow-lg"
                  title="Manager Info"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </button>
              </div>
            )}
            {isRailOpen && (
              <div className="fixed inset-0 z-40" data-testid="auction-rail-mobile">
                <div 
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setIsRailOpen(false)}
                />
                <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-slate-950 border-t border-slate-700 shadow-2xl max-h-[80vh] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
                    <h3 className="text-lg font-semibold text-slate-100">Manager Info</h3>
                    <button
                      type="button"
                      onClick={() => setIsRailOpen(false)}
                      className="rounded-lg p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="overflow-y-auto p-4">
                    <ManagerDecisionRail
                      room={room}
                      selectedPlayerId={selectedPlayerId}
                      projectedBid={projectedBid}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}