"use client";

import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { CompactEmptyState } from "@/components/layout/canonical-route-state";
import type { ContractImpactPreview } from "@/types/detail";

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toLocaleString()}`;
}

function signedValue(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

export function ImpactPreviewPanel(props: {
  preview: ContractImpactPreview | null;
  loadingLabel?: string | null;
  error: string | null;
  emptyMessage: string;
  selectedPlayerName?: string | null;
  testId?: string;
}) {
  const title = props.selectedPlayerName ? `${props.selectedPlayerName} Impact Analysis` : "Impact Preview";
  const eyebrow = props.selectedPlayerName ? "Selected Contract Analysis" : "Read-only";
  
  return (
    <DashboardCard
      title={title}
      eyebrow={eyebrow}
      description="Preview financial and compliance impact before any mutating action."
      testId={props.testId}
    >
      {props.loadingLabel ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          {props.loadingLabel}. Existing contract data remains unchanged while the preview is calculated.
        </div>
      ) : null}

      {props.error ? (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Preview data could not load. {props.error} Existing contract and roster records are unchanged.
        </div>
      ) : null}

      {!props.loadingLabel && !props.error && !props.preview ? (
        <CompactEmptyState message={props.emptyMessage} testId={props.testId ? `${props.testId}-empty` : undefined} />
      ) : null}

      {props.preview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {props.preview.action.replace("_", " ")}
              </p>
              <h4 className="mt-1 text-base font-semibold text-slate-100">
                {props.preview.target.player.name}
              </h4>
              <p className="text-sm text-slate-400">
                {props.preview.target.team.name} · {props.preview.target.player.position}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                props.preview.legal
                  ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-100"
                  : "border-red-700/50 bg-red-950/40 text-red-100"
              }`}
            >
              {props.preview.legal ? "Legal" : "Blocked"}
            </span>
          </div>

          {props.preview.blockedReason ? (
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
              {props.preview.blockedReason}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h5 className="text-sm font-semibold text-slate-100">Before</h5>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Roster</dt>
                  <dd className="mt-1 font-medium text-slate-100">{props.preview.before.rosterCount}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Compliance</dt>
                  <dd className="mt-1 font-medium text-slate-100">
                    {props.preview.before.complianceStatus.toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Active Cap</dt>
                  <dd className="mt-1 font-medium text-slate-100">{formatMoney(props.preview.before.activeCapTotal)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Dead Cap</dt>
                  <dd className="mt-1 font-medium text-slate-100">{formatMoney(props.preview.before.deadCapTotal)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Hard Cap</dt>
                  <dd className="mt-1 font-medium text-slate-100">{formatMoney(props.preview.before.hardCapTotal)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h5 className="text-sm font-semibold text-slate-100">After</h5>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Roster</dt>
                  <dd className="mt-1 font-medium text-slate-100">
                    {props.preview.after.rosterCount} ({signedValue(props.preview.delta.rosterCount)})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Compliance</dt>
                  <dd className="mt-1 font-medium text-slate-100">
                    {props.preview.after.complianceStatus.toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Active Cap</dt>
                  <dd className="mt-1 font-medium text-slate-100">
                    {formatMoney(props.preview.after.activeCapTotal)} ({signedValue(props.preview.delta.activeCapTotal)})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Dead Cap</dt>
                  <dd className="mt-1 font-medium text-slate-100">
                    {formatMoney(props.preview.after.deadCapTotal)} ({signedValue(props.preview.delta.deadCapTotal)})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Hard Cap</dt>
                  <dd className="mt-1 font-medium text-slate-100">
                    {formatMoney(props.preview.after.hardCapTotal)} ({signedValue(props.preview.delta.hardCapTotal)})
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {props.preview.details.franchiseTag ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h5 className="text-sm font-semibold text-slate-100">Franchise Tag</h5>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Prior Salary</dt>
                  <dd className="mt-1 font-medium text-slate-100">{formatMoney(props.preview.details.franchiseTag.priorSalary)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Final Tag Salary</dt>
                  <dd className="mt-1 font-medium text-slate-100">{formatMoney(props.preview.details.franchiseTag.finalTagSalary)}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {props.preview.details.rookieOption ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h5 className="text-sm font-semibold text-slate-100">Rookie Option</h5>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <dt className="text-slate-500">Years Added</dt>
                  <dd className="mt-1 font-medium text-slate-100">{props.preview.details.rookieOption.yearsToAdd}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Next Total</dt>
                  <dd className="mt-1 font-medium text-slate-100">{props.preview.details.rookieOption.nextYearsTotal}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Next Remaining</dt>
                  <dd className="mt-1 font-medium text-slate-100">{props.preview.details.rookieOption.nextYearsRemaining}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {props.preview.details.deadCapSchedule?.length ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h5 className="text-sm font-semibold text-slate-100">Dead Cap Schedule</h5>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {props.preview.details.deadCapSchedule.map((entry) => (
                  <li key={`${entry.seasonOffset}-${entry.seasonYear ?? "unknown"}`} className="flex items-center justify-between gap-3">
                    <span>Season {entry.seasonYear ?? "Unavailable"}</span>
                    <span className="font-medium text-slate-100">{formatMoney(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {props.preview.introducedFindings.length > 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h5 className="text-sm font-semibold text-slate-100">Introduced Findings</h5>
              <ul className="mt-3 space-y-2 text-sm">
                {props.preview.introducedFindings.map((finding, index) => (
                  <li
                    key={`${finding.ruleCode}-${index}`}
                    className={`rounded-md border px-3 py-2 ${
                      finding.severity === "error"
                        ? "border-red-700/50 bg-red-950/30 text-red-100"
                        : "border-amber-700/40 bg-amber-950/20 text-amber-100"
                    }`}
                  >
                    <p className="font-medium">{finding.ruleCode}</p>
                    <p className="mt-1">{finding.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </DashboardCard>
  );
}
