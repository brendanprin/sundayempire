"use client";

import { AuctionStatusChip } from "./auction-status-chip";
import { TimerDisplay } from "./timer-display";
import { QuickActionIndicator } from "./action-clarity";
import { shouldShowOperationalTimer } from "@/lib/domain/auction/timer-display-logic";
import { deriveVeteranAuctionDisplayState, getVeteranAuctionDisplayConfig } from "@/lib/domain/auction/shared";

type OperationalStatusPanelProps = {
  entry: {
    id: string;
    status: string;
    player: {
      id: string;
      name: string;
      position: string;
    };
    openBidClosesAt?: string | null;
    award?: any;
    review?: {
      required?: boolean;
    };
  };
  permissions: {
    canBid?: boolean;
  };
  myInvolvementState?: 'leading' | 'bidding' | 'available';
  className?: string;
};

type OperationalState = {
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
  status: 'monitoring' | 'action-available' | 'action-required' | 'blocked' | 'complete';
  primaryMessage: string;
  contextMessage: string;
  icon: string;
  actionable: boolean;
};

function determineOperationalState(props: OperationalStatusPanelProps): OperationalState {
  const { entry, permissions, myInvolvementState } = props;
  
  // Completed states
  if (entry.award) {
    return {
      urgency: 'none',
      status: 'complete',
      primaryMessage: `Awarded to ${entry.award.awardedTeam?.name || 'Winner'}`,
      contextMessage: 'Auction complete - no further action needed',
      icon: '🏆',
      actionable: false,
    };
  }
  
  if (entry.status === 'EXPIRED') {
    return {
      urgency: 'none',
      status: 'complete',
      primaryMessage: 'Auction expired without award',
      contextMessage: 'No qualifying bids received',
      icon: '⏸️',
      actionable: false,
    };
  }
  
  // Review states
  if (entry.review?.required) {
    return {
      urgency: 'medium',
      status: 'monitoring',
      primaryMessage: 'Awaiting commissioner review',
      contextMessage: 'Tied bids are being resolved',
      icon: '⏳',
      actionable: false,
    };
  }
  
  // Blocked states
  if (entry.status === 'INELIGIBLE') {
    return {
      urgency: 'none',
      status: 'blocked',
      primaryMessage: 'Player ineligible for bidding',
      contextMessage: 'Check league rules or contact commissioner',
      icon: '🚫',
      actionable: false,
    };
  }
  
  // Active bidding states
  if (entry.status === 'OPEN_BIDDING' || entry.status === 'REOPENED') {
    if (!permissions.canBid) {
      return {
        urgency: 'medium',
        status: 'blocked',
        primaryMessage: 'Cannot bid on this player',
        contextMessage: 'Check cap space and roster eligibility',
        icon: '⛔',
        actionable: false,
      };
    }
    
    const urgency = myInvolvementState === 'leading' ? 'medium' : 'high';
    return {
      urgency: urgency as OperationalState['urgency'],
      status: 'action-available',
      primaryMessage: 'Active bidding window',
      contextMessage: myInvolvementState === 'leading'
        ? 'You are leading - monitor for counter-bids'
        : myInvolvementState === 'bidding'
        ? 'You have a bid - consider raising offer'
        : 'Open market - submit your bid',
      icon: '💰',
      actionable: true,
    };
  }
  
  // Open market states
  if (entry.status === 'ELIGIBLE') {
    if (!permissions.canBid) {
      return {
        urgency: 'low',
        status: 'blocked',
        primaryMessage: 'Cannot bid on this player',
        contextMessage: 'Check cap space and roster eligibility',
        icon: '🚫',
        actionable: false,
      };
    }
    
    return {
      urgency: 'low',
      status: 'action-available',
      primaryMessage: 'Open market',
      contextMessage: 'No bids yet - place your bid',
      icon: '📂',
      actionable: true,
    };
  }
  
  // Default
  return {
    urgency: 'none',
    status: 'monitoring',
    primaryMessage: 'Status unclear',
    contextMessage: 'Contact commissioner if needed',
    icon: '❓',
    actionable: false,
  };
}

