import type {
  TradeEvaluationOutcome,
  TradeEvaluationTrigger,
  TradeProposalStatus,
} from "@prisma/client";
import type {
  TradeAssetSelectionInput,
  TradePostProjection,
  TradeWorkflowFinding,
} from "@/types/trade-workflow";

export type TradePackageInput = {
  leagueId: string;
  seasonId: string;
  proposerTeamId: string;
  counterpartyTeamId: string;
  proposerAssets: TradeAssetSelectionInput[];
  counterpartyAssets: TradeAssetSelectionInput[];
};

export type PreparedTradeAsset = {
  fromTeamId: string;
  toTeamId: string;
  assetType: "PLAYER" | "PICK";
  playerId: string | null;
  futurePickId: string | null;
  contractId: string | null;
  assetOrder: number;
  snapshotLabel: string | null;
};

export type PreparedTradePackage = {
  proposerTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  counterpartyTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  assets: PreparedTradeAsset[];
};

export type TradePolicyEvaluation = {
  outcome: TradeEvaluationOutcome;
  trigger: TradeEvaluationTrigger;
  assetFingerprint: string;
  findings: TradeWorkflowFinding[];
  remediation: {
    requiresCommissionerReview: boolean;
    reasons: string[];
  } | null;
  postTradeProjection: TradePostProjection;
};

export type TradeProposalMutationInput = {
  proposalId?: string;
  package: TradePackageInput;
};

export type TradeProposalMutationResult = {
  proposalId: string;
  status: TradeProposalStatus;
};

export type TradeWorkflowActor = {
  userId: string;
  email: string;
  name: string | null;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  leagueId: string;
};
