"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatEnumLabel } from "@/lib/format-label";
import { Button } from "@/components/ui/button";
import type { RemediationRecord } from "@/lib/compliance/remediation";

type UrgentOperationsData = {
  teams: Array<{
    id: string;
    name: string;
    complianceStatus: "ok" | "warning" | "error";
  }>;
  remediationRecords: RemediationRecord[];
  tradeOperations: {
    summary?: {
      reviewQueue?: number;
      settlementQueue?: number;
    };
  } | null;
  league: {
    league: { id: string; name: string };
    season: { phase: string };
  } | null;
  rulings: Array<{
    id: string;
    disputeTitle: string;
    dueAt: string;
  }>;
};

type UrgentOperationsActions = {
  onRunComplianceScan: () => void;
  busyAction: string | null;
};

export function UrgentOperationsQueue(props: {
  data: UrgentOperationsData;
  actions: UrgentOperationsActions;
  testId?: string;
}) {
  const { teams, remediationRecords, tradeOperations, league, rulings } = props.data;

  const complianceErrors = teams.filter(team => team.complianceStatus === "error").length;
  const complianceWarnings = teams.filter(team => team.complianceStatus === "warning").length;
  const pendingReviews = tradeOperations?.summary?.reviewQueue || 0;
  const pendingSettlement = tradeOperations?.summary?.settlementQueue || 0;

  const urgentRemediations = remediationRecords
    .filter(record => record.severity === "error")
    .slice(0, 3);

  const hasUrgentWork = complianceErrors > 0 || pendingReviews > 0 || urgentRemediations.length > 0;
  const totalUrgent = complianceErrors + pendingReviews;

  if (!hasUrgentWork) {
    return (
      <section
        id="urgent-queue"
        className="scroll-mt-24"
        data-testid={props.testId}
      >
        <div className="flex items-center gap-3 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-800/60">
            <svg className="h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-200">Queue Clear</p>
            <p className="text-xs text-emerald-400">
              No blocking compliance issues · Trade reviews current · Sync queues clear
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-800/60 px-3 py-1 text-xs font-medium text-emerald-200">
            {complianceWarnings > 0 ? `${complianceWarnings} for review` : "All clear"}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      id="urgent-queue"
      className="scroll-mt-24 space-y-3"
      data-testid={props.testId}
    >
      {/* Hero urgency banner — dominant, impossible to miss */}
      <div className="flex items-center gap-4 rounded-lg border border-red-600 bg-red-950/60 px-4 py-3 ring-1 ring-red-600/40">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-700">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-red-100">
            {totalUrgent} item{totalUrgent === 1 ? "" : "s"} need your attention
          </p>
          <p className="text-xs text-red-300">
            {complianceErrors > 0 && `${complianceErrors} compliance violation${complianceErrors === 1 ? "" : "s"}`}
            {complianceErrors > 0 && pendingReviews > 0 && " · "}
            {pendingReviews > 0 && `${pendingReviews} trade proposal${pendingReviews === 1 ? "" : "s"} awaiting decision`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
          URGENT
        </span>
      </div>

      {/* Metric cards — scaled to signal importance */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Compliance Blockers */}
        {complianceErrors > 0 && (
          <div
            className="rounded-lg border border-red-600 bg-red-900/40 p-4"
            data-testid="urgent-compliance-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
                Blocking Compliance
              </p>
              <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-bold text-white">
                BLOCKED
              </span>
            </div>
            <p className="mt-2 text-4xl font-bold tabular-nums text-red-100">
              {complianceErrors}
            </p>
            <p className="mt-0.5 text-xs text-red-300">
              team{complianceErrors === 1 ? "" : "s"} with hard-blocking violations
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                onClick={props.actions.onRunComplianceScan}
                disabled={props.actions.busyAction !== null}
                variant="destructive"
                size="sm"
                data-testid="urgent-compliance-scan"
              >
                {props.actions.busyAction === "compliance" ? "Scanning..." : "Scan Now"}
              </Button>
              <Link
                href="#compliance-oversight"
                className="inline-flex items-center rounded-md border border-red-600/60 px-3 py-1.5 text-xs text-red-200 hover:border-red-500 hover:text-red-100"
              >
                Review Details
              </Link>
            </div>
          </div>
        )}

        {/* Trade Reviews */}
        {pendingReviews > 0 && (
          <div
            className="rounded-lg border border-orange-600 bg-orange-900/30 p-4"
            data-testid="urgent-trade-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Trade Reviews
              </p>
              <span className="rounded-full bg-orange-700 px-2 py-0.5 text-xs font-bold text-white">
                PENDING
              </span>
            </div>
            <p className="mt-2 text-4xl font-bold tabular-nums text-orange-100">
              {pendingReviews}
            </p>
            <p className="mt-0.5 text-xs text-orange-300">
              proposal{pendingReviews === 1 ? "" : "s"} awaiting commissioner decision
            </p>
            <div className="mt-3">
              <Link
                href="/trades"
                className="inline-flex items-center rounded-md border border-orange-600 bg-orange-800/60 px-3 py-1.5 text-xs font-medium text-orange-100 hover:bg-orange-800/80"
                data-testid="urgent-trade-reviews"
              >
                Review Trades →
              </Link>
            </div>
          </div>
        )}

        {/* Settlement Queue */}
        {pendingSettlement > 0 && (
          <div
            className="rounded-lg border border-yellow-700/60 bg-yellow-950/30 p-4"
            data-testid="urgent-settlement-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-yellow-500">
                Settlement Queue
              </p>
              <span className="rounded-full bg-yellow-700/70 px-2 py-0.5 text-xs font-bold text-yellow-100">
                QUEUED
              </span>
            </div>
            <p className="mt-2 text-4xl font-bold tabular-nums text-yellow-100">
              {pendingSettlement}
            </p>
            <p className="mt-0.5 text-xs text-yellow-400">
              approved trade{pendingSettlement === 1 ? "" : "s"} ready to settle
            </p>
            <div className="mt-3">
              <Link
                href="/trades"
                className="inline-flex items-center rounded-md border border-yellow-700/60 px-3 py-1.5 text-xs text-yellow-200 hover:border-yellow-600"
                data-testid="urgent-settlement-link"
              >
                Open Settlement Queue →
              </Link>
            </div>
          </div>
        )}

        {/* Sync Escalations — lower priority, muted styling */}
        {league && !complianceErrors && !pendingReviews && (
          <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Sync Queue</p>
            <p className="mt-2 text-sm font-medium text-blue-100">
              Review host-platform mismatches
            </p>
            <p className="mt-1 text-xs text-blue-300">
              Keep sync drift separate from public feeds
            </p>
            <div className="mt-3">
              <Link
                href={`/league/${league.league.id}/sync`}
                className="inline-flex rounded-md border border-blue-700/50 px-3 py-1.5 text-xs text-blue-200 hover:border-blue-600"
                data-testid="urgent-sync-queue"
              >
                Open Sync Queue →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Urgent Remediation Items */}
      {urgentRemediations.length > 0 && (
        <div className="rounded-lg border border-red-700/40 bg-red-950/20 p-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">
            Top Remediations
          </h4>
          <div className="mt-2 space-y-2">
            {urgentRemediations.map((record) => (
              <div
                key={record.id}
                className="flex items-start justify-between gap-3 rounded border border-red-800/60 bg-red-950/60 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-100">{record.ruleCode}</p>
                  <p className="mt-0.5 text-xs text-red-300">{record.message}</p>
                  <p className="mt-0.5 text-xs text-red-400">
                    {record.teamName} · Due {new Date(record.dueAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-red-800 px-2 py-0.5 text-xs font-bold text-red-100">
                  {formatEnumLabel(record.severity)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
