"use client";

import type { ReactNode } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { UrgentOperationsQueue } from "@/components/commissioner/urgent-operations-queue";
import { PhaseReadinessPanel } from "@/components/commissioner/phase-readiness-panel";
import { ComplianceOversightPanel } from "@/components/commissioner/compliance-oversight-panel";
import { ContractOperationsPanel } from "@/components/commissioner/contract-operations-panel";
import { StickySubnav } from "@/components/layout/sticky-subnav";
import type { LeagueSummaryPayload } from "@/types/league";
import type { TradeHomeResponse } from "@/types/trade-workflow";
import type { RemediationRecord } from "@/lib/compliance/remediation";

// Type definitions for commissioner workspace data
type CommissionerData = {
  league: LeagueSummaryPayload | null;
  teams: Array<{
    id: string;
    name: string;
    complianceStatus: "ok" | "warning" | "error";
  }>;
  remediationRecords: RemediationRecord[];
  tradeOperations: Pick<TradeHomeResponse, "summary" | "sections"> | null;
  transactions: Array<{
    id: string;
    type: string;
    summary: string;
    createdAt: string;
    team: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
  }>;
  rulings: Array<{
    id: string;
    disputeId: string;
    disputeTitle: string;
    decision: "approve" | "deny" | "manual-review";
    ruleCitation: string;
    dueAt: string;
    notes: string;
    actorEmail: string;
    publishedAt: string;
  }>;
};

type CommissionerActions = {
  onRunComplianceScan: () => Promise<void>;
  onPhaseTransition: (phase: "PRESEASON" | "REGULAR_SEASON" | "PLAYOFFS" | "OFFSEASON") => Promise<void>;
  onPublishRuling: () => void;
  busyAction: string | null;
};

export function CommissionerQueueWorkspace(props: {
  data: CommissionerData;
  actions: CommissionerActions;
  error: string | null;
  message: string | null;
  children: ReactNode;
  testId?: string;
}) {
  const { league, teams } = props.data;
  
  // Calculate queue metrics for header context
  const urgentCount = teams.filter(team => team.complianceStatus === "error").length;
  const reviewCount = teams.filter(team => team.complianceStatus === "warning").length;
  const tradeQueueCount = (props.data.tradeOperations?.summary?.reviewQueue || 0) + 
                         (props.data.tradeOperations?.summary?.settlementQueue || 0);
  
  const totalUrgentWork = urgentCount + tradeQueueCount;
  const queueStatus = totalUrgentWork > 0 
    ? `${totalUrgentWork} urgent item${totalUrgentWork === 1 ? "" : "s"}`
    : "Queue current";

  const headerDescription = league 
    ? `Commissioner operations for ${league.league.name} Season ${league.season.year}. ${queueStatus}, ${teams.length} teams in scope.`
    : "Loading commissioner workspace...";

  return (
    <div className="space-y-6" data-testid={props.testId}>
      <PageHeaderBand
        eyebrow="Commissioner Operations"
        title="Operations Console"
        description={headerDescription}
        titleTestId="commissioner-workspace-title"
        eyebrowTestId="commissioner-workspace-eyebrow"
        supportingContent={
          totalUrgentWork > 0 ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-red-900/50 px-3 py-1 text-sm font-medium text-red-200">
                {totalUrgentWork} urgent {totalUrgentWork === 1 ? "item" : "items"}
              </span>
              {reviewCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-900/50 px-3 py-1 text-sm font-medium text-amber-200">
                  {reviewCount} for review
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-emerald-900/50 px-3 py-1 text-sm font-medium text-emerald-200">
                Queue current
              </span>
              <span className="text-sm text-slate-400">Ready for routine operations</span>
            </div>
          )
        }
      />

      <StickySubnav
        testId="commissioner-queue-subnav"
        items={[
          { href: "#urgent-queue", label: "Urgent Queue" },
          { href: "#phase-readiness", label: "Phase Readiness" }, 
          { href: "#compliance-oversight", label: "Compliance" },
          { href: "#contract-operations", label: "Contract Ops" },
          { href: "#workspace-admin", label: "Workspace Admin" },
          { href: "#advanced-operations", label: "Advanced Ops" },
        ]}
      />

      {props.error ? (
        <div 
          className="rounded-md border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          data-testid="commissioner-error-banner"
        >
          {props.error}
        </div>
      ) : null}

      {props.message ? (
        <div 
          className="rounded-md border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
          data-testid="commissioner-message-banner"  
        >
          {props.message}
        </div>
      ) : null}

      {/* Queue-First Hierarchy: Urgent Work First */}
      <UrgentOperationsQueue
        data={props.data}
        actions={props.actions}
        testId="urgent-queue"
      />

      {/* Phase Readiness - Next Priority */}
      <PhaseReadinessPanel 
        data={props.data}
        actions={props.actions}
        testId="phase-readiness"
      />

      {/* Compliance Oversight - League Health */}  
      <ComplianceOversightPanel
        data={props.data}
        actions={props.actions}
        testId="compliance-oversight"
      />

      {/* Secondary Admin/Setup Operations */}
      <section
        id="contract-operations"
        className="scroll-mt-24 space-y-4 rounded-lg border border-slate-800/80 bg-slate-950/30 p-4"
        data-testid="contract-operations-section"
      >
        <div>
          <h3 className="text-sm font-semibold">Contract Operations</h3>
          <p className="mt-1 text-xs text-slate-400">
            Commissioner-only contract maintenance and roster intervention tools.
          </p>
        </div>
        <ContractOperationsPanel />
      </section>

      {/* Advanced/Admin Operations - Secondary */}
      <section 
        id="workspace-admin"
        className="scroll-mt-24"
        data-testid="workspace-admin-section"
      >
        {props.children}
      </section>
    </div>
  );
}