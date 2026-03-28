"use client";

import { useMemo } from "react";
import { formatEnumLabel } from "@/lib/format-label";
import { calculateBidValue } from "@/lib/domain/auction/shared";
import type { EnhancedAuctionRoomProjection } from "@/lib/read-models/auction/enhanced-auction-room-projection";

type ManagerDecisionRailProps = {
  room: EnhancedAuctionRoomProjection;
  selectedPlayerId: string | null;
  projectedBid: {
    salary: number;
    years: number;
  } | null;
  variant?: string;
};

type BudgetAnalysis = {
  currentCapHit: number;
  deadCapHit: number;
  totalCapUsed: number;
  softCapLimit: number;
  hardCapLimit: number;
  availableSoftSpace: number;
  availableHardSpace: number;
  complianceStatus: 'healthy' | 'warning' | 'critical';
  projectedImpact?: {
    bidValue: number;
    newTotalCap: number;
    remainingSoftSpace: number;
    remainingHardSpace: number;
    wouldExceedSoft: boolean;
    wouldExceedHard: boolean;
  };
};

type RosterAnalysis = {
  currentSize: number;
  rosterLimit: number;
  availableSlots: number;
};

type AuctionContext = {
  totalEntries: number;
  myLeadingCount: number;
  myBiddingCount: number;
  openMarketCount: number; // VA-1: Using canonical states
  activeBiddingCount: number;
  awardedCount: number;
  ineligibleCount: number;
  reviewRequiredCount: number;
};

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function calculateBudgetAnalysis(room: EnhancedAuctionRoomProjection, projectedBid: { salary: number; years: number } | null): BudgetAnalysis {
  // Use mock financial data since the room projection doesn't include detailed cap info
  // In a real implementation, this would come from the team financial state service
  const mockCapData = {
    currentCapHit: 85000000, // $85M
    deadCapHit: 5000000,    // $5M  
    softCapLimit: 100000000, // $100M soft cap
    hardCapLimit: 120000000, // $120M hard cap
  };
  
  const totalCapUsed = mockCapData.currentCapHit + mockCapData.deadCapHit;
  const availableSoftSpace = mockCapData.softCapLimit - totalCapUsed;
  const availableHardSpace = mockCapData.hardCapLimit - totalCapUsed;
  
  let complianceStatus: BudgetAnalysis['complianceStatus'] = 'healthy';
  if (totalCapUsed > mockCapData.softCapLimit) {
    complianceStatus = 'warning';
  }
  if (totalCapUsed > mockCapData.hardCapLimit) {
    complianceStatus = 'critical';
  }

  const analysis: BudgetAnalysis = {
    currentCapHit: mockCapData.currentCapHit,
    deadCapHit: mockCapData.deadCapHit,
    totalCapUsed,
    softCapLimit: mockCapData.softCapLimit,
    hardCapLimit: mockCapData.hardCapLimit,
    availableSoftSpace,
    availableHardSpace,
    complianceStatus,
  };

  if (projectedBid) {
    const bidValue = calculateBidValue(projectedBid.salary, projectedBid.years);
    const newTotalCap = totalCapUsed + projectedBid.salary; // Annual salary impact
    const remainingSoftSpace = mockCapData.softCapLimit - newTotalCap;
    const remainingHardSpace = mockCapData.hardCapLimit - newTotalCap;
    
    analysis.projectedImpact = {
      bidValue,
      newTotalCap,
      remainingSoftSpace,
      remainingHardSpace,
      wouldExceedSoft: newTotalCap > mockCapData.softCapLimit,
      wouldExceedHard: newTotalCap > mockCapData.hardCapLimit,
    };
  }

  return analysis;
}

function analyzeRosterNeeds(room: EnhancedAuctionRoomProjection): RosterAnalysis {
  // Mock roster analysis - in real implementation would come from team roster projection
  const mockRosterData = {
    currentSize: 22,
    rosterLimit: 25,
  };

  return {
    currentSize: mockRosterData.currentSize,
    rosterLimit: mockRosterData.rosterLimit,
    availableSlots: mockRosterData.rosterLimit - mockRosterData.currentSize,
  };
}

