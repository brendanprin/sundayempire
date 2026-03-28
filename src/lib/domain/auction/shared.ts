import {
  AcquisitionType,
  AuctionBidStatus,
  AuctionBidType,
  AuctionPlayerPoolEntryStatus,
  AuctionSessionMode,
  DraftStatus,
  DraftType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";

export type AuctionDbClient = PrismaClient | Prisma.TransactionClient;

export type AuctionWarning = {
  code: string;
  message: string;
};

export const DEFAULT_AUCTION_OPEN_BID_WINDOW_SECONDS = 300; // 5 minutes per constitution
export const DEFAULT_AUCTION_BID_RESET_SECONDS = 300; // 5 minutes per constitution
export const DEFAULT_AUCTION_DURATION_HOURS = 72;
export const BLIND_AUCTION_FINAL_HOURS = 24;
export const MIN_OPEN_BID_INCREMENT = 1;
export const DEFAULT_EMERGENCY_FILL_IN_POOL_LIMIT = 40;
export const MAX_CONTRACT_YEARS = 4; // Constitutional maximum
export const BID_VALUE_UNOFFERED_YEAR_MULTIPLIER = 0.5; // 50% for unoffered years

/**
 * Calculate bid value using constitutional formula:
 * bid_value = annual_salary * years_offered + (annual_salary * 0.5 * years_not_offered_to_four)
 */
export function calculateBidValue(annualSalary: number, yearsOffered: number): number {
  const maxYears = MAX_CONTRACT_YEARS;
  const yearsNotOffered = Math.max(0, maxYears - yearsOffered);
  return annualSalary * yearsOffered + (annualSalary * BID_VALUE_UNOFFERED_YEAR_MULTIPLIER * yearsNotOffered);
}

/**
 * Compare two bids using constitutional valuation formula
 * Returns positive if bid1 > bid2, negative if bid1 < bid2, zero if equal
 */
export function compareBidValues(
  bid1: { salaryAmount: number; contractYears: number },
  bid2: { salaryAmount: number; contractYears: number }
): number {
  const value1 = calculateBidValue(bid1.salaryAmount, bid1.contractYears);
  const value2 = calculateBidValue(bid2.salaryAmount, bid2.contractYears);
  return value1 - value2;
}

export function buildDefaultVeteranAuctionTitle(seasonYear: number) {
  return `${seasonYear} Veteran Auction`;
}

export function buildDefaultAuctionEndsAt(now: Date) {
  return new Date(now.getTime() + DEFAULT_AUCTION_DURATION_HOURS * 60 * 60 * 1000);
}

export function blindAuctionStartsAt(auctionEndsAt: Date | null | undefined) {
  if (!auctionEndsAt) {
    return null;
  }

  return new Date(auctionEndsAt.getTime() - BLIND_AUCTION_FINAL_HOURS * 60 * 60 * 1000);
}

export function isBlindAuctionWindowActive(input: {
  auctionEndsAt: Date | null;
  now?: Date;
}) {
  if (!input.auctionEndsAt) {
    return false;
  }

  const now = input.now ?? new Date();
  const startsAt = blindAuctionStartsAt(input.auctionEndsAt);
  if (!startsAt) {
    return false;
  }

  return now >= startsAt;
}

export function canOpenBid(entryStatus: AuctionPlayerPoolEntryStatus) {
  // VA-S9: Include BLIND_BIDDING to handle legacy entries that may still exist from before conversion was removed
  return entryStatus === "ELIGIBLE" || entryStatus === "OPEN_BIDDING" || entryStatus === "REOPENED" || entryStatus === "BLIND_BIDDING";
}

// Removed canBlindBid - blind bidding no longer supported in canonical three-state model

export function isResolvedAuctionEntryStatus(status: AuctionPlayerPoolEntryStatus) {
  return status === "AWARDED" || status === "EXPIRED" || status === "WITHDRAWN";
}

export function isActiveAuctionBidStatus(status: AuctionBidStatus) {
  return status === "ACTIVE";
}

export function acquisitionTypeForAuctionMode(mode: AuctionSessionMode | null | undefined): AcquisitionType {
  return mode === "EMERGENCY_FILL_IN" ? "EMERGENCY_FILL_IN" : "AUCTION";
}

export function assertVeteranAuctionDraft(draft: {
  id: string;
  type: DraftType;
  status: DraftStatus;
}) {
  if (draft.type !== "VETERAN_AUCTION") {
    throw new Error("AUCTION_DRAFT_INVALID");
  }
}

export function assertAuctionActorCanManage(actorRole: CanonicalLeagueRole) {
  if (actorRole !== "COMMISSIONER") {
    throw new Error("FORBIDDEN");
  }
}

export function assertAuctionActorCanBid(input: {
  actorRole: CanonicalLeagueRole;
  actorTeamId: string | null;
  biddingTeamId: string;
}) {
  if (input.actorRole === "COMMISSIONER") {
    return;
  }

  if (input.actorRole === "MEMBER" && input.actorTeamId === input.biddingTeamId) {
    return;
  }

  throw new Error("FORBIDDEN");
}

export function normalizeAuctionMode(value: unknown): AuctionSessionMode {
  return value === "EMERGENCY_FILL_IN" ? "EMERGENCY_FILL_IN" : "STANDARD";
}

// VA-1: Canonical Veteran Auction Display States
// This replaces the split-brain state model with one canonical representation
// All UI components should derive their display from these canonical states

/**
 * Canonical display states for Veteran Auction workflow
 * This unified model removes confusion between database states and UI presentation
 */
export enum VeteranAuctionDisplayState {
  /** Player is available but has no active bids yet */
  OPEN_MARKET = "OPEN_MARKET",
  /** Player has an active leading bid with timer running */
  ACTIVE_BIDDING = "ACTIVE_BIDDING", 
  /** Player has been awarded and finalized */
  AWARDED = "AWARDED",
  /** Player is restricted or ineligible for bidding */
  INELIGIBLE = "INELIGIBLE"
}

/**
 * Canonical state mapping for Veteran Auction display
 * Maps from database status + context to unified display state
 * 
 * Rules:
 * - OPEN_MARKET: No valid leading bid exists yet
 * - ACTIVE_BIDDING: Has active leading bid, still contestable
 * - AWARDED: Finalized/awarded, no longer contestable
 * - INELIGIBLE: Cannot be bid on for various reasons
 */
export function deriveVeteranAuctionDisplayState(input: {
  status: AuctionPlayerPoolEntryStatus;
  hasActiveBid: boolean;
  isAwarded: boolean;
}): VeteranAuctionDisplayState {
  // Always prioritize awarded state if confirmed
  if (input.isAwarded || input.status === "AWARDED") {
    return VeteranAuctionDisplayState.AWARDED;
  }

  // Resolved states without awards are ineligible
  if (input.status === "EXPIRED" || input.status === "WITHDRAWN") {
    return VeteranAuctionDisplayState.INELIGIBLE;
  }

  // Active bidding requires both eligible status AND an active bid
  if (input.hasActiveBid && (input.status === "OPEN_BIDDING" || input.status === "ELIGIBLE" || input.status === "REOPENED" || input.status === "BLIND_BIDDING")) {
    return VeteranAuctionDisplayState.ACTIVE_BIDDING;
  }

  // Open market: eligible but no active bids (VA-S3: BLIND_BIDDING maps to open market for owner-facing)
  if (input.status === "ELIGIBLE" || input.status === "OPEN_BIDDING" || input.status === "REOPENED" || input.status === "BLIND_BIDDING") {
    return VeteranAuctionDisplayState.OPEN_MARKET;
  }

  // Default to ineligible for unknown states
  return VeteranAuctionDisplayState.INELIGIBLE;
}

/**
 * Display configuration for canonical auction states
 * Centralizes all UI presentation logic to ensure consistency
 */
export function getVeteranAuctionDisplayConfig(state: VeteranAuctionDisplayState) {
  switch (state) {
    case VeteranAuctionDisplayState.OPEN_MARKET:
      return {
        label: "Open Market",
        showTimer: false,
        showLeader: false,
        showSalary: false,
        showYears: false,
        allowBidding: true,
        badgeClass: "bg-slate-800/40 text-slate-300 border-slate-700/60",
        description: "Player available for auction"
      };

    case VeteranAuctionDisplayState.ACTIVE_BIDDING:
      return {
        label: "Active Bidding", 
        showTimer: true,
        showLeader: true,
        showSalary: true,
        showYears: true,
        allowBidding: true,
        badgeClass: "bg-green-900/40 text-green-100 border-green-700/60",
        description: "Bidding active with leading bid"
      };

    case VeteranAuctionDisplayState.AWARDED:
      return {
        label: "Finalized",
        showTimer: false,
        showLeader: true,
        showSalary: true,
        showYears: true,
        allowBidding: false,
        badgeClass: "bg-blue-900/40 text-blue-100 border-blue-700/60",
        description: "Player awarded and contract finalized"
      };

    case VeteranAuctionDisplayState.INELIGIBLE:
      return {
        label: "Ineligible",
        showTimer: false,
        showLeader: false,
        showSalary: false,
        showYears: false,
        allowBidding: false,
        badgeClass: "bg-gray-800/40 text-gray-300 border-gray-700/60",
        description: "Player not available for bidding"
      };
  }
}

export function normalizeAuctionBidType(value: unknown): AuctionBidType | null {
  if (value === "OPEN" || value === "BLIND") {
    return value;
  }

  return null;
}

export function parseAuctionDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export function parseOptionalPositiveInteger(
  value: unknown,
  fallback: number,
) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export function nowOrDefault(value?: Date | null) {
  return value ?? new Date();
}

export function createAuctionDbClient(client: AuctionDbClient = prisma) {
  return client;
}
