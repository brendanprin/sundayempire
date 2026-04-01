"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { TradeReviewWorkspace } from "@/components/trades/trade-review-workspace";
import { requestJson } from "@/lib/client-request";
import type { TradeProposalDetailResponse } from "@/types/trade-workflow";

export default function TradeProposalDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = Array.isArray(params?.proposalId) ? params.proposalId[0] : params?.proposalId;
  const [detail, setDetail] = useState<TradeProposalDetailResponse | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("");

  const load = useCallback(async () => {
    if (!proposalId) {
      return;
    }

    const payload = await requestJson<TradeProposalDetailResponse>(
      `/api/trades/proposals/${proposalId}`,
      undefined,
      "Failed to load trade proposal.",
    );
    setDetail(payload);
  }, [proposalId]);

  useEffect(() => {
    let mounted = true;
    load()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load trade proposal.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [load]);

  const runAction = useCallback(
    async (label: string, successMessage: string, action: () => Promise<TradeProposalDetailResponse>) => {
      setBusyLabel(label);
      setError(null);
      setMessage(null);
      try {
        const payload = await action();
        setDetail(payload);
        setMessage(successMessage);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Trade action failed.",
        );
      } finally {
        setBusyLabel(null);
      }
    },
    [],
  );

  if (!proposalId) {
    return (
      <CanonicalRouteState
        eyebrow="Trade Review"
        title="Trade Review"
        description="Review proposal details, current status, and available actions for this trade."
        tone="error"
        message="This route is missing trade proposal context, so Trade Review cannot open."
        safetyCopy="Existing trade records are unchanged. Reopen the proposal from Trades or the trade inbox."
        actionHref="/trades"
        actionLabel="Open Trades"
        testId="trade-review-route-state"
      />
    );
  }

  if (error && !detail) {
    return (
      <CanonicalRouteState
        eyebrow="Trade Review"
        title="Trade Review"
        description="Review proposal details, current status, and available actions for this trade."
        tone="error"
        message="Trade Review could not load."
        safetyCopy={`${error} Existing proposal and evaluation data are unchanged. Refresh to retry, or return to Trades.`}
        actionHref="/trades"
        actionLabel="Open Trades"
        testId="trade-review-route-state"
      />
    );
  }

  if (!detail) {
    return (
      <CanonicalRouteState
        eyebrow="Trade Review"
        title="Trade Review"
        description="Review proposal details, current status, and available actions for this trade."
        tone="loading"
        message="Loading proposal details, current status, and available actions."
        safetyCopy="Existing trade proposal data stays unchanged while this page loads."
        testId="trade-review-route-state"
      />
    );
  }

  return (
    <TradeReviewWorkspace
      detail={detail}
      busyLabel={busyLabel}
      error={error}
      message={message}
      reviewReason={reviewReason}
      onReviewReasonChange={setReviewReason}
      onSubmitProposal={() =>
        runAction("submit", "Proposal submitted to the counterparty.", () =>
          requestJson<TradeProposalDetailResponse>(
            `/api/trades/proposals/${proposalId}/submit`,
            { method: "POST" },
            "Failed to submit proposal.",
          ),
        )
      }
      onAccept={() =>
        runAction("accept", "Trade accepted. Awaiting commissioner settlement.", () =>
          requestJson<TradeProposalDetailResponse>(
            `/api/trades/proposals/${proposalId}/accept`,
            { method: "POST" },
            "Failed to accept proposal.",
          ),
        )
      }
      onDecline={() =>
        runAction("decline", "Trade declined. This proposal is now closed.", () =>
          requestJson<TradeProposalDetailResponse>(
            `/api/trades/proposals/${proposalId}/decline`,
            { method: "POST" },
            "Failed to decline proposal.",
          ),
        )
      }
      onApprove={() =>
        runAction("approve", "Trade approved. It will proceed to settlement.", () =>
          requestJson<TradeProposalDetailResponse>(
            `/api/commissioner/trades/${proposalId}/review`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                decision: "approve",
                reason: reviewReason,
              }),
            },
            "Failed to approve flagged trade.",
          ),
        )
      }
      onReject={() =>
        runAction("reject", "Trade rejected. This proposal will not proceed.", () =>
          requestJson<TradeProposalDetailResponse>(
            `/api/commissioner/trades/${proposalId}/review`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                decision: "reject",
                reason: reviewReason,
              }),
            },
            "Failed to reject flagged trade.",
          ),
        )
      }
      onProcess={() =>
        runAction("process", "Trade settled. Roster and cap changes have been applied.", () =>
          requestJson<TradeProposalDetailResponse>(
            `/api/commissioner/trades/${proposalId}/settle`,
            {
              method: "POST",
            },
            "Failed to settle trade proposal.",
          ),
        )
      }
    />
  );
}