function getOperationalClasses(state: OperationalState) {
  const urgencyClasses = {
    none: 'border-slate-700/60 bg-slate-950/60',
    low: 'border-blue-700/60 bg-blue-950/20',
    medium: 'border-amber-700/60 bg-amber-950/20',
    high: 'border-orange-700/60 bg-orange-950/30 ring-1 ring-orange-500/20',
    critical: 'border-red-700/70 bg-red-950/40 ring-2 ring-red-500/30 shadow-lg shadow-red-500/20',
  };
  
  const statusClasses = {
    monitoring: 'text-slate-300',
    'action-available': 'text-emerald-200',
    'action-required': 'text-orange-200',
    blocked: 'text-red-300',
    complete: 'text-blue-200',
  };
  
  return {
    container: `rounded-lg border p-4 transition-all duration-300 ${urgencyClasses[state.urgency]}`,
    header: statusClasses[state.status],
    primaryText: state.urgency === 'critical' ? 'font-semibold' : 'font-medium',
  };
}

export function OperationalStatusPanel(props: OperationalStatusPanelProps) {
  const { entry, permissions } = props;
  const operationalState = determineOperationalState(props);
  const classes = getOperationalClasses(operationalState);
  
  const deadline = entry.openBidClosesAt;
  
  // VA-1: Derive canonical display state for timer logic
  const displayState = deriveVeteranAuctionDisplayState({
    status: entry.status as any, // Type conversion needed 
    hasActiveBid: !!entry.openBidClosesAt, // Approximation: assume if there's a deadline, there's a bid
    isAwarded: !!entry.award
  });
  const timerCheck = shouldShowOperationalTimer({ displayState, openBidClosesAt: entry.openBidClosesAt });
  const shouldShowTimer = timerCheck.shouldShow;
  
  const shouldPulse = operationalState.urgency === 'critical';

  return (
    <div className={`${classes.container} ${props.className || ''}`}>
      {/* Header with Status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`text-lg ${shouldPulse ? 'animate-bounce' : ''}`}>
            {operationalState.icon}
          </span>
          <div>
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Operational Status
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <AuctionStatusChip 
                status={entry.status} 
                size="small"
                className="transition-transform hover:scale-105" 
              />
              {operationalState.urgency === 'critical' && (
                <span className="text-xs bg-red-900/40 text-red-200 px-2 py-1 rounded-full border border-red-700/50 animate-pulse">
                  URGENT
                </span>
              )}
            </div>
          </div>
        </div>
        
        {shouldShowTimer && (
          <TimerDisplay
            seconds={null}
            deadline={deadline}
            size="compact"
            showUrgency={true}
            className="text-right"
          />
        )}
      </div>
      
      {/* Primary Status Message */}
      <div className="space-y-2">
        <p className={`text-sm ${classes.header} ${classes.primaryText}`}>
          {operationalState.primaryMessage}
        </p>
        
        <p className="text-xs text-slate-400">
          {operationalState.contextMessage}
        </p>
      </div>
      
      {/* Action Indicator */}
      {operationalState.actionable && (() => {
        // VAH-2: Derive canonical display state for QuickActionIndicator
        const displayState = deriveVeteranAuctionDisplayState({
          status: entry.status as any, // Type cast - operational panel uses simplified status
          hasActiveBid: !!entry.openBidClosesAt, // Simplified indicator of active bid
          isAwarded: !!entry.award,
        });
        const displayConfig = getVeteranAuctionDisplayConfig(displayState);
        
        return (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <QuickActionIndicator
              displayState={displayState}
              displayConfig={displayConfig}
              permissions={permissions}
              hasAward={!!entry.award}
              reviewRequired={entry.review?.required}
              myInvolvementState={props.myInvolvementState}
              className="text-xs"
            />
          </div>
        );
      })()}
      
      {/* Critical Action Context */}
      {operationalState.urgency === 'critical' && operationalState.status === 'action-required' && (
        <div className="mt-3 p-2 rounded border border-red-700/50 bg-red-950/20">
          <div className="flex items-center gap-2 text-xs text-red-200">
            <span>⚡</span>
            <span className="font-medium">Time-sensitive action required</span>
          </div>
          <p className="text-xs text-red-300 mt-1 opacity-90">
            {false // Removed BLIND_BIDDING check - canonical model uses simplified states 
              ? 'Submit your best final bid before the window closes'
              : 'Take action soon to avoid missing opportunity'}
          </p>
        </div>
      )}
    </div>
  );
}