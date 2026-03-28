"use client";

import { useState, useEffect } from "react";
import { TimeLeftBadge } from "./timer-display";
import { QuickActionIndicator } from "./action-clarity";
import { shouldShowAuctionTimer } from "@/lib/domain/auction/timer-display-logic";
import type { AuctionBoardRow } from "@/lib/read-models/auction/enhanced-auction-room-projection";

type MobileAuctionListProps = {
  rows: AuctionBoardRow[];
  selectedPlayerId: string | null;
  onPlayerSelect: (playerId: string) => void;
  permissions?: {
    canBid?: boolean;
  };
  auctionConfig?: {
    mode?: string;
    blindWindowActive?: boolean;
    isEmergencyFillIn?: boolean;
  };
  isLoading?: boolean;
};

function formatMoney(value: number | null): string {
  if (value === null || value === 0) return "—";
  return `$${value.toLocaleString()}`;
}

// VA-S6: Use canonical display state for consistent badge styling (same as desktop)
function getDisplayStateBadgeClasses(displayConfig: ReturnType<typeof import("@/lib/domain/auction/shared").getVeteranAuctionDisplayConfig>): string {
  const baseClasses = "inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium";
  return `${baseClasses} ${displayConfig.badgeClass}`;
}

export function MobileAuctionList({
  rows,
  selectedPlayerId,
  onPlayerSelect,
  permissions,
  auctionConfig,
  isLoading,
}: MobileAuctionListProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  
  // Update current time every second for live countdown and urgency styling
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="mobile-auction-loading">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 animate-pulse"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-800 rounded w-1/2" />
              </div>
              <div className="h-6 w-20 bg-slate-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
          <span className="text-2xl text-slate-600">🔍</span>
        </div>
        <p className="text-lg font-medium text-slate-300 mb-2">No matches found</p>
        <p className="text-sm text-slate-400">Adjust your filters to see more auction entries</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="mobile-auction-list">
      {rows.map((row) => {
        const isSelected = selectedPlayerId === row.playerId;
        
        // Calculate urgency from deadline for consistent styling
        const isUrgent = (() => {
          if (row.openBidClosesAt) {
            const end = new Date(row.openBidClosesAt);
            const diffMs = end.getTime() - currentTime.getTime();
            const timeLeftSeconds = diffMs <= 0 ? 0 : Math.floor(diffMs / 1000);
            return timeLeftSeconds <= 300; // 5 minutes
          }
          return row.timeLeftSeconds !== null && row.timeLeftSeconds <= 300;
        })();

        return (
          <div
            key={row.playerId}
            className={`
              rounded-xl border cursor-pointer transition-all duration-200 p-4
              ${isSelected 
                ? 'border-sky-600 bg-sky-950/30 ring-1 ring-sky-600/50' 
                : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900/50'
              }
              ${row.isMyLeader ? 'bg-emerald-950/20 border-emerald-700/50' : ''}
              ${row.isMyBidding && !row.isMyLeader ? 'bg-amber-950/20 border-amber-700/50' : ''}
              ${isUrgent ? 'ring-1 ring-red-600/30' : ''}
            `}
            onClick={() => onPlayerSelect(row.playerId)}
            data-testid={`mobile-auction-row-${row.playerId}`}
          >
            {/* Main Content Row */}
            <div className="flex items-start justify-between gap-4">
              {/* Player Info + Status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-slate-100 truncate">{row.playerName}</h3>
                  <span className="text-xs text-slate-400 flex-shrink-0">{row.position}</span>
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  {/* VA-S6: Use canonical display state rendering (same as desktop) */}
                  <span 
                    className={getDisplayStateBadgeClasses(row.displayConfig)}
                    data-testid={`mobile-status-${row.displayState}`}
                  >
                    {row.displayConfig.label}
                  </span>
                  {(() => {
                    const timerCheck = shouldShowAuctionTimer(row);
                    return timerCheck.shouldShow ? (
                      <TimeLeftBadge 
                        deadline={row.openBidClosesAt}
                        seconds={row.timeLeftSeconds}
                        variant="compact"
                        data-testid="mobile-timer" 
                      />
                    ) : null;
                  })()}
                </div>
                
                <div className="text-xs text-slate-400">
                  {row.nflTeam ?? 'FA'} · Rank {row.draftRank ?? '-'}
                </div>
              </div>
              
              {/* Value + Leader */}
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-lg text-slate-100 mb-1">
                  {formatMoney(row.leadingTotalValue)}
                </div>
                <div className="text-xs text-slate-400">
                  {row.currentLeaderTeamName ? (
                    <span className="text-slate-300">
                      {row.currentLeaderTeamAbbreviation || row.currentLeaderTeamName}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>
              </div>
            </div>
            
            {/* My Involvement Indicators */}
            {(row.isMyLeader || row.isMyBidding) && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800/50">
                {row.isMyLeader && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-200 border border-emerald-700/50">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Leading
                  </span>
                )}
                {row.isMyBidding && !row.isMyLeader && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-900/40 text-amber-200 border border-amber-700/50">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Bidding
                  </span>
                )}
              </div>
            )}
            
            {/* Quick Action Indicator */}
            <div className="mt-3">
              <QuickActionIndicator 
                displayState={row.displayState}
                displayConfig={row.displayConfig}
                myInvolvementState={row.isMyLeader ? 'leading' : row.isMyBidding ? 'bidding' : 'available'}
                permissions={permissions ?? { canBid: false }}
                playerData={{
                  isRestricted: row.isRestricted,
                }}
                auctionConfig={auctionConfig}
                variant="mobile"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}