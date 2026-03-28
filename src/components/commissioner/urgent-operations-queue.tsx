"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatEnumLabel } from "@/lib/format-label";
import type { RemediationRecord } from "@/lib/compliance/remediation";
import { Button } from "@/components/ui/button";

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
  
  // Calculate urgent work metrics
  const complianceErrors = teams.filter(team => team.complianceStatus === "error").length;
  const complianceWarnings = teams.filter(team => team.complianceStatus === "warning").length;
  const pendingReviews = tradeOperations?.summary?.reviewQueue || 0;
  const pendingSettlement = tradeOperations?.summary?.settlementQueue || 0;
  const totalTradeWork = pendingReviews + pendingSettlement;
  
  // Prioritize most critical work
  const urgentRemediations = remediationRecords
    .filter(record => record.severity === "error")
    .slice(0, 3); // Show top 3 most urgent
    
  const hasUrgentWork = complianceErrors > 0 || pendingReviews > 0 || urgentRemediations.length > 0;

  if (!hasUrgentWork) {
    return (
      <section
        id="urgent-queue" 
        className="scroll-mt-24"
        data-testid={props.testId}
      >
        <DashboardCard 
          title="Urgent Operations Queue"
          description="All urgent work is current"
          className="border-emerald-800/60 bg-emerald-950/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="mt-2 text-sm text-emerald-200">
                No blocking compliance issues, trade reviews are current, and sync queues are clear.
                Ready for routine operations and phase management.
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center rounded-full bg-emerald-900/50 px-3 py-1 text-sm font-medium text-emerald-200">
                Queue Clear
              </span>
            </div>
          </div>
        </DashboardCard>
      </section>
    );
  }

  return (
    <section
      id="urgent-queue"
      className="scroll-mt-24 space-y-4"
      data-testid={props.testId}
    >
      <DashboardCard 
        title="Urgent Operations Queue"
        description="Critical work requiring commissioner attention"
        className="border-red-700/60 bg-red-950/20"
      >
        <div>
          <div className="flex items-center justify-between">
            <div></div>
            <span className="inline-flex items-center rounded-full bg-red-900/50 px-3 py-1 text-sm font-medium text-red-200">
              {complianceErrors + pendingReviews} urgent items
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Compliance Blockers */}
          {complianceErrors > 0 && (
            <div className="rounded-lg border border-red-800 bg-red-950 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-red-400">Blocking Compliance</p>
                <span className="inline-flex items-center rounded-full bg-red-900/60 px-2 py-1 text-xs text-red-200">
                  {complianceErrors} teams
                </span>
              </div>
              <p className="mt-2 text-lg font-semibold text-red-100">{complianceErrors}</p>
              <p className="mt-1 text-xs text-red-300">
                Teams with hard-blocking compliance violations
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
                  className="rounded-md border border-red-700/60 px-3 py-1.5 text-xs text-red-200 hover:border-red-600"
                >
                  Review Details
                </Link>
              </div>
            </div>
          )}

          {/* Trade Reviews */}
          {pendingReviews > 0 && (
            <div className="rounded-lg border border-amber-800 bg-amber-950 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-amber-400">Trade Reviews</p>
                <span className="inline-flex items-center rounded-full bg-amber-900/60 px-2 py-1 text-xs text-amber-200">
                  {pendingReviews} pending
                </span>
              </div>
              <p className="mt-2 text-lg font-semibold text-amber-100">{pendingReviews}</p>
              <p className="mt-1 text-xs text-amber-300">
                Proposals awaiting commissioner decision
              </p>
              <div className="mt-3">
                <Link
                  href="/trades"
                  className="inline-flex rounded-md border border-amber-700 bg-amber-900/50 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-900/70"
                  data-testid="urgent-trade-reviews"
                >
                  Review Trades
                </Link>
              </div>
            </div>
          )}

          {/* Sync Escalations */}
          {league && (
            <div className="rounded-lg border border-blue-800 bg-blue-950 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-400">Sync Queue</p>
              <p className="mt-2 text-sm font-medium text-blue-100">
                Review unresolved host-platform mismatches
              </p>
              <p className="mt-1 text-xs text-blue-300">
                Keep sync drift separate from public feeds
              </p>
              <div className="mt-3">
                <Link
                  href={`/league/${league.league.id}/sync`}
                  className="inline-flex rounded-md border border-blue-700/60 px-3 py-1.5 text-xs text-blue-200 hover:border-blue-600"
                  data-testid="urgent-sync-queue"
                >
                  Open Sync Queue
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Urgent Remediation Items */}
        {urgentRemediations.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-red-200">Most Urgent Remediations</h4>
            <div className="mt-2 space-y-2">
              {urgentRemediations.map((record) => (
                <div
                  key={record.id}
                  className="rounded border border-red-800/60 bg-red-950/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-red-100">{record.ruleCode}</p>
                      <p className="mt-1 text-xs text-red-300">{record.message}</p>
                      <p className="mt-1 text-xs text-red-400">
                        {record.teamName} • Due {new Date(record.dueAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-red-900/60 px-2 py-1 text-xs text-red-200">
                      {formatEnumLabel(record.severity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary and Next Actions */}
        <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/30 p-3">
          <p className="text-xs font-semibold text-red-200">Next Actions</p>
          <p className="mt-1 text-sm text-red-300">
            Address blocking compliance issues first, then review pending trades. 
            {complianceErrors > 0 && " Run compliance scan to identify specific violations."}
            {pendingReviews > 0 && " Review trade proposals to clear the queue."}
            {urgentRemediations.length > 0 && " Follow up on urgent remediations."}
          </p>
        </div>
      </DashboardCard>
    </section>
  );
}