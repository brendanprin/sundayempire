"use client";

import { TimerDisplay } from "./timer-display";
import { AuctionStatusChip } from "./auction-status-chip";

type CompactRoomStatusProps = {
  title: string;
  auctionEndsAt: string | null;
  auctionMode: string;
  isAuctionComplete: boolean;
  summary?: {
    totalEntries: number;
    myLeadingCount: number;
    myBiddingCount: number;
    openMarketCount: number; // VA-1: Updated to canonical counts
    activeBiddingCount: number;
    awardedCount: number;
    ineligibleCount: number;
    reviewRequiredCount: number;
  };
  onRefresh?: () => void;
  onSyncStatus?: () => void;
  canSyncStatus?: boolean;
};

function getStatusInfo(props: CompactRoomStatusProps): {
  status: string;
  icon: string;
  urgency: 'low' | 'medium' | 'high';
} {
  const { isAuctionComplete, summary } = props;
  
  if (isAuctionComplete) {
    const needsReview = summary?.reviewRequiredCount || 0;
    return {
      status: 'COMPLETED',
      icon: '🏁',
      urgency: needsReview > 0 ? 'medium' : 'low',
    };
  }
  
  const myActivity = (summary?.myLeadingCount || 0) + (summary?.myBiddingCount || 0);
  
  return {
    status: 'OPEN_BIDDING',
    icon: '🔥',
    urgency: myActivity > 5 ? 'high' : 'medium',
  };
}

export function CompactRoomStatus(props: CompactRoomStatusProps) {
  const { title, auctionEndsAt, auctionMode, summary, onRefresh, onSyncStatus, canSyncStatus } = props;
  const statusInfo = getStatusInfo(props);
  
  const isUrgent = statusInfo.urgency === 'high';
  const hasActivity = (summary?.myLeadingCount || 0) + (summary?.myBiddingCount || 0) > 0;
  
  return (
    <div className={`flex flex-wrap items-center gap-3 p-2 rounded-lg border transition-all ${
      isUrgent ? 'border-orange-600/60 bg-orange-950/20' :
      hasActivity ? 'border-emerald-600/60 bg-emerald-950/20' :
      'border-slate-800 bg-slate-900/50'
    }`}>
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{statusInfo.icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <AuctionStatusChip status={statusInfo.status} size="small" />
            {auctionMode === "EMERGENCY_FILL_IN" && (
              <span className="text-xs text-amber-200">Emergency</span>
            )}
          </div>
        </div>
      </div>
      
      {auctionEndsAt && (
        <TimerDisplay 
          seconds={null}
          deadline={auctionEndsAt}
          size="compact"
          showUrgency={true}
          label="Ends"
        />
      )}
      
      {summary && hasActivity && (
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-emerald-400">Leading:</span>
            <span className="font-mono text-emerald-200 font-bold">{summary.myLeadingCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-amber-400">Bidding:</span>
            <span className="font-mono text-amber-200 font-bold">{summary.myBiddingCount}</span>
          </div>
        </div>
      )}
      
      {isUrgent && (
        <div className="flex items-center gap-1 text-xs text-orange-200">
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
          <span className="font-medium">HIGH ACTIVITY</span>
        </div>
      )}
      
      {/* Inline Actions */}
      <div className="flex items-center gap-1.5 ml-auto" data-testid="veteran-auction-room-controls">
        {canSyncStatus && onSyncStatus && (
          <button
            type="button"
            onClick={onSyncStatus}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-100 bg-amber-950/40 border border-amber-700/50 rounded hover:border-amber-500 transition-colors"
            title="Sync Status / Awards"
          >
            <span>🔄</span>
            <span className="hidden sm:inline">Sync</span>
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-300 bg-slate-800/50 border border-slate-700/50 rounded hover:border-slate-500 transition-colors"
            title="Refresh Room"
          >
            <span>↻</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
}