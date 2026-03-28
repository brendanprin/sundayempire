"use client";

import { TimerDisplay } from "./timer-display";
import { AuctionStatusChip } from "./auction-status-chip";

type RoomStatusDisplayProps = {
  title: string;
  auctionEndsAt: string | null;
  auctionMode: string;
  isAuctionComplete: boolean;
  summary?: {
    totalEntries: number;
    myLeadingCount: number;
    myBiddingCount: number;
    openBiddingCount: number;
    awardedCount: number;
    reviewRequiredCount: number;
  };
};

function getOverallRoomStatus(props: RoomStatusDisplayProps): {
  status: string;
  icon: string;
  explanation: string;
  urgency: 'low' | 'medium' | 'high';
  operationalContext: string;
} {
  const { isAuctionComplete, summary } = props;
  
  if (isAuctionComplete) {
    const needsReview = summary?.reviewRequiredCount || 0;
    return {
      status: 'COMPLETED',
      icon: '🏁',
      explanation: needsReview > 0 
        ? `Auction complete with ${needsReview} entries requiring commissioner review`
        : 'Auction has concluded successfully',
      urgency: 'low',
      operationalContext: needsReview > 0 
        ? 'Commissioner action needed to finalize results'
        : 'All systems operational — ready for next phase',
    };
  }
  
  const openCount = summary?.openBiddingCount || 0;
  const myActivity = (summary?.myLeadingCount || 0) + (summary?.myBiddingCount || 0);
  
  return {
    status: 'OPEN_BIDDING',
    icon: '🔥',
    explanation: openCount > 0 
      ? `Active open bidding on ${openCount} players`
      : 'Open bidding phase - players available for auction',
    urgency: myActivity > 5 ? 'high' : 'medium',
    operationalContext: myActivity > 0 
      ? `You have active involvement on ${myActivity} players`
      : 'Monitor auctions and place bids as needed',
  };
}

export function RoomStatusDisplay(props: RoomStatusDisplayProps) {
  const { title, auctionEndsAt, auctionMode, summary } = props;
  const roomStatus = getOverallRoomStatus(props);
  
  const isUrgent = roomStatus.urgency === 'high';
  const hasActivity = (summary?.myLeadingCount || 0) + (summary?.myBiddingCount || 0) > 0;
  
  return (
    <div className={`rounded-xl border bg-slate-900/70 p-4 space-y-4 transition-all duration-300 ${
      isUrgent ? 'border-orange-600/60 ring-2 ring-orange-500/30 shadow-lg shadow-orange-500/20' :
      hasActivity ? 'border-emerald-600/60 ring-1 ring-emerald-500/20' :
      'border-slate-800'
    }`}>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Auction Room Status</p>
        
        <div className="space-y-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-100">{title}</h3>
            <p className="text-sm text-slate-400 mt-1">
              {auctionMode === "EMERGENCY_FILL_IN" ? "🚨 Emergency fill-in pool" : "📋 Standard veteran auction"}
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <AuctionStatusChip 
              status={roomStatus.status} 
              size="medium"
              showIcon={true} 
            />
            {auctionEndsAt && (
              <TimerDisplay 
                seconds={null}
                deadline={auctionEndsAt}
                size="compact"
                showUrgency={true}
                label="Ends"
              />
            )}
            {isUrgent && (
              <span className="text-xs bg-orange-900/40 text-orange-200 px-2 py-1 rounded-full border border-orange-700/50 animate-pulse">
                HIGH ACTIVITY
              </span>
            )}
          </div>
          
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              <span className={`inline-block mr-2 ${isUrgent ? 'animate-bounce' : ''}`}>
                {roomStatus.icon}
              </span>
              {roomStatus.explanation}
            </p>
            
            <p className={`text-xs ${
              isUrgent ? 'text-orange-200 font-medium' : 'text-slate-400'
            }`}>
              💡 {roomStatus.operationalContext}
            </p>
          </div>
        </div>
      </div>
      
      {summary && (
        <div className="border-t border-slate-800 pt-4">
          <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Your Activity Summary
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className={`space-y-2 ${hasActivity ? 'text-emerald-200' : 'text-slate-400'}`}>
              <div className="flex justify-between">
                <span>Leading:</span>
                <span className={`font-mono ${summary.myLeadingCount > 0 ? 'font-bold' : ''}`}>
                  {summary.myLeadingCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Bidding:</span>
                <span className={`font-mono ${summary.myBiddingCount > 0 ? 'font-bold' : ''}`}>
                  {summary.myBiddingCount}
                </span>
              </div>
            </div>
            
            <div className="text-slate-400 space-y-2">
              <div className="flex justify-between">
                <span>Open:</span>
                <span className="font-mono">{summary.openBiddingCount}</span>
              </div>
            </div>
          </div>
          
          {/* Activity Status Indicator */}
          {hasActivity && (
            <div className="mt-3 p-2 rounded border border-emerald-700/50 bg-emerald-950/20">
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <span>🎯</span>
                <span className="font-medium">You have active bids</span>
              </div>
              <p className="text-xs text-emerald-300 mt-1 opacity-90">
                Monitor your positions and respond to counter-bids
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}