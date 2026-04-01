"use client";

import Link from "next/link";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { TradeProposalCanvas } from "@/components/trades/trade-proposal-canvas";
import { TradeValidationPanel } from "@/components/trades/trade-validation-panel";
import { TradeImpactSummary } from "@/components/trades/trade-impact-summary";
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

function formatTradeOutcomeLabel(
  outcome: TradeProposalDetailResponse["evaluationHistory"][number]["outcome"] | null | undefined,
) {
  if (outcome === "FAIL_HARD_BLOCK") return "Blocked";
  if (outcome === "FAIL_REQUIRES_COMMISSIONER") return "Needs commissioner review";
  if (outcome === "PASS_WITH_WARNING") return "Ready with warnings";
  if (outcome === "PASS") return "Ready";
  return "Not reviewed yet";
}

type EvaluationTrigger = TradeProposalDetailResponse["evaluationHistory"][number]["trigger"];

function triggerCategory(trigger: EvaluationTrigger): "validation" | "decision" {
  return trigger === "BUILDER_VALIDATE" || trigger === "SUBMIT" ? "validation" : "decision";
}

function triggerLabel(trigger: EvaluationTrigger): string {
  if (trigger === "BUILDER_VALIDATE") return "Package check";
  if (trigger === "SUBMIT") return "Submission check";
  if (trigger === "COUNTERPARTY_RESPONSE") return "Counterparty response";
  if (trigger === "COMMISSIONER_REVIEW") return "Commissioner decision";
  return formatEnumLabel(trigger);
}

type EvaluationOutcome = TradeProposalDetailResponse["evaluationHistory"][number]["outcome"];

function outcomeColor(outcome: EvaluationOutcome): string {
  if (outcome === "FAIL_HARD_BLOCK") return "text-rose-400";
  if (outcome === "FAIL_REQUIRES_COMMISSIONER") return "text-amber-400";
  if (outcome === "PASS_WITH_WARNING") return "text-amber-300";
  if (outcome === "PASS") return "text-emerald-400";
  return "text-slate-400";
}

function buildDecisionState(detail: TradeProposalDetailResponse) {
  const current = detail.currentEvaluation;
  
  if (!current) {
    return {
      status: "No evaluation",
      description: "This proposal has not been validated yet.",
      tone: "neutral" as const
    };
  }

  switch (current.outcome) {
    case "FAIL_HARD_BLOCK":
      return {
        status: "Blocked",
        description: `${current.findings.length} blocking finding${current.findings.length !== 1 ? 's' : ''} prevent submission.`,
        tone: "error" as const
      };
    case "FAIL_REQUIRES_COMMISSIONER":
      return {
        status: "Requires Review",
        description: "This proposal needs commissioner approval before proceeding.",
        tone: "warning" as const
      };
    case "PASS_WITH_WARNING":
      return {
        status: "Ready with Warnings",
        description: `${current.findings.length} warning${current.findings.length !== 1 ? 's' : ''} noted, but proposal can proceed.`,
        tone: "warning" as const
      };
    case "PASS":
      return {
        status: "Ready",
        description: "This proposal passed all validation checks.",
        tone: "success" as const
      };
    default:
      return {
        status: "Unknown",
        description: "Validation status is unclear.",
        tone: "neutral" as const
      };
  }
}

function buildViewOnlyNote(detail: TradeProposalDetailResponse): string {
  switch (detail.proposal.status) {
    case "DECLINED":
      return "This proposal was declined. The package and evaluation record are preserved for reference.";
    case "PROCESSED":
      return "This trade has been settled and roster and cap changes applied.";
    case "REVIEW_REJECTED":
      return "This proposal was rejected during commissioner review and will not proceed.";
    case "SUBMITTED":
      return "This proposal has been submitted. Awaiting response from the counterparty.";
    case "ACCEPTED":
      return "This trade was accepted and is pending settlement by the commissioner.";
    case "REVIEW_APPROVED":
      return "Commissioner review is complete. Awaiting settlement.";
    default:
      return "No action is available for your current role on this proposal.";
  }
}

function buildActionGuidance(detail: TradeProposalDetailResponse) {
  if (detail.permissions.canProcess) {
    return "Accepted and approved — ready to settle. Applying settlement will update rosters and cap immediately.";
  }
  if (detail.permissions.canCommissionerReview) {
    return "This proposal was flagged during submission. Review the findings and decide whether to approve or reject.";
  }
  if (detail.permissions.canAccept || detail.permissions.canDecline) {
    return "This trade has been proposed to your team. Review the package and respond.";
  }
  if (detail.permissions.canSubmit) {
    if (detail.currentEvaluation?.outcome === "FAIL_HARD_BLOCK") {
      return "This draft is blocked. Reopen the Trade Builder to resolve findings before submitting.";
    }
    return "This draft is validated and ready to submit to the counterparty.";
  }
  if (detail.permissions.canEditDraft) {
    return "This draft can still be edited in the Trade Builder.";
  }
  return buildViewOnlyNote(detail);
}

