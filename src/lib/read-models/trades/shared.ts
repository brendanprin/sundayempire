import type { TradeProposalStatus, TradeProposal } from "@prisma/client";
import type { TradeProposalRecord } from "@/lib/repositories/trades/trade-proposal-repository";
import type { TradeEvaluationRecord } from "@/lib/repositories/trades/trade-evaluation-repository";
import type {
  TradeAssetView,
  TradeEvaluationView,
  TradeProposalSummary,
} from "@/types/trade-workflow";

function safePostTradeProjection(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "available" in value &&
    typeof (value as { available?: unknown }).available === "boolean"
  ) {
    return value;
  }

  return {
    available: false,
    teamA: null,
    teamB: null,
  };
}

function safeFindings(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function safeRemediation(value: unknown) {
  if (value && typeof value === "object") {
    return value;
  }

  return null;
}

export function mapTradeAssetView(
  asset: TradeProposalRecord["assets"][number],
): TradeAssetView {
  return {
    id: asset.id,
    assetOrder: asset.assetOrder,
    assetType: asset.assetType,
    fromTeamId: asset.fromTeamId,
    toTeamId: asset.toTeamId,
    label:
      asset.snapshotLabel ||
      asset.player?.name ||
      (asset.futurePick
        ? `${asset.futurePick.seasonYear} R${asset.futurePick.round}`
        : "Unknown asset"),
    player: asset.player
      ? {
          id: asset.player.id,
          name: asset.player.name,
          position: asset.player.position,
          isRestricted: asset.player.isRestricted,
        }
      : null,
    futurePick: asset.futurePick
      ? {
          id: asset.futurePick.id,
          seasonYear: asset.futurePick.seasonYear,
          round: asset.futurePick.round,
          overall: asset.futurePick.overall,
          originalTeam: {
            id: asset.futurePick.originalTeam.id,
            name: asset.futurePick.originalTeam.name,
            abbreviation: asset.futurePick.originalTeam.abbreviation,
          },
          currentTeam: {
            id: asset.futurePick.currentTeam.id,
            name: asset.futurePick.currentTeam.name,
            abbreviation: asset.futurePick.currentTeam.abbreviation,
          },
          isUsed: asset.futurePick.isUsed,
        }
      : null,
    contract: asset.contract
      ? {
          id: asset.contract.id,
          salary: asset.contract.salary,
          yearsRemaining: asset.contract.yearsRemaining,
          status: asset.contract.status,
          isFranchiseTag: asset.contract.isFranchiseTag,
        }
      : null,
  };
}

export function mapTradeEvaluationView(
  evaluation: TradeEvaluationRecord,
): TradeEvaluationView {
  return {
    id: evaluation.id,
    trigger: evaluation.trigger,
    outcome: evaluation.outcome,
    isCurrent: evaluation.isCurrent,
    isSubmissionSnapshot: evaluation.isSubmissionSnapshot,
    assetFingerprint: evaluation.assetFingerprint,
    findings: safeFindings(evaluation.findingsJson) as TradeEvaluationView["findings"],
    remediation: safeRemediation(evaluation.remediationJson) as TradeEvaluationView["remediation"],
    postTradeProjection: safePostTradeProjection(
      evaluation.postTradeProjectionJson,
    ) as TradeEvaluationView["postTradeProjection"],
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
    createdByUser: evaluation.createdByUser
      ? {
          id: evaluation.createdByUser.id,
          name: evaluation.createdByUser.name,
          email: evaluation.createdByUser.email,
        }
      : null,
  };
}

export function findCurrentEvaluation(
  record: Pick<TradeProposalRecord, "evaluations">,
): TradeEvaluationRecord | null {
  return (record.evaluations.find((evaluation) => evaluation.isCurrent) ??
    null) as TradeEvaluationRecord | null;
}

export function mapTradeProposalSummary(
  proposal: TradeProposalRecord,
): TradeProposalSummary {
  const currentEvaluation = findCurrentEvaluation(proposal);

  return {
    id: proposal.id,
    status: proposal.status,
    proposerTeam: {
      id: proposal.proposerTeam.id,
      name: proposal.proposerTeam.name,
      abbreviation: proposal.proposerTeam.abbreviation,
    },
    counterpartyTeam: {
      id: proposal.counterpartyTeam.id,
      name: proposal.counterpartyTeam.name,
      abbreviation: proposal.counterpartyTeam.abbreviation,
    },
    assetCount: proposal.assets.length,
    submittedAt: proposal.submittedAt?.toISOString() ?? null,
    updatedAt: proposal.updatedAt.toISOString(),
    currentEvaluationOutcome: currentEvaluation?.outcome ?? null,
    reviewRequired:
      proposal.status === "REVIEW_PENDING" ||
      currentEvaluation?.outcome === "FAIL_REQUIRES_COMMISSIONER",
    hardBlocked: currentEvaluation?.outcome === "FAIL_HARD_BLOCK",
  };
}

export function sortProposalSummariesByUpdatedAt<T extends { updatedAt: string }>(rows: T[]) {
  return [...rows].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function isTradeProposalClosed(status: TradeProposalStatus) {
  return (
    status === "DECLINED" ||
    status === "REVIEW_REJECTED" ||
    status === "PROCESSED" ||
    status === "CANCELED"
  );
}

export function isTradeProposalReadyToSettle(status: TradeProposalStatus) {
  return status === "ACCEPTED" || status === "REVIEW_APPROVED";
}
