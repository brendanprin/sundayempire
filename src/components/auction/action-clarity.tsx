"use client";

import { AuctionStatusChip } from "./auction-status-chip";
import { VeteranAuctionDisplayState } from "@/lib/domain/auction/shared";

type ActionClarityProps = {
  // VAH-2: Use canonical display state and config instead of raw status
  displayState: VeteranAuctionDisplayState;
  displayConfig: ReturnType<typeof import("@/lib/domain/auction/shared").getVeteranAuctionDisplayConfig>;
  permissions: {
    canBid?: boolean;
  };
  // Enhanced validation data for UI/backend consistency 
  playerData?: {
    isRestricted?: boolean;
  };
  auctionConfig?: {
    mode?: string;
    blindWindowActive?: boolean;
    isEmergencyFillIn?: boolean;
  };
  hasAward?: boolean;
  reviewRequired?: boolean;
  myInvolvementState?: 'leading' | 'bidding' | 'available';
  className?: string;
};

type ActionState = {
  primaryAction: string | null;
  secondaryActions: string[];
  status: 'available' | 'active' | 'waiting' | 'blocked' | 'complete';
  explanation: string;
  icon: string;
};

function determineActionState(props: ActionClarityProps): ActionState {
  const { 
    displayState,
    displayConfig,
    permissions, 
    playerData,
    auctionConfig,
    hasAward, 
    reviewRequired, 
    myInvolvementState 
  } = props;
  
  // Award cases 
  if (hasAward || displayState === VeteranAuctionDisplayState.AWARDED) {
    return {
      primaryAction: null,
      secondaryActions: [],
      status: 'complete',
      explanation: 'Contract finalized — no further action possible',
      icon: '🏆',
    };
  }
  
  // Review cases
  if (reviewRequired) {
    return {
      primaryAction: null,
      secondaryActions: [],
      status: 'waiting',
      explanation: 'Waiting for commissioner to resolve tied bids',
      icon: '⏳',
    };
  }
  
  // Enhanced bid availability validation to match backend
  let canBid = displayConfig.allowBidding && (permissions.canBid ?? false);
  let blockingReason: string | null = null;
  
  // Check player restriction (matches backend bid-valuation-service.ts)
  if (canBid && playerData?.isRestricted) {
    canBid = false;
    blockingReason = 'Restricted players cannot be bid on';
  }
  
  // Check auction mode + blind window (matches backend bid-valuation-service.ts)
  if (canBid && auctionConfig?.isEmergencyFillIn && auctionConfig?.blindWindowActive) {
    canBid = false;
    blockingReason = 'Open bidding closed during blind auction window';
  }
  
  // VAH-2: Use canonical display states for action logic
  if (displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING) {
    if (!canBid) {
      return {
        primaryAction: null,
        secondaryActions: [],
        status: 'blocked',
        explanation: blockingReason || 'Cannot bid - check team cap space or roster eligibility',
        icon: '🚫',
      };
    }
    
    const explanation = myInvolvementState === 'leading' 
      ? 'You are leading - watch for counter-bids'
      : myInvolvementState === 'bidding'
      ? 'You have placed a bid - monitor the auction'
      : 'Active bidding - place your bid';
    
    return {
      primaryAction: 'Place bid',
      secondaryActions: [],
      status: 'active',
      explanation,
      icon: '💰',
    };
  }
  
  // Open market states
  if (displayState === VeteranAuctionDisplayState.OPEN_MARKET) {
    if (!canBid) {
      return {
        primaryAction: null,
        secondaryActions: [],
        status: 'blocked',
        explanation: blockingReason || 'Cannot bid - check eligibility requirements',
        icon: '🚫',
      };
    }
    
    return {
      primaryAction: 'Place bid',
      secondaryActions: [],
      status: 'available',
      explanation: 'Open market - no bids yet',
      icon: '📂',
    };
  }
  
  if (displayState === VeteranAuctionDisplayState.INELIGIBLE) {
    return {
      primaryAction: null,
      secondaryActions: [],
      status: 'blocked',
      explanation: 'Player cannot be bid on currently',
      icon: '🚫',
    };
  }
  
  // Default case
  return {
    primaryAction: null,
    secondaryActions: [],
    status: 'waiting',
    explanation: 'No actions available at this time',
    icon: '⚪',
  };
}

