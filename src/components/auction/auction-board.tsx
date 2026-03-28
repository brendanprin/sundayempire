"use client";

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { TimeLeftBadge } from "./timer-display";
import { QuickActionIndicator } from "./action-clarity";
import { shouldShowAuctionTimer } from "@/lib/domain/auction/timer-display-logic";
import { VeteranAuctionDisplayState } from "@/lib/domain/auction/shared";
import { MobileAuctionList } from "./mobile-auction-list";
import { AuctionErrorBoundary, AuctionLoadingSkeleton } from "./auction-error-boundary";
import type { AuctionBoardRow } from "@/lib/read-models/auction/enhanced-auction-room-projection";

type SortColumn = 'timeLeft' | 'totalValue' | 'playerName' | 'position' | 'myInvolvement';
type SortDirection = 'asc' | 'desc';

/**
 * Props for the AuctionBoard component
 */
type AuctionBoardProps = {
  /** Array of auction board rows to display */
  rows: AuctionBoardRow[];
  /** Currently selected player ID */
  selectedPlayerId: string | null;
  /** Callback when a player is selected */
  onPlayerSelect: (playerId: string) => void;
  /** User permissions for action validation */
  permissions?: {
    canBid?: boolean;
  };
  /** Auction configuration for enhanced validation */
  auctionConfig?: {
    mode?: string;
    blindWindowActive?: boolean;
    isEmergencyFillIn?: boolean;
  };
  /** Loading state indicator */
  isLoading?: boolean;
  /** Display variant - auto detects based on screen size */
  variant?: 'desktop' | 'mobile' | 'auto';
  /** Error handler for auction board errors */
  onError?: (error: Error) => void;
  /** Accessibility label override */
  ariaLabel?: string;
  /** Additional CSS classes */
  className?: string;
};

type BoardFilters = {
  search: string;
  status: string;
  position: string;
  myInvolvement: 'all' | 'leading' | 'bidding' | 'available';
};

function formatMoney(value: number | null): string {
  if (value === null || value === 0) return "—";
  return `$${value.toLocaleString()}`;
}

function formatTimeLeft(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds <= 0) return "Concluded";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// VA-1: Use canonical display state for consistent badge styling
function getDisplayStateBadgeClasses(displayConfig: ReturnType<typeof import("@/lib/domain/auction/shared").getVeteranAuctionDisplayConfig>): string {
  const baseClasses = "inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium";
  return `${baseClasses} ${displayConfig.badgeClass}`;
}

/**
 * Memoized row component for performance
 */