function buildSubmitActionState(detail: TradeProposalDetailResponse) {
  if (!detail.permissions.canSubmit) {
    return null;
  }

  if (detail.currentEvaluation?.outcome === "FAIL_HARD_BLOCK") {
    return { blocked: true, buttonLabel: "Submit Trade Proposal" };
  }

  if (detail.currentEvaluation?.outcome === "FAIL_REQUIRES_COMMISSIONER") {
    return { blocked: false, buttonLabel: "Submit for Commissioner Review" };
  }

  return { blocked: false, buttonLabel: "Submit Trade Proposal" };
}

export function TradeReviewWorkspace(props: {
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
  
  const decisionState = buildDecisionState(props.detail);
  const actionGuidance = buildActionGuidance(props.detail);
  const submitActionState = buildSubmitActionState(props.detail);

  return (
    <div className="space-y-6" data-testid="trade-review-workspace">
      {/* Page Header with Decision State */}
      <PageHeaderBand
        eyebrow="Trade Review"
        title={`${props.detail.proposal.proposerTeam.name} ↔ ${props.detail.proposal.counterpartyTeam.name}`}
        description={`${decisionState.status} · ${decisionState.description}`}
        aside={<TradeStatusBadge status={props.detail.proposal.status} />}
        titleTestId="trade-review-header"
      />

      {/* Error/Success Messages */}
      {props.error && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {props.error}
        </div>
      )}
      {props.message && (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {props.message}
        </div>
      )}

      {/* Trade Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Status" eyebrow="Workflow state">
          <p className="text-sm font-semibold text-slate-100">
            {formatEnumLabel(props.detail.proposal.status)}
          </p>
        </DashboardCard>
        <DashboardCard title="Decision" eyebrow="Current evaluation">
          <p className={`text-sm font-semibold ${
            decisionState.tone === "error" ? "text-rose-400" :
            decisionState.tone === "warning" ? "text-amber-400" :
            decisionState.tone === "success" ? "text-emerald-400" : "text-slate-300"
          }`}>
            {decisionState.status}
          </p>
        </DashboardCard>
        <DashboardCard title="Submitted" eyebrow="Timeline">
          <p className="text-sm font-medium text-slate-100">
            {formatDateTime(props.detail.proposal.submittedAt)}
          </p>
        </DashboardCard>
        <DashboardCard title="Next Action" eyebrow="Available">
          <p className="text-sm font-medium text-slate-100">
            {props.detail.permissions.canProcess ? "Settle trade" :
             props.detail.permissions.canAccept ? "Accept or decline" :
             props.detail.permissions.canSubmit ? "Submit to counterparty" :
             props.detail.permissions.canCommissionerReview ? "Commissioner review" :
             props.detail.permissions.canEditDraft ? "Edit draft" :
             props.detail.proposal.status === "DECLINED" ? "Closed — declined" :
             props.detail.proposal.status === "PROCESSED" ? "Settled" :
             props.detail.proposal.status === "SUBMITTED" ? "Awaiting response" :
             props.detail.proposal.status === "REVIEW_REJECTED" ? "Closed — rejected" :
             "View only"}
          </p>
        </DashboardCard>
      </div>

      {/* Main Content: Proposal-Centric Layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.6fr)]">
        {/* Primary Panel: Proposal Canvas */}
        <div className="space-y-6">
          <TradeProposalCanvas
            proposerTeam={props.detail.proposal.proposerTeam}
            counterpartyTeam={props.detail.proposal.counterpartyTeam}
            proposerAssets={proposerAssets}
            counterpartyAssets={counterpartyAssets}
            testId="trade-review-canvas"
          />

          {/* Evaluation History (Secondary Context) */}
          <DashboardCard
            title="Proposal History"
            description="Package checks and lifecycle decisions, most recent first."
            testId="trade-review-history"
          >
            <div className="space-y-2">
              {props.detail.evaluationHistory.map((evaluation) => {
                const category = triggerCategory(evaluation.trigger);
                const isDecision = category === "decision";
                return (
                  <div
                    key={evaluation.id}
                    className={`rounded-lg border px-3 py-3 ${
                      isDecision
                        ? "border-sky-900/60 bg-sky-950/20"
                        : "border-slate-800 bg-slate-900/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-semibold uppercase tracking-widest ${
                            isDecision ? "text-sky-500" : "text-slate-500"
                          }`}>
                            {isDecision ? "Decision" : "Validation"}
                          </span>
                          <span className="text-[10px] text-slate-600">·</span>
                          <span className="text-xs text-slate-400">{triggerLabel(evaluation.trigger)}</span>
                          {evaluation.isSubmissionSnapshot && (
                            <span className="rounded border border-amber-700/40 bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-300">
                              Submission snapshot
                            </span>
                          )}
                          {evaluation.isCurrent && (
                            <span className="rounded border border-emerald-800/50 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] text-emerald-400">
                              Current
                            </span>
                          )}
                        </div>
                        <p className={`text-sm font-medium ${outcomeColor(evaluation.outcome)}`}>
                          {formatTradeOutcomeLabel(evaluation.outcome)}
                        </p>
                        {evaluation.findings.length > 0 ? (
                          <p className="text-xs text-slate-500">
                            {evaluation.findings.length} finding{evaluation.findings.length !== 1 ? "s" : ""}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-600">No findings</p>
                        )}
                        {isDecision && evaluation.createdByUser?.name && (
                          <p className="text-xs text-slate-500">{evaluation.createdByUser.name}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-[11px] text-slate-600">{formatDateTime(evaluation.evaluatedAt)}</p>
                    </div>
                  </div>
                );
              })}
              {props.detail.evaluationHistory.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">No history yet.</p>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Secondary Panel: Decision Context & Actions */}
        <div className="space-y-6 xl:sticky xl:top-6">
          <TradeValidationPanel
            evaluation={props.detail.currentEvaluation}
            status={props.detail.proposal.status}
            compact={true}
            testId="trade-review-validation"
          />

          <TradeImpactSummary
            impact={props.detail.currentEvaluation?.postTradeProjection ?? null}
            compact={true}
            testId="trade-review-impact"
          />

          {/* Available Actions */}
          <DashboardCard
            title="Available Actions"
            description={actionGuidance}
            testId="trade-review-actions"
          >
            <div className="space-y-3">
              {/* Hard Block Warning */}
              {submitActionState?.blocked && (
                <div 
                  className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-3"
                  data-testid="trade-review-blocked-note"
                >
                  <p className="text-sm text-rose-100">
                    <span className="font-medium">Blocked:</span> This proposal cannot be submitted until validation findings are resolved in the Trade Builder.
                  </p>
                </div>
              )}

              {/* Edit Draft */}
              {props.detail.permissions.canEditDraft && (
                <Link
                  href={`/trades/new?proposalId=${props.detail.proposal.id}`}
                  className="block rounded-lg border border-slate-700 px-3 py-2 text-center text-sm font-medium text-slate-100 hover:border-slate-500"
                >
                  Open Draft in Trade Builder
                </Link>
              )}

              {/* Submit */}
              {submitActionState && !submitActionState.blocked && (
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
              )}

              {/* Accept/Decline */}
              {props.detail.permissions.canAccept && (
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
              )}
              {props.detail.permissions.canDecline && (
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
              )}

              {/* Commissioner Review */}
              {props.detail.permissions.canCommissionerReview && (
                <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
                  <label className="block text-sm text-amber-100">
                    <span className="mb-1 block font-medium">Commissioner review reason</span>
                    <Textarea
                      value={props.reviewReason}
                      onChange={(event) => props.onReviewReasonChange(event.target.value)}
                      rows={3}
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
                      {props.busyLabel === "approve" ? "Approving..." : "Approve"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={props.onReject}
                      disabled={Boolean(props.busyLabel)}
                      loading={props.busyLabel === "reject"}
                      className="border-rose-700/50 bg-rose-950/30 text-rose-100 hover:border-rose-500"
                    >
                      {props.busyLabel === "reject" ? "Rejecting..." : "Reject"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Process/Settle */}
              {props.detail.permissions.canProcess && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={props.onProcess}
                  disabled={Boolean(props.busyLabel)}
                  loading={props.busyLabel === "process"}
                  className="w-full justify-center"
                >
                  {props.busyLabel === "process" ? "Settling..." : "Apply Settlement"}
                </Button>
              )}

              {/* No Actions Available */}
              {!props.detail.permissions.canEditDraft &&
               !props.detail.permissions.canSubmit &&
               !props.detail.permissions.canAccept &&
               !props.detail.permissions.canDecline &&
               !props.detail.permissions.canCommissionerReview &&
               !props.detail.permissions.canProcess && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3 text-center">
                  <p className="text-sm text-slate-400">
                    {buildViewOnlyNote(props.detail)}
                  </p>
                </div>
              )}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}