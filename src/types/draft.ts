import { DraftStatus, DraftType } from "@prisma/client";
import type {
  DraftHomeProjection,
  DraftSetupProjection,
  RookieDraftRoomProjection,
  VeteranAuctionRoomProjection,
  VeteranAuctionSetupProjection,
} from "@/lib/read-models/draft/types";

export const DRAFT_TYPE_VALUES: DraftType[] = ["STARTUP", "ROOKIE", "VETERAN_AUCTION"];
export const DRAFT_STATUS_VALUES: DraftStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
export const DRAFT_LIFECYCLE_ACTIONS = [
  "START_DRAFT",
  "COMPLETE_DRAFT",
  "ADVANCE_PICK",
  "REWIND_PICK",
  "SET_PICK_INDEX",
] as const;

export function isDraftType(value: unknown): value is DraftType {
  if (typeof value !== "string") {
    return false;
  }

  return DRAFT_TYPE_VALUES.includes(value as DraftType);
}

export function isDraftStatus(value: unknown): value is DraftStatus {
  if (typeof value !== "string") {
    return false;
  }

  return DRAFT_STATUS_VALUES.includes(value as DraftStatus);
}

export type DraftLifecycleAction = (typeof DRAFT_LIFECYCLE_ACTIONS)[number];

export function isDraftLifecycleAction(value: unknown): value is DraftLifecycleAction {
  if (typeof value !== "string") {
    return false;
  }

  return (DRAFT_LIFECYCLE_ACTIONS as readonly string[]).includes(value);
}

export type DraftProgress = {
  totalPicks: number;
  picksMade: number;
  picksRemaining: number;
  currentPickNumber: number | null;
};

export type DraftSessionSummary = {
  id: string;
  leagueId: string;
  seasonId: string;
  type: DraftType;
  status: DraftStatus;
  title: string;
  currentPickIndex: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: DraftProgress;
};

export type DraftBoardRow = {
  id: string;
  pickId: string | null;
  futurePickStatus: "available" | "used" | null;
  futurePickSeasonYear: number | null;
  futurePickRound: number | null;
  futurePickOverall: number | null;
  selectingTeamId: string;
  selectingTeamName: string;
  selectingTeamAbbreviation: string | null;
  round: number;
  pickNumber: number;
  playerId: string | null;
  playerName: string | null;
  playerPosition: string | null;
  salary: number | null;
  contractYears: number | null;
  madeAt: string | null;
  isPassed: boolean;
};

export type DraftBoardResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  draft: DraftSessionSummary;
  board: DraftBoardRow[];
  currentPick: DraftBoardRow | null;
};

export type DraftsListResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  filters: {
    status: DraftStatus | null;
    type: DraftType | null;
  };
  drafts: DraftSessionSummary[];
};

export type CreateDraftRequest = {
  type?: unknown;
  title?: unknown;
};

export type CreateDraftResponse = {
  draft: DraftSessionSummary;
};

export type DraftLifecycleActionRequest = {
  action?: unknown;
  nextPickIndex?: unknown;
};

export type DraftLifecycleActionResponse = {
  draft: DraftSessionSummary;
  action: DraftLifecycleAction;
};

export type DraftPlayersResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  draft: {
    id: string;
    type: DraftType;
    status: DraftStatus;
    title: string;
  };
  filters: {
    search: string;
    position: "QB" | "RB" | "WR" | "TE" | "K" | "DST" | null;
    rostered: boolean | null;
    sortBy: "rank" | "tier" | "name" | "position" | "age";
    sortDir: "asc" | "desc";
  };
  players: {
    id: string;
    name: string;
    position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
    nflTeam: string | null;
    age: number | null;
    yearsPro: number | null;
    injuryStatus: string | null;
    isRestricted: boolean;
    isRostered: boolean;
    draftRank: number | null;
    draftTier: number | null;
    positionRank: number | null;
    bestRank: number | null;
    worstRank: number | null;
    averageRank: number | null;
    standardDeviation: number | null;
    ecrVsAdp: number | null;
    ownerTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
  }[];
  meta: {
    count: number;
  };
};