const AuctionBoardRow = memo(function AuctionBoardRow({
  row,
  isSelected,
  onClick,
  onKeyDown,
  permissions,
  auctionConfig,
}: {
  row: AuctionBoardRow;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  permissions?: { canBid?: boolean };
  auctionConfig?: { mode?: string; blindWindowActive?: boolean; isEmergencyFillIn?: boolean };
}) {
  // VA-1: Use canonical display state for aria description
  const ariaDescription = `${row.playerName}, ${row.position}, ${row.displayConfig.label}${row.leadingSalary ? `, current bid $${row.leadingSalary.toLocaleString()}` : ''}`;

  return (
    <tr
      className={getRowClasses(row, isSelected)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label={ariaDescription}
    >
      <td className="px-3 py-1.5">
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-50 text-base leading-tight">
            {row.playerName}
          </div>
          <div className="text-xs text-slate-500">
            {row.position} · {row.nflTeam || "FA"} · #{row.draftRank || "-"}
          </div>
        </div>
      </td>
      
      <td className="px-3 py-1.5">
        {/* VA-1: Use canonical display state for status */}
        <span className={getDisplayStateBadgeClasses(row.displayConfig)}>
          {row.displayConfig.label}
        </span>
      </td>
      
      <td className="px-3 py-1.5">
        <div className="text-sm">
          {/* VA-1: Show bid info only if displayConfig allows */}
          {row.displayConfig.showSalary && row.leadingTotalValue && row.leadingSalary && row.leadingYears ? (
            <>
              <div className="font-bold text-slate-50 text-base">
                {formatMoney(row.leadingTotalValue)}
              </div>
              <div className="text-xs text-slate-500">
                ${row.leadingSalary.toLocaleString()} / {row.leadingYears}y
              </div>
              {row.displayConfig.showLeader && row.currentLeaderTeamName && (
                <div className="text-xs text-slate-400">
                  {row.currentLeaderTeamAbbreviation || row.currentLeaderTeamName}
                </div>
              )}
            </>
          ) : (
            <div className="font-bold text-slate-50 text-base">
              {formatMoney(null)}
            </div>
          )}
        </div>
      </td>
      
      <td className="px-3 py-1.5">
        {/* VA-1: Show timer only if displayConfig allows */}
        {row.displayConfig.showTimer ? (
          <TimeLeftBadge 
            deadline={row.openBidClosesAt}
            seconds={row.timeLeftSeconds}
            variant="standard"
          />
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      
      <td className="px-3 py-1.5">
        <QuickActionIndicator
          displayState={row.displayState}
          displayConfig={row.displayConfig}
          myInvolvementState={row.myInvolvementState}
          permissions={permissions ?? { canBid: false }}
          playerData={{
            isRestricted: row.isRestricted,
          }}
          auctionConfig={auctionConfig}
          className="text-xs"
        />
      </td>
      
      {/* Hidden description for screen readers */}
      <div id={`player-${row.playerId}-description`} className="sr-only">
        {ariaDescription}
      </div>
    </tr>
  );
});

/**
 * Get row CSS classes based on selection state and player status
 */
function getRowClasses(row: AuctionBoardRow, isSelected: boolean): string {
  const baseClasses = "cursor-pointer transition-all duration-150 border-b border-slate-800 hover:bg-slate-900/70 hover:border-slate-700";
  
  if (isSelected) {
    return `${baseClasses} bg-sky-900/40 border-sky-600 shadow-lg shadow-sky-900/20 ring-1 ring-sky-600/30`;
  }
  
  if (row.isMyLeader) {
    return `${baseClasses} bg-emerald-900/15 border-emerald-800/50`;
  }
  
  if (row.isMyBidding) {
    return `${baseClasses} bg-amber-900/15 border-amber-800/50`;
  }
  
  if (row.timeLeftSeconds !== null && row.timeLeftSeconds <= 300) { // 5 minutes
    return `${baseClasses} bg-red-900/15 border-red-800/50`;
  }
  
  return baseClasses;
}

function sortRows(
  rows: AuctionBoardRow[], 
  sortBy: SortColumn,
  direction: SortDirection
): AuctionBoardRow[] {
  const multiplier = direction === 'desc' ? -1 : 1;
  
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'timeLeft':
        const aTime = a.timeLeftSeconds ?? Infinity;
        const bTime = b.timeLeftSeconds ?? Infinity;
        return (aTime - bTime) * multiplier;
        
      case 'totalValue':
        const aValue = a.leadingTotalValue ?? 0;
        const bValue = b.leadingTotalValue ?? 0;
        return (aValue - bValue) * multiplier;
        
      case 'playerName':
        return a.playerName.localeCompare(b.playerName) * multiplier;
        
      case 'position':
        const posOrder = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 6 };
        const aPos = (posOrder as any)[a.position] ?? 99;
        const bPos = (posOrder as any)[b.position] ?? 99;
        if (aPos !== bPos) return (aPos - bPos) * multiplier;
        return a.playerName.localeCompare(b.playerName) * multiplier;
        
      case 'myInvolvement':
        const involvementOrder = { leading: 1, bidding: 2, available: 3 };
        const aInv = involvementOrder[a.myInvolvementState];
        const bInv = involvementOrder[b.myInvolvementState];
        if (aInv !== bInv) return (aInv - bInv) * multiplier;
        return a.playerName.localeCompare(b.playerName);
        
      default:
        return 0;
    }
  });
}

function filterRows(rows: AuctionBoardRow[], filters: BoardFilters): AuctionBoardRow[] {
  return rows.filter(row => {
    // VAH-2: Use canonical display state for filtering, not raw status
    if (filters.status !== 'ALL' && row.displayState !== filters.status) {
      return false;
    }
    
    // Position filter  
    if (filters.position !== 'ALL' && row.position !== filters.position) {
      return false;
    }
    
    // Involvement filter
    if (filters.myInvolvement !== 'all' && row.myInvolvementState !== filters.myInvolvement) {
      return false;
    }
    
    // Search filter
    if (filters.search.trim()) {
      const searchTerm = filters.search.trim().toLowerCase();
      const playerName = row.playerName.toLowerCase();
      const nflTeam = row.nflTeam?.toLowerCase() || '';
      
      if (!playerName.includes(searchTerm) && !nflTeam.includes(searchTerm)) {
        return false;
      }
    }
    
    return true;
  });
}

