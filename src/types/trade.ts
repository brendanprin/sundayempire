export type TradeStatus = "PROPOSED" | "APPROVED" | "PROCESSED" | "REJECTED" | "CANCELED";
export type TradeAssetType = "PLAYER" | "PICK";

export const TRADE_STATUS_VALUES: TradeStatus[] = [
  "PROPOSED",
  "APPROVED",
  "PROCESSED",
  "REJECTED",
  "CANCELED",
];

export const TRADE_ASSET_TYPE_VALUES: TradeAssetType[] = ["PLAYER", "PICK"];

export type TradeFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  context?: Record<string, unknown>;
};

export type TradeAssetInput = {
  assetType?: unknown;
  playerId?: unknown;
  futurePickId?: unknown;
};

export type TradeAssetSummary = {
  assetType: TradeAssetType;
  fromTeamId: string;
  toTeamId: string;
  playerId: string | null;
  futurePickId: string | null;
  label: string;
};

export type TradeAnalyzeRequest = {
  teamAId?: unknown;
  teamBId?: unknown;
  teamAAssets?: unknown;
  teamBAssets?: unknown;
  notes?: unknown;
};

export type TradeTeamImpact = {
  teamId: string;
  teamName: string;
  rosterCountBefore: number;
  rosterCountAfter: number;
  rosterDelta: number;
  totalCapBefore: number;
  totalCapAfter: number;
  capDelta: number;
};

export type TradeAnalyzeResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: string;
  };
  trade: {
    teamAId: string;
    teamBId: string;
    notes: string | null;
  };
  legal: boolean;
  findings: TradeFinding[];
  assets: TradeAssetSummary[];
  impact: {
    teamA: TradeTeamImpact | null;
    teamB: TradeTeamImpact | null;
  };
};

export type TradeSummary = {
  id: string;
  seasonId: string;
  teamA: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  teamB: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  status: TradeStatus;
  notes: string | null;
  proposedAt: string;
  processedAt: string | null;
  assets: TradeAssetSummary[];
};

export type TradesListResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  filter: {
    status: TradeStatus | null;
  };
  trades: TradeSummary[];
};

export type CreateTradeRequest = TradeAnalyzeRequest;

export type CreateTradeResponse = {
  trade: TradeSummary;
  analysis: {
    legal: boolean;
    findings: TradeFinding[];
  };
};

export type TradeAssetRequestInput = {
  assetType: TradeAssetType;
  playerId?: string;
  futurePickId?: string;
};

export type CounterpartHistorySignal = {
  counterpartTeamId: string;
  counterpartTeamName: string;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  acceptanceRate: number;
  preferredReturnType: "PICK_FOCUSED" | "PLAYER_FOCUSED" | "BALANCED" | "UNSET";
  guidance: string;
};

export type CounterOfferVariant = {
  id: string;
  summary: string;
  teamAId: string;
  teamBId: string;
  teamAAssets: TradeAssetRequestInput[];
  teamBAssets: TradeAssetRequestInput[];
  requesterCapDelta: number;
  requesterRosterDelta: number;
  requesterSends: string[];
  requesterReceives: string[];
};

export type CounterOfferResponse = {
  tradeId: string;
  requesterTeamId: string;
  counterpartTeamId: string;
  counterpartTeamName: string;
  counterpartHistory: CounterpartHistorySignal;
  variants: CounterOfferVariant[];
};

export type UpgradeRecommendation = {
  id: string;
  summary: string;
  teamAId: string;
  teamBId: string;
  teamAAssets: TradeAssetRequestInput[];
  teamBAssets: TradeAssetRequestInput[];
  requesterCapDelta: number;
  requesterRosterDelta: number;
  projectedNext3MatchupsDelta: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
  requesterSends: string[];
  requesterReceives: string[];
};

export type UpgradeRecommendationResponse = {
  requesterTeamId: string;
  requesterTeamName: string;
  recommendations: UpgradeRecommendation[];
};

export function isTradeStatus(value: unknown): value is TradeStatus {
  if (typeof value !== "string") {
    return false;
  }

  return TRADE_STATUS_VALUES.includes(value as TradeStatus);
}

export function isTradeAssetType(value: unknown): value is TradeAssetType {
  if (typeof value !== "string") {
    return false;
  }

  return TRADE_ASSET_TYPE_VALUES.includes(value as TradeAssetType);
}
