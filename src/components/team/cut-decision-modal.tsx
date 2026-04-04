"use client";

import { Fragment, useState } from "react";
import { Button, LoadingSpinner } from "@/components/ui";
import type { ContractImpactPreview, TeamCapDetailProjection } from "@/types/detail";

interface CutDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: TeamCapDetailProjection["contracts"][number] | null;
  preview: ContractImpactPreview | null;
  previewLoadingLabel: string | null;
  previewError: string | null;
  onPreviewCut?: (playerId: string) => void;
  onConfirmCut?: (playerId: string) => Promise<void>;
  testId?: string;
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }
  return `$${value.toLocaleString()}`;
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ComplianceIcon({ status }: { status: "ok" | "warning" | "error" }) {
  switch (status) {
    case "ok":
      return (
        <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case "warning":
      return (
        <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
    case "error":
      return (
        <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
  }
}

function ImpactRow({ label, before, after, delta, format = "number" }: {
  label: string;
  before: number;
  after: number;
  delta: number;
  format?: "number" | "money";
}) {
  const formatValue = format === "money" ? formatMoney : (val: number) => val.toString();
  const deltaColor = delta > 0 ? "text-red-400" : delta < 0 ? "text-green-400" : "text-slate-400";
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800 last:border-b-0">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-3 text-sm font-mono">
        <span className="text-slate-400">{formatValue(before)}</span>
        <span className="text-slate-600">→</span>
        <span className="text-slate-200">{formatValue(after)}</span>
        <span className={`${deltaColor} min-w-[4rem] text-right`}>
          {delta !== 0 ? `${deltaSign}${formatValue(delta)}` : "—"}
        </span>
      </div>
    </div>
  );
}

export function CutDecisionModal({
  isOpen,
  onClose,
  contract,
  preview,
  previewLoadingLabel,
  previewError,
  onPreviewCut,
  onConfirmCut,
  testId
}: CutDecisionModalProps) {
  const [confirmStep, setConfirmStep] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [cutSuccess, setCutSuccess] = useState(false);
  const [cutError, setCutError] = useState<string | null>(null);

  function handleClose() {
    setConfirmStep(false);
    setCutting(false);
    setCutSuccess(false);
    setCutError(null);
    onClose();
  }

  async function handleExecuteCut() {
    if (!contract || !onConfirmCut) return;
    setCutting(true);
    setCutError(null);
    try {
      await onConfirmCut(contract.player.id);
      setCutSuccess(true);
      setConfirmStep(false);
      setTimeout(() => handleClose(), 2000);
    } catch (err) {
      setCutError(err instanceof Error ? err.message : "Cut failed. Please try again.");
    } finally {
      setCutting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <Fragment>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
        data-testid="cut-modal-backdrop"
      />
      
      {/* Modal Container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        {/* Modal */}
        <div
          className="relative bg-slate-950 rounded-xl border border-slate-700 shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          data-testid={testId}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-700 bg-slate-900/50">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Cut Decision Workspace</h2>
              <p className="text-sm text-slate-400 mt-1">Preview impact before releasing player</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              data-testid="cut-modal-close"
              aria-label="Close"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {contract ? (
              <div className="px-8 py-6 space-y-8">
                {/* Player Identity & Contract Summary - Side by side */}
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Player Identity */}
                  <section>
                    <h3 className="text-lg font-semibold text-slate-100 mb-4">Player Information</h3>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5">
                      <h4 className="text-xl font-semibold text-slate-100">{contract.player.name}</h4>
                      <div className="mt-2 flex items-center gap-3 text-slate-300">
                        <span className="font-medium">{contract.player.position}</span>
                        <span>•</span>
                        <span>{contract.player.nflTeam ?? "Free Agent"}</span>
                      </div>
                    </div>
                  </section>

                  {/* Contract Summary */}
                  <section>
                    <h3 className="text-lg font-semibold text-slate-100 mb-4">Contract Summary</h3>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-300">Salary</span>
                        <span className="text-sm font-mono font-medium text-slate-200">{formatMoney(contract.salary)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-300">Years Remaining</span>
                        <span className="text-sm font-mono font-medium text-slate-200">
                          {contract.yearsRemaining} of {contract.yearsTotal}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-300">Contract Status</span>
                        <div className="flex gap-2">
                          <span className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200">
                            {formatEnumLabel(contract.status)}
                          </span>
                          {contract.isFranchiseTag && (
                            <span className="rounded border border-amber-600 bg-amber-950 px-2 py-1 text-xs text-amber-200">
                              Tagged
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Preview Content */}
                {previewLoadingLabel && (
                  <section>
                    <h3 className="text-lg font-semibold text-slate-100 mb-4">Impact Analysis</h3>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 flex items-center justify-center gap-3">
                      <LoadingSpinner size="md" />
                      <span className="text-slate-300">{previewLoadingLabel}</span>
                    </div>
                  </section>
                )}

                {previewError && (
                  <section>
                    <h3 className="text-lg font-semibold text-slate-100 mb-4">Impact Analysis</h3>
                    <div className="rounded-lg border border-red-700/50 bg-red-950/20 p-6">
                      <div className="flex items-start gap-4">
                        <svg className="h-6 w-6 text-red-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-base font-medium text-red-200">Preview Failed</p>
                          <p className="text-red-300 mt-2">{previewError}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {preview && (
                  <Fragment>
                    {/* Impact Summary */}
                    <section>
                      <h3 className="text-lg font-semibold text-slate-100 mb-4">Before & After Impact</h3>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6">
                        <ImpactRow 
                          label="Roster Count"
                          before={preview.before.rosterCount}
                          after={preview.after.rosterCount}
                          delta={preview.delta.rosterCount}
                        />
                        <ImpactRow 
                          label="Active Cap"
                          before={preview.before.activeCapTotal}
                          after={preview.after.activeCapTotal}
                          delta={preview.delta.activeCapTotal}
                          format="money"
                        />
                        <ImpactRow 
                          label="Dead Cap"
                          before={preview.before.deadCapTotal}
                          after={preview.after.deadCapTotal}
                          delta={preview.delta.deadCapTotal}
                          format="money"
                        />
                        <ImpactRow 
                          label="Total Cap Hit"
                          before={preview.before.hardCapTotal}
                          after={preview.after.hardCapTotal}
                          delta={preview.delta.hardCapTotal}
                          format="money"
                        />
                      </div>
                    </section>

                    {/* Compliance Impact */}
                    <section>
                      <h3 className="text-lg font-semibold text-slate-100 mb-4">Compliance Impact</h3>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6">
                        <div className="flex items-center justify-between py-3">
                          <span className="text-slate-300">Rule Compliance Status</span>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <ComplianceIcon status={preview.before.complianceStatus} />
                              <span className="text-sm text-slate-400">Before</span>
                            </div>
                            <span className="text-slate-600">→</span>
                            <div className="flex items-center gap-2">
                              <ComplianceIcon status={preview.after.complianceStatus} />
                              <span className="text-sm text-slate-200">After</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Warnings and Guidance */}
                    {preview.introducedFindings.length > 0 && (
                      <section>
                        <h3 className="text-lg font-semibold text-slate-100 mb-4">Warnings & Guidance</h3>
                        <div className="space-y-4">
                          {preview.introducedFindings.map((finding, index) => (
                            <div 
                              key={index}
                              className={`rounded-lg border p-5 ${
                                finding.severity === "error"
                                  ? "border-red-700/50 bg-red-950/20"
                                  : "border-amber-700/50 bg-amber-950/20"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {finding.severity === "error" ? (
                                  <svg className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <svg className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                  </svg>
                                )}
                                <div className="min-w-0">
                                  <p className={`font-medium ${
                                    finding.severity === "error" ? "text-red-200" : "text-amber-200"
                                  }`}>
                                    {finding.ruleCode}
                                  </p>
                                  <p className={`mt-2 ${
                                    finding.severity === "error" ? "text-red-300" : "text-amber-300"
                                  }`}>
                                    {finding.message}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Dead Cap Details */}
                    {preview.details.currentSeasonDeadCapCharge && preview.details.currentSeasonDeadCapCharge > 0 && (
                      <section>
                        <h3 className="text-lg font-semibold text-slate-100 mb-4">Dead Cap Impact</h3>
                        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6">
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-slate-300">Current Season Charge</span>
                            <span className="text-lg font-mono font-medium text-slate-200">
                              {formatMoney(preview.details.currentSeasonDeadCapCharge)}
                            </span>
                          </div>
                          {preview.details.deadCapSchedule && preview.details.deadCapSchedule.length > 1 && (
                            <div className="pt-4 border-t border-slate-800">
                              <p className="text-sm text-slate-400 mb-3">Future Impact Schedule:</p>
                              <div className="space-y-2">
                                {preview.details.deadCapSchedule.slice(1).map((schedule, index) => (
                                  <div key={index} className="flex justify-between text-sm">
                                    <span className="text-slate-400">
                                      Year +{schedule.seasonOffset}
                                    </span>
                                    <span className="font-mono text-slate-300">
                                      {formatMoney(schedule.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </Fragment>
                )}
              </div>
            ) : (
              <div className="px-8 py-16 text-center">
                <p className="text-slate-400">No player selected for cut analysis.</p>
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 px-8 py-6 border-t border-slate-700 bg-slate-900/95">
            {/* Success state */}
            {cutSuccess && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
                <svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><span className="font-medium">{contract?.player.name}</span> has been cut. Cap space and roster updated.</span>
              </div>
            )}

            {/* Cut error */}
            {cutError && !cutSuccess && (
              <div className="mb-3 rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {cutError}
              </div>
            )}

            {/* Confirm step */}
            {confirmStep && !cutSuccess && (
              <div className="space-y-3">
                <div className="rounded-lg border border-red-700/50 bg-red-950/20 px-4 py-3 text-sm text-red-100">
                  <p className="font-semibold">Confirm: Cut {contract?.player.name}?</p>
                  <p className="mt-1 text-red-300">This cannot be undone. The player will be immediately released and dead cap applied.</p>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => { setConfirmStep(false); setCutError(null); }} disabled={cutting}>
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleExecuteCut} loading={cutting} disabled={cutting}>
                    {cutting ? "Cutting..." : "Yes, Cut Player"}
                  </Button>
                </div>
              </div>
            )}

            {/* Normal state */}
            {contract && preview && !confirmStep && !cutSuccess && (
              <div className="flex items-center justify-between gap-6">
                <div className={`text-sm ${preview.legal ? "text-slate-300" : "text-red-400"}`}>
                  {preview.legal ? (
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Cut operation is allowed
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Blocked: {preview.blockedReason}
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={handleClose}>
                    Close
                  </Button>
                  {preview.legal && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setConfirmStep(true)}
                    >
                      Proceed with Cut
                    </Button>
                  )}
                </div>
              </div>
            )}

            {contract && (previewLoadingLabel || previewError) && (
              <div className="flex items-center justify-between gap-6">
                <div className="text-sm text-slate-400">
                  {previewLoadingLabel ? "Loading impact analysis..." : "Preview failed to load"}
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleClose}
                  >
                    Close
                  </Button>
                  {previewError && onPreviewCut && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onPreviewCut(contract.player.id)}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            )}

            {!contract && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Fragment>
  );
}