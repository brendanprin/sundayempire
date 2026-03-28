"use client";

import { formatEnumLabel } from "@/lib/format-label";

type AuctionStatus = 
  | 'ELIGIBLE'
  | 'OPEN_BIDDING' 
  | 'AWARDED'
  | 'EXPIRED'
  | 'REOPENED'
  | 'INELIGIBLE'
  | 'WITHDRAWN';

type StatusChipProps = {
  status: AuctionStatus | string;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  className?: string;
};

type AuctionStatusContext = {
  isMyAward?: boolean;
  isMyLead?: boolean;
};

function getStatusConfig(status: AuctionStatus | string, context?: AuctionStatusContext) {
  const configs = {
    'ELIGIBLE': {
      label: 'Open market',
      description: 'No active bids yet — open for auction',
      icon: '📋',
      classes: 'bg-slate-900/50 text-slate-200 border border-slate-700/60 shadow-sm',
      urgency: 'none',
      operationalState: 'waiting',
      semantic: 'neutral',
    },
    'OPEN_BIDDING': {
      label: 'Bidding',
      description: 'Active auction with leading bids — competitive phase',
      icon: '⚡',
      classes: 'bg-orange-900/60 text-orange-100 border border-orange-600/70 ring-1 ring-orange-500/40 shadow-lg shadow-orange-500/20',
      urgency: 'caution',
      operationalState: 'competitive-pressure',
      semantic: 'competitive',
    },
    'AWARDED': {
      label: 'Awarded',
      description: context?.isMyAward ? 'Successfully acquired - excellent!' : 'Player awarded to another team',
      icon: context?.isMyAward ? '🏆' : '✅',
      classes: context?.isMyAward 
        ? 'bg-green-900/60 text-green-200 border border-green-600/80 ring-2 ring-green-500/40 shadow-xl shadow-green-500/25'
        : 'bg-slate-800/50 text-slate-300 border border-slate-700/60 shadow-sm',
      urgency: context?.isMyAward ? 'favorable' : 'resolved',
      operationalState: 'complete',
      semantic: context?.isMyAward ? 'favorable' : 'neutral',
    },
    'EXPIRED': {
      label: 'Expired',
      description: 'Time limit reached — no valid bids received',
      icon: '⏰',
      classes: 'bg-slate-800/50 text-slate-300 border border-slate-700/60 shadow-sm',
      urgency: 'resolved',
      operationalState: 'complete',
      semantic: 'neutral',
    },
    'REOPENED': {
      label: 'Bidding',
      description: 'Auction restarted by commissioner — immediate action required',
      icon: '🔄',
      classes: 'bg-orange-900/60 text-orange-200 border border-orange-600/80 ring-2 ring-orange-500/40 shadow-xl shadow-orange-500/25 animate-pulse',
      urgency: 'caution-urgent',
      operationalState: 'action-required',
      semantic: 'competitive',
    },
    'INELIGIBLE': {
      label: 'Blocked',
      description: 'Cannot bid - rule violation or system block',
      icon: '🛑',
      classes: 'bg-red-900/60 text-red-200 border border-red-600/80 ring-2 ring-red-500/40 shadow-xl shadow-red-500/25',
      urgency: 'blocked',
      operationalState: 'blocked',
      semantic: 'risk',
    },
    'WITHDRAWN': {
      label: 'Withdrawn',
      description: 'Removed from auction pool by commissioner',
      icon: '📤',
      classes: 'bg-slate-800/50 text-slate-400 border border-slate-700/60 shadow-sm',
      urgency: 'resolved',
      operationalState: 'complete',
      semantic: 'neutral',
    },
  };

  return configs[status as AuctionStatus] || {
    label: formatEnumLabel(status),
    description: 'Unknown status - check with commissioner',
    icon: '❓',
    classes: 'bg-slate-800/40 text-slate-400 border border-slate-700/60 shadow-sm',
    urgency: 'none',
    operationalState: 'unknown',
  };
}

function getSizeClasses(size: 'small' | 'medium' | 'large') {
  const sizes = {
    small: 'px-2 py-0.5 text-xs',
    medium: 'px-3 py-1 text-sm font-medium',
    large: 'px-4 py-1.5 text-base font-semibold',
  };
  return sizes[size];
}

export function AuctionStatusChip({ 
  status, 
  size = 'medium', 
  showIcon = true, 
  className = '',
  context
}: StatusChipProps & { context?: AuctionStatusContext }) {
  const config = getStatusConfig(status, context);
  const sizeClasses = getSizeClasses(size);
  
  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium whitespace-nowrap transition-all duration-200
        ${config.classes}
        ${sizeClasses}
        ${className}
      `}
      title={config.description}
      data-testid={`auction-status-${status}`}
      data-semantic={config.semantic}
    >
      {showIcon && <span className="mr-1.5">{config.icon}</span>}
      {config.label}
    </span>
  );
}

export function StatusWithDescription({ status, showDescription = true }: {
  status: AuctionStatus | string;
  showDescription?: boolean;
}) {
  const config = getStatusConfig(status);
  
  return (
    <div className="flex flex-col gap-1">
      <AuctionStatusChip status={status} />
      {showDescription && (
        <p className="text-xs text-slate-400">{config.description}</p>
      )}
    </div>
  );
}