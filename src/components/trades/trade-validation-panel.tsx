"use client";

import { TradeStatusBadge } from "@/components/trades/trade-status-badge";
import { formatEnumLabel } from "@/lib/format-label";
import type { TradeProposalDetailResponse } from "@/types/trade-workflow";

type TradeEvaluation = NonNullable<TradeProposalDetailResponse["currentEvaluation"]>;
type TradeStatus = TradeProposalDetailResponse["proposal"]["status"];

function outcomeTone(outcome: string) {
  if (outcome === "FAIL_HARD_BLOCK") {
    return "border-rose-700/50 bg-rose-950/30 text-rose-100";
  }
  if (outcome === "FAIL_REQUIRES_COMMISSIONER" || outcome === "PASS_WITH_WARNING") {
    return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  }
  return "border-emerald-700/50 bg-emerald-950/30 text-emerald-100";
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

function buildSubmissionGuidance(
  evaluation: TradeEvaluation | null,
  status: TradeStatus,
  showSubmissionGuidance: boolean
) {
  if (!showSubmissionGuidance) {
    return null;
  }

  if (!evaluation) {
    return "Run Trade Validation to generate findings and post-trade impact before submission.";
  }

  if (evaluation.outcome === "FAIL_HARD_BLOCK") {
    return "Current hard-block findings should be resolved before you try to submit this proposal.";
  }

  if (evaluation.outcome === "FAIL_REQUIRES_COMMISSIONER") {
    return "This package can still be submitted, but it will route to commissioner review because validation flagged it.";
  }

  return "The latest validation snapshot is available. Submit when the package is ready to send.";
}

export function TradeValidationPanel(props: {
  evaluation: TradeEvaluation | null;
  status: TradeStatus;
  isStale?: boolean;
  showSubmissionGuidance?: boolean;
  compact?: boolean;
  testId?: string;
}) {
  const isStale = Boolean(props.isStale && props.evaluation);
  const submissionGuidance = buildSubmissionGuidance(
    props.evaluation,
    props.status,
    props.showSubmissionGuidance ?? false
  );

  return (
    <div
      className="space-y-4"
      data-testid={props.testId || "trade-validation-panel"}
    >
      {/* Validation Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={`font-semibold text-slate-100 ${props.compact ? 'text-base' : 'text-lg'}`}>
            Trade Validation
          </h3>
          <p className="text-xs text-slate-400">
            Policy findings and decision status
          </p>
        </div>
        {props.evaluation && (
          <div className="flex items-center gap-2">
            <TradeStatusBadge status={props.status} />
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
              isStale
                ? "border-amber-600/50 bg-amber-900/40 text-amber-300"
                : outcomeTone(props.evaluation.outcome)
            }`}>
              {isStale ? "Stale" : formatEnumLabel(props.evaluation.outcome)}
            </span>
          </div>
        )}
      </div>

      {/* Stale Banner */}
      {isStale && (
        <div className="rounded-lg border border-amber-600/50 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">
          <span className="font-semibold">Package changed</span> — these findings reflect the previous version.
          Save your changes and re-validate before submitting.
        </div>
      )}

      {/* Validation Content */}
      {!props.evaluation ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/30 px-4 py-6 text-center">
          <p className="text-sm text-slate-400 font-medium mb-2">
            No Validation Available
          </p>
          <p className="text-xs text-slate-500">
            Run Trade Validation to capture policy findings, blockers, and decision status.
          </p>
        </div>
      ) : (
        <div className={`space-y-3 ${isStale ? "opacity-40" : ""}`}>
          {/* Remediation Context */}
          {props.evaluation.remediation?.reasons.length ? (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-700/30 text-amber-100">
                  Review Required
                </span>
              </div>
              <p className="text-sm text-amber-100">
                {props.evaluation.remediation.reasons.join(" ")}
              </p>
            </div>
          ) : null}

          {/* Findings */}
          <div className="space-y-2">
            {props.evaluation.findings.length > 0 ? (
              props.evaluation.findings.map((finding) => (
                <div
                  key={`${finding.code}:${finding.message}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${findingTone(finding.category)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{finding.code}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-slate-700/50 text-slate-300">
                      {formatEnumLabel(finding.category)}
                    </span>
                  </div>
                  <p className="mt-1">{finding.message}</p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-700/30 text-emerald-100">
                    Clean
                  </span>
                  <span className="font-medium">No Validation Findings</span>
                </div>
                <p className="mt-1">This proposal passed all policy checks without issues.</p>
              </div>
            )}
          </div>

          {/* Submission Guidance */}
          {submissionGuidance && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-3">
              <p className="text-sm text-slate-300">
                <span className="font-medium text-slate-200">Next Steps: </span>
                {submissionGuidance}
              </p>
            </div>
          )}

          {/* Hard Block Warning */}
          {props.evaluation.outcome === "FAIL_HARD_BLOCK" && props.showSubmissionGuidance && (
            <div className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-rose-700/50 text-rose-100">
                  Blocked
                </span>
              </div>
              <p className="text-sm text-rose-100">
                Submission is blocked until the hard-block findings above are addressed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}