function getComplianceColor(status: BudgetAnalysis['complianceStatus']): string {
  switch (status) {
    case 'healthy': return 'text-green-400';
    case 'warning': return 'text-yellow-400';
    case 'critical': return 'text-red-400';
  }
}

function getPriorityColor(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high': return 'text-red-300';
    case 'medium': return 'text-yellow-300';
    case 'low': return 'text-green-300';
  }
}

export function ManagerDecisionRail({ room, selectedPlayerId, projectedBid }: ManagerDecisionRailProps) {
  const budgetAnalysis = useMemo(() => 
    calculateBudgetAnalysis(room, projectedBid), 
    [room, projectedBid]
  );
  
  const rosterAnalysis = useMemo(() => 
    analyzeRosterNeeds(room), 
    [room]
  );

  const auctionContext: AuctionContext = room.summary;

  const selectedEntry = useMemo(() => {
    if (!selectedPlayerId) return null;
    return room.entries.find(entry => entry.player.id === selectedPlayerId) || null;
  }, [selectedPlayerId, room.entries]);

  return (
    <div className="space-y-6">
      {/* Module 1: Financial + Roster */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Module 1</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">Financial + Roster</h3>
        </div>
        
        <div className="space-y-6">
          {/* Cap Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-200">Cap Space</h4>
              <span className={`text-xs font-semibold px-2 py-1 rounded ${
                budgetAnalysis.complianceStatus === 'healthy' ? 'bg-green-900/30 text-green-300' :
                budgetAnalysis.complianceStatus === 'warning' ? 'bg-yellow-900/30 text-yellow-300' :
                'bg-red-900/30 text-red-300'
              }`}>
                {budgetAnalysis.complianceStatus.toUpperCase()}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="text-center">
                <p className="text-slate-400">Active Cap</p>
                <p className="font-semibold text-slate-100 mt-1">{formatMoney(budgetAnalysis.currentCapHit)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400">Dead Cap</p>
                <p className="font-semibold text-slate-100 mt-1">{formatMoney(budgetAnalysis.deadCapHit)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400">Available</p>
                <p className={`font-semibold mt-1 ${budgetAnalysis.availableSoftSpace >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatMoney(Math.abs(budgetAnalysis.availableSoftSpace))}
                </p>
              </div>
            </div>

            {/* Projected Bid Impact */}
            {budgetAnalysis.projectedImpact && (
              <div className="rounded-lg border border-blue-700/50 bg-blue-950/20 p-4">
                <h5 className="text-xs font-medium text-blue-200 mb-2">Projected Impact</h5>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">Bid Value:</span>
                    <span className="font-medium text-slate-100">{formatMoney(budgetAnalysis.projectedImpact.bidValue)}</span>
                  </div>
                  
                  {budgetAnalysis.projectedImpact.wouldExceedHard ? (
                    <p className="text-xs text-red-300 flex items-center gap-2">
                      ❌ Would exceed hard cap by {formatMoney(Math.abs(budgetAnalysis.projectedImpact.remainingHardSpace))}
                    </p>
                  ) : budgetAnalysis.projectedImpact.wouldExceedSoft ? (
                    <p className="text-xs text-yellow-300 flex items-center gap-2">
                      ⚠️ Would exceed soft cap by {formatMoney(Math.abs(budgetAnalysis.projectedImpact.remainingSoftSpace))}
                    </p>
                  ) : (
                    <p className="text-xs text-green-300 flex items-center gap-2">
                      ✅ Remaining space: {formatMoney(budgetAnalysis.projectedImpact.remainingSoftSpace)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Roster Status */}
          <div className="border-t border-slate-800 pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-200">Roster Status</h4>
              <span className="text-xs text-slate-300">
                {rosterAnalysis.currentSize}/{rosterAnalysis.rosterLimit} 
                <span className={`ml-2 ${rosterAnalysis.availableSlots > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ({rosterAnalysis.availableSlots} open)
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Module 2: My Auction Exposure */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Module 2</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">My Auction Exposure</h3>
        </div>
        
        <div className="space-y-6">
          {/* Active Positions */}
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{auctionContext.myLeadingCount}</div>
              <p className="text-xs text-slate-400 mt-1">Leading Bids</p>
              {auctionContext.myLeadingCount > 3 && (
                <p className="text-xs text-amber-300 mt-1">⚠️ High exposure</p>
              )}
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{auctionContext.myBiddingCount}</div>
              <p className="text-xs text-slate-400 mt-1">Active Bids</p>
              {auctionContext.myBiddingCount > 5 && (
                <p className="text-xs text-amber-300 mt-1">⚠️ Spread thin</p>
              )}
            </div>
          </div>

          {/* Market Overview */}
          <div className="border-t border-slate-800 pt-6">
            <h4 className="text-sm font-medium text-slate-200 mb-3">Market Activity</h4>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="text-center">
                <p className="text-slate-400">Open Market</p>
                <p className="font-semibold text-green-300 mt-1">{auctionContext.openMarketCount}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400">Active Bidding</p>
                <p className="font-semibold text-purple-300 mt-1">{auctionContext.activeBiddingCount}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400">Awarded</p>
                <p className="font-semibold text-blue-300 mt-1">{auctionContext.awardedCount}</p>
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="border-t border-slate-800 pt-6">
            <h4 className="text-sm font-medium text-slate-200 mb-3">Exposure Analysis</h4>
            <div className="space-y-2 text-xs">
              {/** Calculate at-risk players (those where I'm leading but competition is close) */}
              {(() => {
                const atRiskCount = room.entries.filter(entry => 
                  entry.myOpenBid && entry.currentLeadingTeam?.id === room.viewer.teamId
                ).length;
                
                const totalExposure = auctionContext.myLeadingCount + auctionContext.myBiddingCount;
                const portfolioRisk = totalExposure / Math.max(rosterAnalysis.availableSlots, 1);
                
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Players at Risk:</span>
                      <span className={`font-medium ${atRiskCount > 2 ? 'text-red-400' : atRiskCount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                        {atRiskCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Portfolio Risk:</span>
                      <span className={`font-medium ${portfolioRisk > 2 ? 'text-red-400' : portfolioRisk > 1.5 ? 'text-amber-400' : 'text-green-400'}`}>
                        {portfolioRisk > 2 ? 'HIGH' : portfolioRisk > 1.5 ? 'MODERATE' : 'LOW'}
                      </span>
                    </div>
                    
                    {portfolioRisk > 2 && (
                      <div className="rounded-lg border border-red-700/50 bg-red-950/20 p-3 mt-3">
                        <p className="text-red-300 text-xs">
                          🚨 High portfolio risk - consider reducing exposure or increasing selectivity
                        </p>
                      </div>
                    )}
                    
                    {totalExposure === 0 && (
                      <div className="rounded-lg border border-blue-700/50 bg-blue-950/20 p-3 mt-3">
                        <p className="text-blue-300 text-xs">
                          💡 No active positions - opportunity to establish market presence
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Module 3: Alerts + Next Actions */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Module 3</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">Alerts + Next Actions</h3>
        </div>
        
        <div className="space-y-6">
          {/* Conditional sections based on available intelligence */}
          {(() => {
            const hasAlerts = (() => {
              // VAH-1: Simplified to open bidding only - removed blind window logic
              const urgentDeadlines = room.entries.filter(entry => {
                const relevantClosesAt = entry.openBidClosesAt;
                if (!relevantClosesAt) return false;
                
                const timeLeftMs = new Date(relevantClosesAt).getTime() - Date.now();
                const timeLeftMinutes = timeLeftMs / (1000 * 60);
                return timeLeftMinutes <= 10 && timeLeftMinutes > 0 && entry.myOpenBid;
              }).length > 0;
              
              const hasReviews = auctionContext.reviewRequiredCount > 0;
              // VAH-1: Removed hasBlindOpps logic (blind window opportunities)
              // since blind bidding is no longer exposed to owners
              const hasCompetition = room.entries.filter(entry => 
                entry.currentLeadingBidAmount && entry.myOpenBid
              ).length > 0;
              const hasHighPriorityOpen = room.entries.filter(entry => 
                entry.status === 'OPEN_BIDDING' && !entry.currentLeadingBidAmount
              ).length > 0;
              const hasCapWarnings = budgetAnalysis.complianceStatus !== 'healthy';
              
              return urgentDeadlines || hasReviews || hasCompetition || hasHighPriorityOpen || hasCapWarnings;
            })();
            
            return (
              <>
                {/* Priority Alerts - only show if there are actual alerts */}
                {hasAlerts && (
                  <div className="space-y-3">
                    {/* Alert content from the previous block */}
            {(() => {
            type Alert = {
              type: string;
              message: string;
              color: string;
              bgColor: string;
              icon: string;
              priority: 'critical' | 'high' | 'medium';
            };
            
            const alerts: Alert[] = [];
              // Deadline pressure - VAH-1: Simplified to open bidding only
              const urgentDeadlines = room.entries.filter(entry => {
                const relevantClosesAt = entry.openBidClosesAt;
                if (!relevantClosesAt) return false;
                
                const timeLeftMs = new Date(relevantClosesAt).getTime() - Date.now();
                const timeLeftMinutes = timeLeftMs / (1000 * 60);
                return timeLeftMinutes <= 10 && timeLeftMinutes > 0 && entry.myOpenBid;
              });
              
              if (urgentDeadlines.length > 0) {
                alerts.push({
                  type: 'deadline',
                  message: `${urgentDeadlines.length} bid${urgentDeadlines.length > 1 ? 's' : ''} closing in <10min`,
                  color: 'text-red-300',
                  bgColor: 'bg-red-950/20 border-red-700/50',
                  icon: '⏰',
                  priority: 'critical'
                });
              }
              
              // Commissioner review required
              if (auctionContext.reviewRequiredCount > 0) {
                alerts.push({
                  type: 'review',
                  message: `${auctionContext.reviewRequiredCount} auction${auctionContext.reviewRequiredCount > 1 ? 's' : ''} need commissioner review`,
                  color: 'text-orange-300',
                  bgColor: 'bg-orange-950/20 border-orange-700/50',
                  icon: '⚙️',
                  priority: 'high'
                });
              }
              
              // Removed blind bidding opportunity alerts - canonical model only uses open bidding
              
              // Competitive pressure
              const highCompetitionCount = room.entries.filter(entry => 
                entry.currentLeadingBidAmount && entry.myOpenBid
              ).length;
              
              if (highCompetitionCount > 0) {
                alerts.push({
                  type: 'competition',
                  message: `${highCompetitionCount} target${highCompetitionCount > 1 ? 's' : ''} under competitive pressure`,
                  color: 'text-amber-300',
                  bgColor: 'bg-amber-950/20 border-amber-700/50',
                  icon: '⚔️',
                  priority: 'high'
                });
              }
              
              // Market opportunities
              const openHighPriority = room.entries.filter(entry => 
                entry.status === 'OPEN_BIDDING' && !entry.currentLeadingBidAmount
              ).length;
              
              if (openHighPriority > 0) {
                alerts.push({
                  type: 'opportunity',
                  message: `${openHighPriority} high-priority player${openHighPriority > 1 ? 's' : ''} with no bids`,
                  color: 'text-green-300',
                  bgColor: 'bg-green-950/20 border-green-700/50',
                  icon: '🎯',
                  priority: 'medium'
                });
              }
              
              // Cap warnings
              if (budgetAnalysis.complianceStatus === 'warning') {
                alerts.push({
                  type: 'budget',
                  message: 'Approaching soft cap - monitor new bids carefully',
                  color: 'text-yellow-300',
                  bgColor: 'bg-yellow-950/20 border-yellow-700/50',
                  icon: '💰',
                  priority: 'medium'
                });
              } else if (budgetAnalysis.complianceStatus === 'critical') {
                alerts.push({
                  type: 'budget',
                  message: 'Critical cap situation - avoid new commitments',
                  color: 'text-red-300',
                  bgColor: 'bg-red-950/20 border-red-700/50',
                  icon: '🚨',
                  priority: 'critical'
                });
              }
              
              // Sort by priority: critical > high > medium
              const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
              alerts.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));
              
              // Only show alerts if there are actionable ones - remove "All clear" empty state
              return alerts.length > 0 ? alerts.slice(0, 4).map((alert, index) => (
                <div key={index} className={`rounded-lg border p-3 ${alert.bgColor}`}>
                  <div className={`flex items-center gap-2 ${alert.color} text-sm font-medium`}>
                    <span>{alert.icon}</span>
                    <span>{alert.message}</span>
                  </div>
                </div>
              )) : null; // Hide alerts section entirely when no actionable alerts
            })()}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}