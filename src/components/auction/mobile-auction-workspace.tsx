"use client";

import { useState } from "react";
import { SelectedPlayerWorkspace } from "./selected-player-workspace";
import { ManagerDecisionRail } from "./manager-decision-rail";
import type { 
  EnhancedAuctionRoomProjection 
} from "@/lib/read-models/auction/enhanced-auction-room-projection";

type MobileWorkspaceProps = {
  selectedPlayerId: string;
  room: EnhancedAuctionRoomProjection;
  onPlaceBid: (entryId: string, salary?: number, years?: number) => Promise<void>;
  onSubmitReview: (entryId: string, winningBidId?: string, reason?: string) => Promise<void>;
  onBidFormChange?: (bid: {salary: number; years: number} | null) => void;
  onClose: () => void;
  isLoading?: boolean;
  projectedBid: {salary: number; years: number} | null;
};

type WorkspaceTab = 'player' | 'manager';

export function MobileAuctionWorkspace({
  selectedPlayerId,
  room,
  onPlaceBid,
  onSubmitReview,
  onBidFormChange,
  onClose,
  isLoading,
  projectedBid,
}: MobileWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('player');

  const permissions = {
    canBid: room.permissions.canBid,
    canSubmitBlindBid: room.permissions.canSubmitBlindBid,
    canReviewBlindTies: room.permissions.canReviewBlindTies,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950" data-testid="mobile-auction-workspace">
      {/* Header with tabs */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-100">Player Actions</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            data-testid="mobile-workspace-close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800">
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'player'
                ? 'border-sky-500 text-sky-200 bg-sky-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
            onClick={() => setActiveTab('player')}
            data-testid="tab-player"
          >
            Player Details & Bidding
          </button>
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'manager'
                ? 'border-sky-500 text-sky-200 bg-sky-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
            onClick={() => setActiveTab('manager')}
            data-testid="tab-manager"
          >
            Manager Context
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'player' && (
          <div className="p-4" data-testid="mobile-workspace-player">
            <SelectedPlayerWorkspace
              selectedPlayerId={selectedPlayerId}
              room={room}
              onPlaceBid={onPlaceBid}
              onSubmitReview={onSubmitReview}
              onBidFormChange={onBidFormChange}
              isLoading={isLoading}
              permissions={permissions}
              variant="mobile"
            />
          </div>
        )}

        {activeTab === 'manager' && (
          <div className="p-4" data-testid="mobile-workspace-manager">
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Manager context</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-100">Cap Room & Team Status</h3>
              <p className="mt-2 text-sm text-slate-400">
                View available cap space, roster spots, and active bids
              </p>
            </div>
            
            <ManagerDecisionRail
              room={room}
              selectedPlayerId={selectedPlayerId}
              projectedBid={projectedBid}
              variant="mobile"
            />
          </div>
        )}
      </div>

      {/* Bottom Safe Area */}
      <div className="flex-shrink-0 pb-safe-bottom" />
    </div>
  );
}