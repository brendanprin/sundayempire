import Link from "next/link";
import { formatEnumLabel } from "@/lib/format-label";
import type { PlayerContractDetailProjection } from "@/types/detail";

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }
  return `$${value.toLocaleString()}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }
  return new Date(value).toLocaleString();
}

function badgeClasses(tone: "neutral" | "warning" | "critical" | "info" = "neutral") {
  if (tone === "critical") {
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)] shadow-[0_0_0_2px_var(--status-critical-ring)] font-semibold";
  }

  if (tone === "warning") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] shadow-[0_0_0_1px_var(--status-warning-ring)] font-medium";
  }

  if (tone === "info") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[0_0_0_1px_var(--status-info-ring)]";
  }

  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]";
}

export function PlayerContractSnapshot(props: {
  detail: PlayerContractDetailProjection;
  testId?: string;
}) {
  const currentContract = props.detail.contract;
  const currentTeam = currentContract?.team ?? props.detail.rosterContext?.team ?? null;
  const deadCapExposureTotal =
    currentContract?.deadCapSchedule.reduce((sum, charge) => sum + charge.effectiveAmount, 0) ?? 0;

  return (
    <div className="shell-panel" data-testid={props.testId}>
      <div className="space-y-4">
        {/* Contract Status Overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-500">Current Team</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {currentTeam ? (
                <Link href={`/teams/${currentTeam.id}`} className="hover:text-sky-300">
                  {currentTeam.name}
                </Link>
              ) : (
                "Unrostered"
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {props.detail.rosterContext
                ? `${props.detail.rosterContext.slotLabel ?? formatEnumLabel(props.detail.rosterContext.slotType)}`
                : "No active roster slot"}
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-500">Contract</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {currentContract ? formatMoney(currentContract.salary) : "No contract"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {currentContract
                ? `${currentContract.yearsRemaining}/${currentContract.yearsTotal} years`
                : "No current-season contract"}
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-500">Compliance</p>
            <p className={`mt-1 text-lg font-semibold ${
              props.detail.complianceSummary.openIssueCount === 0 
                ? "text-green-400" 
                : "text-amber-400"
            }`}>
              {props.detail.complianceSummary.openIssueCount === 0 ? "Clear" : "Issues"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {props.detail.complianceSummary.openIssueCount === 0 
                ? "No blocking issues"
                : `${props.detail.complianceSummary.openIssueCount} items`}
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-500">Dead Cap Risk</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {formatMoney(deadCapExposureTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {currentContract?.deadCapSchedule.length
                ? `${currentContract.deadCapSchedule.length} charges`
                : "No exposure"}
            </p>
          </div>
        </div>

        {/* Contract State Chips */}
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1 text-sm ${badgeClasses("neutral")}`}>
            {currentContract ? formatEnumLabel(currentContract.status) : "No active contract"}
          </span>
          {currentContract?.isFranchiseTag ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${badgeClasses("warning")}`}>
              Tagged
            </span>
          ) : null}
          {currentContract?.rookieOptionEligible && !currentContract.rookieOptionExercised ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${badgeClasses("info")}`}>
              Option eligible
            </span>
          ) : null}
          {currentContract?.deadCapSchedule.length ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${badgeClasses("critical")}`}>
              Dead cap relevant
            </span>
          ) : null}
          {props.detail.complianceSummary.highestSeverity === "ERROR" ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${badgeClasses("critical")}`}>
              Compliance errors
            </span>
          ) : props.detail.complianceSummary.highestSeverity === "WARNING" ? (
            <span className={`rounded-full border px-3 py-1 text-sm ${badgeClasses("warning")}`}>
              Compliance warnings
            </span>
          ) : null}
        </div>

        {/* Contract Details Summary */}
        {currentContract ? (
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="space-y-2">
              <p className="text-slate-500">Contract Terms</p>
              <div className="space-y-1">
                <p className="text-slate-300">
                  <span className="text-slate-500">Status:</span>{" "}
                  {formatEnumLabel(currentContract.status)}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Years:</span>{" "}
                  {currentContract.yearsRemaining}/{currentContract.yearsTotal}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Annual:</span>{" "}
                  {formatMoney(currentContract.ledger?.annualSalary ?? null)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-slate-500">Special Provisions</p>
              <div className="space-y-1">
                <p className="text-slate-300">
                  <span className="text-slate-500">Franchise Tag:</span>{" "}
                  {currentContract.isFranchiseTag ? "Yes" : "No"}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Option Eligible:</span>{" "}
                  {currentContract.rookieOptionEligible ? "Yes" : "No"}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Option Exercised:</span>{" "}
                  {currentContract.rookieOptionExercised ? "Yes" : "No"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-slate-500">Risk Assessment</p>
              <div className="space-y-1">
                <p className="text-slate-300">
                  <span className="text-slate-500">Dead Cap Charges:</span>{" "}
                  {currentContract.deadCapSchedule.length}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Compliance Issues:</span>{" "}
                  {props.detail.complianceSummary.openIssueCount}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Highest Severity:</span>{" "}
                  {props.detail.complianceSummary.highestSeverity ?? "None"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-center">
            <p className="text-slate-300">
              No current-season contract is recorded for this player.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Review the roster context and compliance issues before taking action.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}