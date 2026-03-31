"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export type WeeklyWorkflowItem = {
  id: string;
  title: string;
  description: string;
  href?: string;
  ctaLabel?: string;
};

export type StepValidation = {
  /** System automatically marks this step complete when true */
  validated: boolean;
  /** System blocks manual completion when true */
  blocked: boolean;
  /** Human-readable reason shown in the UI */
  reason: string;
};

type Props = {
  items: WeeklyWorkflowItem[];
  checkedIds: Record<string, boolean>;
  onToggle: (id: string) => void;
  onRunComplianceScan: () => void;
  busyAction: string | null;
  weekBucket: string;
  /** Per-step system validation derived from live data */
  systemValidation?: Record<string, StepValidation>;
  testId?: string;
};

export function WeeklyWorkflowChecklist(props: Props) {
  const { items, checkedIds, onToggle, onRunComplianceScan, busyAction, weekBucket, systemValidation } = props;

  // Effective completion: system-validated overrides to true, system-blocked overrides to false
  const effectiveCheckedIds: Record<string, boolean> = {};
  for (const item of items) {
    const sv = systemValidation?.[item.id];
    if (sv?.blocked) {
      effectiveCheckedIds[item.id] = false;
    } else if (sv?.validated) {
      effectiveCheckedIds[item.id] = true;
    } else {
      effectiveCheckedIds[item.id] = Boolean(checkedIds[item.id]);
    }
  }

  const completedCount = items.filter(item => effectiveCheckedIds[item.id]).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isAllDone = completedCount === totalCount;

  const nextItem = items.find(item => !effectiveCheckedIds[item.id]) ?? null;

  return (
    <div
      className="rounded-xl border border-slate-700/60 bg-slate-900/50"
      data-testid={props.testId}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Required Weekly Actions
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-100">
            {isAllDone ? "All steps complete" : `${completedCount} of ${totalCount} steps complete`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{weekBucket}</span>
          {isAllDone ? (
            <span className="rounded-full bg-emerald-800/70 px-3 py-1 text-xs font-semibold text-emerald-200">
              Done
            </span>
          ) : (
            <span
              className="rounded-full bg-sky-900/60 px-3 py-1 text-xs font-semibold text-sky-200"
              data-testid="commissioner-weekly-checklist-progress"
            >
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${
              isAllDone ? "bg-emerald-500" : "bg-sky-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* All done state */}
      {isAllDone ? (
        <div className="px-4 pb-4 pt-3">
          <div className="flex items-center gap-3 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700/70">
              <svg className="h-4 w-4 text-emerald-200" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-200">Weekly workflow complete</p>
              <p className="text-xs text-emerald-400">All {totalCount} steps done. Ready for next week.</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Next Required Action — only when incomplete steps exist */}
      {!isAllDone && nextItem && (
        <div className="px-4 pt-3">
          <div
            className="rounded-lg border border-sky-600/50 bg-sky-950/30 p-4"
            data-testid="commissioner-workflow-next-action"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-sky-700 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Next
              </span>
              <p className="text-sm font-semibold text-sky-100">{nextItem.title}</p>
            </div>
            <p className="mt-1.5 text-xs text-sky-300">{nextItem.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StepAction
                item={nextItem}
                onRunComplianceScan={onRunComplianceScan}
                busyAction={busyAction}
                variant="primary"
              />
              {(() => {
                const sv = systemValidation?.[nextItem.id];
                if (sv?.blocked) {
                  return (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/50 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-500">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                      </svg>
                      {sv.reason}
                    </span>
                  );
                }
                if (sv?.validated) {
                  return null;
                }
                return (
                  <button
                    type="button"
                    onClick={() => onToggle(nextItem.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-700/50 bg-sky-900/40 px-3 py-1.5 text-xs font-medium text-sky-200 hover:border-sky-600 hover:text-sky-100"
                    data-testid={`commissioner-weekly-checklist-toggle-${nextItem.id}`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Confirm reviewed
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Step list */}
      <ol className="space-y-1 px-4 pb-4 pt-3">
        {items.map((item, index) => {
          const sv = systemValidation?.[item.id];
          const isSystemValidated = sv?.validated === true;
          const isSystemBlocked = sv?.blocked === true;
          const isComplete = effectiveCheckedIds[item.id] === true;
          const isCurrent = !isAllDone && item.id === nextItem?.id;
          const isSystemManaged = isSystemValidated || isSystemBlocked;

          return (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                isComplete
                  ? "border-emerald-800/30 bg-emerald-950/10 opacity-60"
                  : isSystemBlocked
                    ? "border-amber-800/30 bg-amber-950/10"
                    : isCurrent
                      ? "border-sky-700/40 bg-sky-950/20"
                      : "border-slate-800/60 bg-slate-950/20"
              }`}
              data-testid={`commissioner-weekly-checklist-item-${item.id}`}
            >
              {/* Step number / check indicator */}
              <button
                type="button"
                onClick={isSystemManaged ? undefined : () => onToggle(item.id)}
                disabled={isSystemManaged}
                aria-label={isComplete ? `Step ${index + 1} complete` : `Mark step ${index + 1} complete`}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isComplete
                    ? "border-emerald-600 bg-emerald-700/60 text-emerald-200 cursor-default"
                    : isSystemBlocked
                      ? "border-amber-700/50 bg-amber-950/30 text-amber-500 cursor-not-allowed"
                      : isCurrent
                        ? "border-sky-600 bg-sky-900/40 text-sky-400 hover:bg-sky-800/40"
                        : "border-slate-700 bg-slate-900/40 text-slate-500 hover:border-slate-600"
                }`}
                data-testid={`commissioner-weekly-checklist-toggle-${item.id}`}
              >
                {isComplete ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : isSystemBlocked ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                  </svg>
                ) : (
                  <span className="text-[9px] font-bold">{index + 1}</span>
                )}
              </button>

              {/* Step text */}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs font-medium leading-snug ${
                    isComplete
                      ? "text-slate-400 line-through decoration-slate-600"
                      : isSystemBlocked
                        ? "text-amber-200"
                        : isCurrent
                          ? "text-sky-100"
                          : "text-slate-300"
                  }`}
                  data-testid="commissioner-weekly-checklist-item-title"
                >
                  {item.title}
                </p>
                {isSystemBlocked && sv?.reason && (
                  <p className="mt-0.5 text-[10px] text-amber-500">{sv.reason}</p>
                )}
              </div>

              {/* Step action — visible for incomplete steps except the "next" one (shown in hero) */}
              {!isComplete && !isCurrent && (
                <div className="shrink-0">
                  <StepAction
                    item={item}
                    onRunComplianceScan={onRunComplianceScan}
                    busyAction={busyAction}
                    variant="compact"
                  />
                </div>
              )}

              {/* Status badge for complete steps */}
              {isComplete && (
                <span
                  className="shrink-0 rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
                  data-testid={`commissioner-weekly-checklist-status-${item.id}`}
                >
                  {isSystemValidated ? "Verified" : "Done"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Renders the appropriate inline action for a step
function StepAction(props: {
  item: WeeklyWorkflowItem;
  onRunComplianceScan: () => void;
  busyAction: string | null;
  variant: "primary" | "compact";
}) {
  const { item, onRunComplianceScan, busyAction, variant } = props;

  if (item.id === "compliance-scan") {
    return variant === "primary" ? (
      <Button
        type="button"
        onClick={onRunComplianceScan}
        disabled={busyAction !== null}
        variant="primary"
        size="sm"
        data-testid="workflow-compliance-scan-button"
      >
        {busyAction === "compliance" ? "Scanning..." : "Run Scan"}
      </Button>
    ) : (
      <button
        type="button"
        onClick={onRunComplianceScan}
        disabled={busyAction !== null}
        className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-600 disabled:opacity-50"
        data-testid="workflow-compliance-scan-button-compact"
      >
        {busyAction === "compliance" ? "Scanning..." : "Run Scan"}
      </button>
    );
  }

  if (item.href) {
    const baseClass =
      variant === "primary"
        ? "inline-flex items-center rounded-md border border-sky-700/60 bg-sky-900/30 px-3 py-1.5 text-xs font-medium text-sky-200 hover:border-sky-600 hover:text-sky-100"
        : "inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600";

    return (
      <Link href={item.href} className={baseClass}>
        {item.ctaLabel ?? "Open"} →
      </Link>
    );
  }

  return null;
}