export type DraftSelectionRequest = {
  playerId?: unknown;
  selectingTeamId?: unknown;
  pickId?: unknown;
  salary?: unknown;
  contractYears?: unknown;
  isPassed?: unknown;
};

export type {
  DraftHomeProjection,
  DraftSetupProjection,
  RookieDraftRoomProjection,
  VeteranAuctionSetupProjection,
  VeteranAuctionRoomProjection,
};

export type DraftSetupRequest = {
  draftId?: unknown;
  type?: unknown;
  title?: unknown;
  regenerate?: unknown;
  finalizePool?: unknown;
  auctionMode?: unknown;
  auctionEndsAt?: unknown;
  auctionOpenBidWindowSeconds?: unknown;
  auctionBidResetSeconds?: unknown;
  selectedPlayerIds?: unknown;
};

export type DraftSetupResponse = {
  setup: DraftSetupProjection;
};

export type VeteranAuctionSetupResponse = {
  setup: VeteranAuctionSetupProjection;
};

export type DraftOrderEntryCorrectionRequest = {
  selectingTeamId?: unknown;
  owningTeamId?: unknown;
  reason?: unknown;
  futurePickId?: unknown;
  originalTeamId?: unknown;
  sourceType?: unknown;
};

export type DraftOrderEntryCorrectionResponse = {
  setup: DraftSetupProjection;
};

export type RookieDraftRoomResponse = RookieDraftRoomProjection;
export type VeteranAuctionRoomResponse = VeteranAuctionRoomProjection;

export type RookieDraftSelectActionRequest = {
  playerId?: unknown;
};

export type RookieDraftActionResponse = {
  draft: DraftSessionSummary;
};

export type AuctionOpenBidRequest = {
  teamId?: unknown;
  poolEntryId?: unknown;
  salaryAmount?: unknown;
  contractYears?: unknown;
};

export type AuctionBlindBidRequest = AuctionOpenBidRequest;

export type AuctionStatusSyncResponse = {
  ok: true;
  summary: {
    awardsCreated: number;
    expiredCount: number;
    reviewRequiredCount: number;
    completed: boolean;
  };
};

export type AuctionReviewRequest = {
  winningBidId?: unknown;
  reason?: unknown;
};

// VA-S11: Enhanced bid rejection diagnostics
export type BidRejectionType = 
  | "CONTEXT_MISSING"
  | "AUCTION_CLOSED" 
  | "PLAYER_RESTRICTED"
  | "WRONG_ENTRY_STATUS"
  | "CLOSED_BID_WINDOW"
  | "INSUFFICIENT_RAISE"
  | "BID_VALUE_TOO_LOW"
  | "CAP_VIOLATION"
  | "RULE_VIOLATION";

export type BidRejectionContext = {
  poolEntryStatus: string | null;
  playerName: string | null;
  // Optional fields depending on rejection type
  isRestricted?: boolean;
  auctionStatus?: string;
  bidType?: string;
  allowedStatuses?: string[];
  auctionMode?: string | null;
  blindWindowActive?: boolean;
  auctionEndsAt?: string | null;
  currentLeadingSalary?: number | null;
  proposedSalary?: number;
  minimumRequired?: number;
  incrementRequired?: number;
  proposedValue?: number;
  currentLeadingValue?: number;
  proposedYears?: number;
  leadingSalary?: number;
  leadingYears?: number;
  formula?: string;
  currentHardCap?: number;
  projectedHardCap?: number;
  hardCapLimit?: number;
  overage?: number;
  minimumSalary?: number;
  minimumYears?: number;
  maximumYears?: number;
  maxYearsForLowSalary?: number;
  rule?: string;
};