function getStatusClasses(status: ActionState['status']) {
  const classes = {
    available: 'text-slate-400 bg-slate-900/40 border border-slate-700/60 shadow-sm',
    active: 'text-emerald-200 bg-emerald-900/40 border border-emerald-700/60 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/20',
    waiting: 'text-amber-200 bg-amber-900/40 border border-amber-700/60 shadow-md',
    blocked: 'text-red-300 bg-red-900/40 border border-red-700/60 shadow-md',
    complete: 'text-blue-200 bg-blue-900/40 border border-blue-700/60 shadow-md',
  };
  
  return classes[status];
}

export function ActionClarityPanel({ className = '', ...props }: ActionClarityProps) {
  const actionState = determineActionState(props);
  
  // VAH-2: Remove raw status urgency logic - use canonical state only
  const needsAttention = actionState.status === 'active' || actionState.status === 'blocked';
  
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-950/60 p-4 transition-all duration-300 ${
      needsAttention ? 'ring-1 ring-emerald-500/20 shadow-md' : ''
    } ${className}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-lg ${
          needsAttention ? 'animate-pulse duration-2000' : ''
        }`}>
          {actionState.icon}
        </span>
        <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
          Available Actions
        </h4>
        {/* VAH-2: Removed urgent REOPENED-specific urgency indicator */}
      </div>
      
      <div className="space-y-3">
        {actionState.primaryAction ? (
          <div className="space-y-2">
            <div 
              className={`
                inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${getStatusClasses(actionState.status)}
              `}
            >
              <span className="mr-2">{actionState.icon}</span>
              {actionState.primaryAction}
            </div>
            
            {actionState.secondaryActions.map((action, index) => (
              <div 
                key={index}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 bg-slate-900/40 border border-slate-700/60 ml-2 shadow-sm"
              >
                {action}
              </div>
            ))}
          </div>
        ) : (
          <div 
            className={`
              inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium
              ${getStatusClasses(actionState.status)}
            `}
          >
            <span className="mr-2">{actionState.icon}</span>
            No action available
          </div>
        )}
        
        <div className={`rounded-lg border p-3 ${
          actionState.status === 'blocked' ? 'border-red-700/50 bg-red-950/20' :
          actionState.status === 'active' ? 'border-emerald-700/50 bg-emerald-950/20' :
          'border-slate-700/50 bg-slate-950/20'
        }`}>
          <p className={`text-xs font-medium ${
            actionState.status === 'blocked' ? 'text-red-200' :
            actionState.status === 'active' ? 'text-emerald-200' :
            'text-slate-400'
          }`}>
            {actionState.explanation}
          </p>
          
          {/* Operational Context - BLIND_BIDDING context removed */}
          
          {actionState.status === 'blocked' && (
            <div className="mt-2 text-xs text-red-200">
              <span className="font-medium">⚠️ Resolution needed:</span> Check your cap space, roster eligibility, or contact commissioner.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuickActionIndicator({ 
  className = '', 
  variant = 'standard',
  ...props 
}: ActionClarityProps & { variant?: 'standard' | 'mobile' }) {
  const actionState = determineActionState(props);
  
  if (variant === 'mobile') {
    return (
      <div className={`flex items-center justify-between text-xs ${className}`}>
        <span className="flex items-center gap-1 text-slate-400">
          <span>{actionState.icon}</span>
          <span>{actionState.explanation}</span>
        </span>
        {actionState.primaryAction && (
          <span className={`
            px-2 py-1 rounded-full text-xs font-medium
            ${getStatusClasses(actionState.status)}
          `}>
            {actionState.primaryAction}
          </span>
        )}
      </div>
    );
  }
  
  return (
    <span 
      className={`
        inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
        ${getStatusClasses(actionState.status)}
        ${className}
      `}
      title={actionState.explanation}
    >
      <span className="mr-1">{actionState.icon}</span>
      {actionState.primaryAction || 'No action'}
    </span>
  );
}