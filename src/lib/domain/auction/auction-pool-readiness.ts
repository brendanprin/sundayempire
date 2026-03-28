import type { AuctionPoolReviewStatus, DraftStatus } from "@prisma/client";

export type AuctionPoolBlocker = {
  code: string;
  message: string;
};

export function createAuctionPoolBlockers(input: {
  draftStatus: DraftStatus;
  includedCount: number;
  reviewStatus: AuctionPoolReviewStatus | null;
}) {
  const blockers: AuctionPoolBlocker[] = [];

  if (input.includedCount === 0) {
    blockers.push({
      code: "AUCTION_POOL_EMPTY",
      message: "Generate at least one eligible veteran before the auction can open.",
    });
  }

  if (input.includedCount > 0 && input.reviewStatus !== "FINALIZED") {
    blockers.push({
      code: "AUCTION_POOL_NOT_FINALIZED",
      message: "Finalize the auction pool after review before opening the auction.",
    });
  }

  if (input.draftStatus !== "NOT_STARTED") {
    blockers.push({
      code: "AUCTION_ALREADY_STARTED",
      message: "Auction setup locks once the veteran auction has started.",
    });
  }

  return blockers;
}

export function deriveAuctionPoolReviewState(input: {
  includedCount: number;
  reviewStatus: AuctionPoolReviewStatus | null;
}) {
  if (input.includedCount === 0) {
    return "NOT_GENERATED" as const;
  }

  if (input.reviewStatus === "FINALIZED") {
    return "FINALIZED" as const;
  }

  return "PENDING_REVIEW" as const;
}

export function canRegenerateAuctionPool(input: {
  draftStatus: DraftStatus;
  bidCount: number;
  awardCount: number;
  reviewStatus: AuctionPoolReviewStatus | null;
}) {
  return (
    input.draftStatus === "NOT_STARTED" &&
    input.bidCount === 0 &&
    input.awardCount === 0 &&
    input.reviewStatus !== "FINALIZED"
  );
}

export function canFinalizeAuctionPool(input: {
  draftStatus: DraftStatus;
  bidCount: number;
  awardCount: number;
  includedCount: number;
  reviewStatus: AuctionPoolReviewStatus | null;
}) {
  return (
    input.draftStatus === "NOT_STARTED" &&
    input.bidCount === 0 &&
    input.awardCount === 0 &&
    input.includedCount > 0 &&
    input.reviewStatus !== "FINALIZED"
  );
}
