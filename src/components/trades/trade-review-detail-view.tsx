"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { TradeStatusBadge } from "@/components/trades/trade-status-badge";
import { Button, Textarea } from "@/components/ui";
import { formatEnumLabel } from "@/lib/format-label";
import type { TradeProposalDetailResponse } from "@/types/trade-workflow";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatDelta(before: number, after: number) {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta}`;
}

function formatTradeOutcomeLabel(
  outcome: TradeProposalDetailResponse["evaluationHistory"][number]["outcome"] | null | undefined,
) {
  if (outcome === "FAIL_HARD_BLOCK") {
    return "Blocked";
  }

  if (outcome === "FAIL_REQUIRES_COMMISSIONER") {
    return "Needs commissioner review";
  }

  if (outcome === "PASS_WITH_WARNING") {
    return "Ready with warnings";
  }

  if (outcome === "PASS") {
    return "Ready";
  }

  return "Not reviewed yet";
}

function formatTradeTriggerLabel(
  trigger: TradeProposalDetailResponse["evaluationHistory"][number]["trigger"],
) {
  if (trigger === "BUILDER_VALIDATE") {
    return "Builder review";
  }

  if (trigger === "COUNTERPARTY_RESPONSE") {
    return "Counterparty response";
  }

  if (trigger === "COMMISSIONER_REVIEW") {
    return "Commissioner review";
  }

  if (trigger === "SUBMIT") {
    return "Submission review";
  }

  return formatEnumLabel(trigger);
}

function buildActionGuidance(
  detail: TradeProposalDetailResponse,
  currentEvaluation: TradeProposalDetailResponse["currentEvaluation"],
) {
  if (detail.permissions.canProcess) {
    return "This proposal is approved and ready for commissioner settlement. Settling it will move players, picks, and audit history into league records.";
  }
  if (detail.permissions.canCommissionerReview) {
    return "Commissioner review is required before this proposal can move forward.";
  }
  if (detail.permissions.canAccept || detail.permissions.canDecline) {
    return "Your team can respond to this submitted proposal from the actions below.";
  }
  if (detail.permissions.canSubmit && currentEvaluation?.outcome === "FAIL_HARD_BLOCK") {
    return "This draft is blocked right now. Reopen the Trade Builder to resolve the current findings before submitting.";
  }
  if (
    detail.permissions.canSubmit &&
    currentEvaluation?.outcome === "FAIL_REQUIRES_COMMISSIONER"
  ) {
    return "This draft can move forward only through commissioner review. Submit it to place it in the review queue.";
  }
  if (detail.permissions.canSubmit) {
    return "The package is still in draft state. Submit it when the package is ready.";
  }
  if (detail.permissions.canEditDraft) {
    return "This draft can still be edited in the Trade Builder.";
  }
  return "No action is available for your role or the current trade state.";
}

function buildSubmitActionState(detail: TradeProposalDetailResponse) {
  if (!detail.permissions.canSubmit) {
    return null;
  }

  if (detail.currentEvaluation?.outcome === "FAIL_HARD_BLOCK") {
    return {
      blocked: true,
      buttonLabel: "Submit Trade Proposal",
      helperCopy:
        "This proposal cannot be submitted until the blocked findings are resolved in the Trade Builder.",
      className:
        "w-full rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-sm font-medium text-amber-100",
    } as const;
  }

  if (detail.currentEvaluation?.outcome === "FAIL_REQUIRES_COMMISSIONER") {
    return {
      blocked: false,
      buttonLabel: "Submit for Commissioner Review",
      helperCopy: null,
      className:
        "w-full rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm font-medium text-amber-100 hover:border-amber-500 disabled:opacity-60",
    } as const;
  }

  return {
    blocked: false,
    buttonLabel: "Submit Trade Proposal",
    helperCopy: null,
    className:
      "w-full rounded-lg border border-emerald-700/50 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-500 disabled:opacity-60",
  } as const;
}

function findingTone(category: string) {
  if (category === "hard_block") {
    return "border-rose-700/50 bg-rose-950/30 text-rose-100";
  }
  if (category === "review") {
    return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  }
  return "border-slate-700 bg-slate-900 text-slate-200";
}

export function TradeReviewDetailView(props: {
  detail: TradeProposalDetailResponse;
  busyLabel: string | null;
  error: string | null;
  message: string | null;
  reviewReason: string;
  onReviewReasonChange: (value: string) => void;
  onSubmitProposal: () => Promise<void> | void;
  onAccept: () => Promise<void> | void;
  onDecline: () => Promise<void> | void;
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  onProcess: () => Promise<void> | void;
}) {
  const proposerAssets = props.detail.proposal.assets.filter(
    (asset) => asset.fromTeamId === props.detail.proposal.proposerTeam.id,
  );
  const counterpartyAssets = props.detail.proposal.assets.filter(
    (asset) => asset.fromTeamId === props.detail.proposal.counterpartyTeam.id,
  );
  const currentEvaluation = props.detail.currentEvaluation;
  const actionGuidance = buildActionGuidance(props.detail, currentEvaluation);
  const submitActionState = buildSubmitActionState(props.detail);

  return (
    <div className="space-y-6" data-testid="trade-detail">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Trades</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-100">Trade Review</h2>
            <p className="mt-2 text-sm text-slate-300">
              {props.detail.proposal.proposerTeam.name} vs {props.detail.proposal.counterpartyTeam.name}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Created {formatDateTime(props.detail.proposal.createdAt)} · Updated{" "}
              {formatDateTime(props.detail.proposal.updatedAt)}
            </p>
          </div>
          <TradeStatusBadge status={props.detail.proposal.status} />
        </div>
      </section>

      {props.error ? (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {props.error}
        </div>
      ) : null}
      {props.message ? (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {props.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Status" eyebrow="Workflow">
          <p className="text-lg font-semibold text-slate-100">
            {formatEnumLabel(props.detail.proposal.status)}
          </p>
        </DashboardCard>
        <DashboardCard title="Submitted" eyebrow="Current package">
          <p className="text-sm font-medium text-slate-100">
            {formatDateTime(props.detail.proposal.submittedAt)}
          </p>
        </DashboardCard>
        <DashboardCard title="Latest Decision" eyebrow="Trade review">
          <p className="text-sm font-medium text-slate-100">
            {formatTradeOutcomeLabel(currentEvaluation?.outcome)}
          </p>
        </DashboardCard>
        <DashboardCard title="Action Path" eyebrow="Viewer responsibility">
          <p className="text-sm font-medium text-slate-100">{actionGuidance}</p>
        </DashboardCard>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <DashboardCard
            title="Proposed exchange"
            description="Assets are grouped by sending team so the package reads clearly before anyone acts."
            testId="trade-review-composition"
          >
            <div className="grid gap-6 2xl:grid-cols-2">
              {[
                {
                  title: `${props.detail.proposal.proposerTeam.name} sends`,
                  assets: proposerAssets,
                },
                {
                  title: `${props.detail.proposal.counterpartyTeam.name} sends`,
                  assets: counterpartyAssets,
                },
              ].map((section) => (
                <div key={section.title} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-slate-100">{section.title}</p>
                  <ul className="mt-3 space-y-3">
                    {section.assets.map((asset) => (
                      <li
                        key={asset.id}
                        className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3"
                      >
                        <p className="font-medium text-slate-100">
                          {asset.player ? (
                            <Link href={`/players/${asset.player.id}`} className="hover:text-sky-300">
                              {asset.label}
                            </Link>
                          ) : (
                            asset.label
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {asset.assetType === "PLAYER"
                            ? `${formatEnumLabel(asset.contract?.status ?? "UNKNOWN")} · $${asset.contract?.salary ?? 0}`
                            : `${asset.futurePick?.seasonYear ?? "-"} round ${asset.futurePick?.round ?? "-"}`}
                        </p>
                      </li>
                    ))}
                    {section.assets.length === 0 ? (
                      <li className="text-sm text-slate-500">No assets listed.</li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Evaluation history" description="Most recent trade reviews appear first.">
            <ul className="space-y-3">
              {props.detail.evaluationHistory.map((evaluation) => (
                <li
                  key={evaluation.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-100">
                      {formatTradeTriggerLabel(evaluation.trigger)} ·{" "}
                      {formatTradeOutcomeLabel(evaluation.outcome)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(evaluation.evaluatedAt)}</p>
                  </div>
                  {evaluation.findings.length > 0 ? (
                    <p className="mt-2 text-sm text-slate-300">
                      {evaluation.findings.length} finding{evaluation.findings.length === 1 ? "" : "s"} in this review.
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No findings.</p>
                  )}
                </li>
              ))}
              {props.detail.evaluationHistory.length === 0 ? (
                <li className="text-sm text-slate-500">No review history yet.</li>
              ) : null}
            </ul>
          </DashboardCard>
        </div>

        <div className="space-y-6">
          <DashboardCard
            title="Current decision"
            description="The latest trade review outcome and findings."
            testId="trade-review-current-decision"
          >
            {!currentEvaluation ? (
                <p className="text-sm text-slate-500">
                  No current trade review is available. Reopen the Trade Builder if the package still needs another pass.
                </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-100">
                  Outcome: {formatTradeOutcomeLabel(currentEvaluation.outcome)}
                </p>
                {currentEvaluation.findings.map((finding) => (
                  <div
                    key={`${finding.code}:${finding.message}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${findingTone(finding.category)}`}
                  >
                    <p className="font-medium">{finding.code}</p>
                    <p className="mt-1">{finding.message}</p>
                  </div>
                ))}
                {currentEvaluation.findings.length === 0 ? (
                  <p className="text-sm text-slate-400">No findings in the latest trade review.</p>
                ) : null}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Post-trade impact"
            description="Before-and-after roster, cap, and compliance context for both teams."
          >
            {!currentEvaluation?.postTradeProjection.available ? (
              <p className="text-sm text-slate-500">
                Post-trade impact is unavailable for this snapshot. Re-run validation from the Trade Builder if you need a fresh impact view.
              </p>
            ) : (
              <div className="space-y-3">
                {[currentEvaluation.postTradeProjection.teamA, currentEvaluation.postTradeProjection.teamB]
                  .filter((team): team is NonNullable<typeof team> => Boolean(team))
                  .map((team) => (
                    <div
                      key={team.teamId}
                      className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm"
                    >
                      <p className="font-medium text-slate-100">{team.teamName}</p>
                      <div className="mt-2 space-y-1 text-slate-300">
                        <p>
                          Roster {team.rosterCountBefore} → {team.rosterCountAfter} (
                          {formatDelta(team.rosterCountBefore, team.rosterCountAfter)})
                        </p>
                        <p>
                          Active cap ${team.activeCapBefore} → ${team.activeCapAfter} (
                          {formatDelta(team.activeCapBefore, team.activeCapAfter)})
                        </p>
                        <p>
                          Dead cap ${team.deadCapBefore} → ${team.deadCapAfter} (
                          {formatDelta(team.deadCapBefore, team.deadCapAfter)})
                        </p>
                        <p>
                          Compliance {team.complianceStatusBefore} → {team.complianceStatusAfter}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Available actions"
            description="Only role-valid actions appear here, with an explanation when the workflow is blocked or complete."
            testId="trade-review-actions"
          >
            <p className="text-sm text-slate-300">{actionGuidance}</p>
            <div className="mt-4 space-y-3">
              {submitActionState?.blocked ? (
                <p
                  className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-sm text-amber-100"
                  data-testid="trade-review-blocked-note"
                >
                  {submitActionState.helperCopy}
                </p>
              ) : null}
              {props.detail.permissions.canEditDraft ? (
                <Link
                  href={`/trades/new?proposalId=${props.detail.proposal.id}`}
                  className="block rounded-lg border border-slate-700 px-3 py-2 text-center text-sm font-medium text-slate-100 hover:border-slate-500"
                >
                  Open Draft in Trade Builder
                </Link>
              ) : null}
              {submitActionState && !submitActionState.blocked ? (
                <Button
                  type="button"
                  variant={props.detail.currentEvaluation?.outcome === "FAIL_REQUIRES_COMMISSIONER" ? "secondary" : "primary"}
                  onClick={props.onSubmitProposal}
                  disabled={Boolean(props.busyLabel)}
                  loading={props.busyLabel === "submit"}
                  className={`w-full ${
                    props.detail.currentEvaluation?.outcome === "FAIL_REQUIRES_COMMISSIONER"
                      ? "border-amber-700/50 bg-amber-950/30 text-amber-100 hover:border-amber-500"
                      : ""
                  }`}
                >
                  {props.busyLabel === "submit" ? "Submitting..." : submitActionState.buttonLabel}
                </Button>
              ) : null}
              {props.detail.permissions.canAccept ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={props.onAccept}
                  disabled={Boolean(props.busyLabel)}
                  loading={props.busyLabel === "accept"}
                  className="w-full"
                >
                  {props.busyLabel === "accept" ? "Accepting..." : "Accept Trade Proposal"}
                </Button>
              ) : null}
              {props.detail.permissions.canDecline ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={props.onDecline}
                  disabled={Boolean(props.busyLabel)}
                  loading={props.busyLabel === "decline"}
                  className="w-full"
                >
                  {props.busyLabel === "decline" ? "Declining..." : "Decline Trade Proposal"}
                </Button>
              ) : null}

              {props.detail.permissions.canCommissionerReview ? (
                <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
                  <label className="block text-sm text-amber-100">
                    <span className="mb-1 block font-medium">Commissioner review reason</span>
                    <Textarea
                      value={props.reviewReason}
                      onChange={(event) => props.onReviewReasonChange(event.target.value)}
                      rows={4}
                      className="w-full border-amber-700/50 bg-slate-950 text-slate-100"
                    />
                  </label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={props.onApprove}
                      disabled={Boolean(props.busyLabel)}
                      loading={props.busyLabel === "approve"}
                      className="border-emerald-700/50 bg-emerald-950/40 text-emerald-100 hover:border-emerald-500"
                    >
                      {props.busyLabel === "approve" ? "Approving..." : "Approve Flagged Trade"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={props.onReject}
                      disabled={Boolean(props.busyLabel)}
                      loading={props.busyLabel === "reject"}
                      className="border-rose-700/50 bg-rose-950/30 text-rose-100 hover:border-rose-500"
                    >
                      {props.busyLabel === "reject" ? "Rejecting..." : "Reject Flagged Trade"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {props.detail.permissions.canProcess ? (
                <button
                  type="button"
                  onClick={props.onProcess}
                  disabled={Boolean(props.busyLabel)}
                  className="w-full rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-2 text-sm font-medium text-sky-100 hover:border-sky-500 disabled:opacity-60"
                >
                  {props.busyLabel === "process" ? "Settling..." : "Settle Trade Now"}
                </button>
              ) : null}

              {!props.detail.permissions.canEditDraft &&
              !props.detail.permissions.canSubmit &&
              !props.detail.permissions.canAccept &&
              !props.detail.permissions.canDecline &&
              !props.detail.permissions.canCommissionerReview &&
              !props.detail.permissions.canProcess ? (
                <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-400">
                  This trade is view-only for the current role or has already moved past the active decision step.
                </p>
              ) : null}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
