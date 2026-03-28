import type { Prisma, PrismaClient, TradeAssetType, TradeEvaluationOutcome, TradeEvaluationTrigger, TradeProposalStatus } from "@prisma/client";

export type TradesRepositoryDbClient = PrismaClient | Prisma.TransactionClient;

export type TradeAssetParentIntent = {
  tradeId?: string | null;
  tradeProposalId?: string | null;
};

export type TradeAssetWriteInput = {
  fromTeamId: string;
  toTeamId: string;
  assetType: TradeAssetType;
  playerId?: string | null;
  futurePickId?: string | null;
  contractId?: string | null;
  assetOrder?: number;
  snapshotLabel?: string | null;
};

export type CreateTradeProposalInput = {
  leagueId: string;
  seasonId: string;
  proposerTeamId: string;
  counterpartyTeamId: string;
  createdByUserId: string;
  submittedByUserId?: string | null;
  counterpartyRespondedByUserId?: string | null;
  reviewedByUserId?: string | null;
  status?: TradeProposalStatus;
  submittedAt?: Date | null;
  counterpartyRespondedAt?: Date | null;
  reviewedAt?: Date | null;
};

export type UpdateTradeProposalInput = {
  proposerTeamId?: string;
  counterpartyTeamId?: string;
  submittedByUserId?: string | null;
  counterpartyRespondedByUserId?: string | null;
  reviewedByUserId?: string | null;
  status?: TradeProposalStatus;
  submittedAt?: Date | null;
  counterpartyRespondedAt?: Date | null;
  reviewedAt?: Date | null;
};

export type CreateTradeEvaluationInput = {
  proposalId: string;
  leagueId: string;
  seasonId: string;
  createdByUserId?: string | null;
  trigger: TradeEvaluationTrigger;
  outcome: TradeEvaluationOutcome;
  isCurrent?: boolean;
  isSubmissionSnapshot?: boolean;
  assetFingerprint: string;
  findingsJson: Prisma.InputJsonValue;
  remediationJson?: Prisma.InputJsonValue | null;
  postTradeProjectionJson: Prisma.InputJsonValue;
  evaluatedAt?: Date;
};