export function AuctionBoard({ 
  rows, 
  selectedPlayerId, 
  onPlayerSelect, 
  permissions, 
  auctionConfig, 
  isLoading, 
  variant = 'auto' 
}: AuctionBoardProps) {
  const [screenSize, setScreenSize] = useState<'mobile' | 'desktop'>('desktop');
  const [sortBy, setSortBy] = useState<SortColumn>('timeLeft');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<BoardFilters>({
    search: '',
    status: 'ALL',
    position: 'ALL',
    myInvolvement: 'all',
  });

  // Responsive detection
  useEffect(() => {
    if (variant !== 'auto') return;

    const checkScreenSize = () => {
      setScreenSize(window.innerWidth < 768 ? 'mobile' : 'desktop');
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [variant]);

  const effectiveVariant = variant === 'auto' ? screenSize : variant;

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortBy !== column) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const filteredAndSortedRows = useMemo(() => {
    const filtered = filterRows(rows, filters);
    return sortRows(filtered, sortBy, sortDirection);
  }, [rows, filters, sortBy, sortDirection]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6" data-testid="auction-board">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-slate-400">Loading auction board...</div>
        </div>
      </div>
    );
  }

  // Early return for mobile layout with enhanced filters
  if (effectiveVariant === 'mobile') {
    return (
      <div className="space-y-3" data-testid="auction-board-mobile">
        {/* Enhanced Mobile Filters - Better Organization */}
        <div className="space-y-3">
          {/* Primary Search */}
          <div>
            <input
              type="text"
              placeholder="Search players by name..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              data-testid="mobile-search-input"
            />
          </div>
          
          {/* Filter Row */}
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 transition-colors"
              value={filters.myInvolvement}
              onChange={(e) => setFilters(prev => ({ ...prev, myInvolvement: e.target.value as any }))}
              data-testid="mobile-filter-involvement"
            >
              <option value="all">All Players</option>
              <option value="leading">My Leads</option>
              <option value="bidding">My Bids</option>
              <option value="available">Available</option>
            </select>
            
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 transition-colors"
              value={filters.position}
              onChange={(e) => setFilters(prev => ({ ...prev, position: e.target.value }))}
              data-testid="mobile-filter-position"
            >
              <option value="ALL">All Positions</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DST">DST</option>
            </select>
          </div>
          
          {/* Results Summary */}
          {(filters.search || filters.myInvolvement !== 'all' || filters.position !== 'ALL') && (
            <div className="text-xs text-slate-400 px-1">
              {filteredAndSortedRows.length} of {rows.length} players
              {filters.search && ` matching "${filters.search}"`}
              {filters.myInvolvement !== 'all' && ` · ${filters.myInvolvement}`}
              {filters.position !== 'ALL' && ` · ${filters.position}`}
            </div>
          )}
        </div>
        
        <MobileAuctionList
          rows={filteredAndSortedRows}
          selectedPlayerId={selectedPlayerId}
          onPlayerSelect={onPlayerSelect}
          permissions={permissions}
          auctionConfig={auctionConfig}
          isLoading={isLoading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="auction-board-desktop">
      {/* Search and Filter Controls */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-1">
          <input
            type="text"
            placeholder="Search players..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>
        
        <div>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="ALL">All Status</option>
            {/* VAH-2: Use canonical display states for filtering */}
            <option value="OPEN_MARKET">Open market</option>
            <option value="ACTIVE_BIDDING">Bidding</option>
            <option value="AWARDED">Awarded</option>
            <option value="INELIGIBLE">Ineligible</option>
          </select>
        </div>
        
        <div>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={filters.position}
            onChange={(e) => setFilters(prev => ({ ...prev, position: e.target.value }))}
          >
            <option value="ALL">All Positions</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
            <option value="K">K</option>
            <option value="DST">DST</option>
          </select>
        </div>
        
        <div>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={filters.myInvolvement}
            onChange={(e) => setFilters(prev => ({ 
              ...prev, 
              myInvolvement: e.target.value as BoardFilters['myInvolvement']
            }))}
          >
            <option value="all">All Players</option>
            <option value="leading">My Leaders</option>
            <option value="bidding">My Bids</option>
            <option value="available">Available</option>
          </select>
        </div>
      </div>

      {/* Dense Auction Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/60 border-b border-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">
                  <button
                    onClick={() => handleSort('playerName')}
                    className="text-xs font-semibold text-slate-200 hover:text-slate-50 uppercase tracking-wide"
                  >
                    Player {getSortIcon('playerName')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <button
                    onClick={() => handleSort('position')}
                    className="text-xs font-semibold text-slate-200 hover:text-slate-50 uppercase tracking-wide"
                  >
                    Pos {getSortIcon('position')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Status
                  </div>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <button
                    onClick={() => handleSort('myInvolvement')}
                    className="text-xs font-semibold text-slate-200 hover:text-slate-50 uppercase tracking-wide"
                  >
                    Leader {getSortIcon('myInvolvement')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">
                  <div className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Salary
                  </div>
                </th>
                <th className="px-3 py-2 text-center hidden md:table-cell">
                  <div className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Years
                  </div>
                </th>
                <th className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleSort('totalValue')}
                    className="text-xs font-bold text-slate-100 hover:text-slate-50 uppercase tracking-wide"
                  >
                    Total Value {getSortIcon('totalValue')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">
                  <button
                    onClick={() => handleSort('timeLeft')}
                    className="text-xs font-semibold text-slate-200 hover:text-slate-50 uppercase tracking-wide"
                  >
                    Time Left {getSortIcon('timeLeft')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedRows.map((row) => {
                const isSelected = selectedPlayerId === row.playerId;
                return (
                  <tr
                    key={row.playerId}
                    className={getRowClasses(row, isSelected)}
                    onClick={() => onPlayerSelect(row.playerId)}
                    data-testid={`auction-row-${row.playerId}`}
                  >
                    {/* Player Name + NFL Team */}
                    <td className="px-3 py-2">
                      <div>
                        <div className="font-semibold text-slate-50 text-base leading-tight">{row.playerName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {row.nflTeam ?? 'FA'} · Rank {row.draftRank ?? '-'}
                        </div>
                      </div>
                    </td>
                    
                    {/* Position */}
                    <td className="px-3 py-2">
                      <span className="text-sm font-medium text-slate-200">{row.position}</span>
                    </td>
                    
                    {/* Status */}
                    <td className="px-3 py-2">
                      {/* VAH-2: Use canonical display state badge instead of raw status */}
                      <span className={getDisplayStateBadgeClasses(row.displayConfig)}>
                        {row.displayConfig.label}
                      </span>
                    </td>
                    
                    {/* Leader */}
                    <td className="px-3 py-2">
                      <div className="text-sm space-y-1">
                        <div>
                          {row.currentLeaderTeamName ? (
                            <span className="text-slate-100 font-semibold">{row.currentLeaderTeamAbbreviation || row.currentLeaderTeamName}</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800/40 text-slate-400 border border-slate-700/50">Open market</span>
                          )}
                        </div>
                        {row.isMyLeader && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-900/40 text-emerald-100 border border-emerald-600/60">
                            ● Leading
                          </span>
                        )}
                        {row.isMyBidding && !row.isMyLeader && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-900/40 text-amber-100 border border-amber-600/60">
                            ● Bidding
                          </span>
                        )}
                      </div>
                    </td>
                    
                    {/* Salary (Hidden on Mobile) */}
                    <td className="px-3 py-2 text-right hidden md:table-cell">
                      <span className="text-sm text-slate-200 font-medium">
                        {formatMoney(row.leadingSalary)}
                      </span>
                    </td>
                    
                    {/* Years (Hidden on Mobile) */}
                    <td className="px-3 py-2 text-center hidden md:table-cell">
                      <span className="text-sm text-slate-200 font-medium">
                        {row.leadingYears ?? (
                          <span className="text-slate-600">—</span>
                        )}
                      </span>
                    </td>
                    
                    {/* Total Value - Emphasized */}
                    <td className="px-3 py-2 text-right">
                      <span className="font-bold text-slate-50 text-base">
                        {formatMoney(row.leadingTotalValue)}
                      </span>
                    </td>
                    
                    {/* Time Left - Now More Prominent */}
                    <td className="px-3 py-2 text-right hidden md:table-cell">
                      {(() => {
                        const timerCheck = shouldShowAuctionTimer(row);
                        return timerCheck.shouldShow ? (
                          <TimeLeftBadge 
                            deadline={row.openBidClosesAt}
                            seconds={row.timeLeftSeconds}
                            variant="standard"
                          />
                        ) : (
                          <span className="text-slate-600">—</span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {filteredAndSortedRows.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-slate-400">
            No players match the current filters.
          </div>
        )}
      </div>
      
      {/* Summary Stats */}
      <div className="text-xs text-slate-500">
        Showing {filteredAndSortedRows.length} of {rows.length} players
        {filters.search && ` matching "${filters.search}"`}
      </div>
    </div>
  );
}