"use client";

import { useState, type ReactNode } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { UrgentOperationsQueue } from "@/components/commissioner/urgent-operations-queue";
import { PhaseReadinessPanel } from "@/components/commissioner/phase-readiness-panel";
import { ComplianceOversightPanel } from "@/components/commissioner/compliance-oversight-panel";
import { ContractOperationsPanel } from "@/components/commissioner/contract-operations-panel";
import type { LeagueSummaryPayload } from "@/types/league";
import type { TradeHomeResponse } from "@/types/trade-workflow";
import type { RemediationRecord } from "@/lib/compliance/remediation";

type WorkspaceTab = "dashboard" | "operations";

function formatPhase(phase: string): string {
  switch (phase) {
    case "PRESEASON": return "Preseason";
    case "REGULAR_SEASON": return "Regular Season";
    case "PLAYOFFS": return "Playoffs";
    case "OFFSEASON": return "Offseason";
    default: return phase;
  }
}

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
  checklistPanel: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const { league, teams } = props.data;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("dashboard");

  // Calculate queue metrics for header context
  const urgentCount = teams.filter(team => team.complianceStatus === "error").length;
  const reviewCount = teams.filter(team => team.complianceStatus === "warning").length;
  const tradeQueueCount = (props.data.tradeOperations?.summary?.reviewQueue || 0) +
                         (props.data.tradeOperations?.summary?.settlementQueue || 0);

  const totalUrgentWork = urgentCount + tradeQueueCount;
  const headerDescription = league
    ? `${league.league.name} · Season ${league.season.year} · ${teams.length} teams`
    : "Loading commissioner workspace...";

  return (
    <div className="space-y-6" data-testid={props.testId}>
      <PageHeaderBand
        eyebrow="Commissioner Operations"
        title="Commissioner Home"
        description={headerDescription}
        titleTestId="commissioner-workspace-title"
        eyebrowTestId="commissioner-workspace-eyebrow"
      />

      {/* Status strip */}
      <div
        className="flex items-center divide-x divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 text-xs"
        role="status"
        aria-label="Commissioner workspace status"
        data-testid="commissioner-status-strip"
      >
        <span className="flex items-center gap-1.5 px-3 py-2 font-medium text-slate-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          Commissioner
        </span>
        <span className="flex items-center gap-1.5 px-3 py-2 text-slate-300">
          <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          {league ? formatPhase(league.season.phase) : "—"}
        </span>
        <span
          className={`flex items-center gap-1.5 px-3 py-2 font-medium ${
            totalUrgentWork > 0 ? "text-red-400" : "text-slate-500"
          }`}
          data-testid="commissioner-status-strip-alerts"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {totalUrgentWork} {totalUrgentWork === 1 ? "alert" : "alerts"}
        </span>
        <span
          className={`flex items-center gap-1.5 px-3 py-2 font-medium ${
            totalUrgentWork > 0
              ? "text-red-400"
              : reviewCount > 0
                ? "text-amber-400"
                : "text-emerald-400"
          }`}
          data-testid="commissioner-status-strip-queue"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              totalUrgentWork > 0 ? "bg-red-500" : reviewCount > 0 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            aria-hidden
          />
          {totalUrgentWork > 0 ? "Blocking" : reviewCount > 0 ? "Attention needed" : "Queue clear"}
        </span>
      </div>

      {/* Tab switcher */}
      <div
        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1"
        role="tablist"
        aria-label="Commissioner workspace"
        data-testid="commissioner-workspace-tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "dashboard"}
          data-testid="commissioner-tab-dashboard"
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "dashboard"
              ? "bg-slate-800 text-slate-100"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Overview
          {totalUrgentWork > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-300">
              {totalUrgentWork}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "operations"}
          data-testid="commissioner-tab-operations"
          onClick={() => setActiveTab("operations")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "operations"
              ? "bg-slate-800 text-slate-100"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Deep Operations
        </button>
      </div>

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

      {/* DASHBOARD TAB: Decision layer — queue and league health */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* System state banner — primary visual signal */}
          {totalUrgentWork > 0 ? (
            <div
              className="flex items-center gap-4 rounded-xl border border-red-600/70 bg-red-950/30 px-5 py-4 ring-1 ring-red-600/30"
              data-testid="system-state-banner-blocking"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-700/60">
                <svg className="h-5 w-5 text-red-200" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-red-100">
                  {totalUrgentWork} blocking {totalUrgentWork === 1 ? "issue" : "issues"} — action required
                </p>
                <p className="mt-0.5 text-sm text-red-300">
                  Resolve before proceeding with weekly workflow
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-red-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Blocking
              </span>
            </div>
          ) : reviewCount > 0 ? (
            <div
              className="flex items-center gap-4 rounded-xl border border-amber-600/60 bg-amber-950/25 px-5 py-4 ring-1 ring-amber-600/20"
              data-testid="system-state-banner-attention"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-700/50">
                <svg className="h-5 w-5 text-amber-200" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008Zm9.228 3.124c.818 1.421-.205 3.126-1.784 3.126H4.556c-1.58 0-2.602-1.705-1.784-3.126l7.22-12.531c.79-1.37 2.758-1.37 3.548 0l7.688 12.531Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-amber-100">
                  {reviewCount} {reviewCount === 1 ? "team" : "teams"} flagged for review
                </p>
                <p className="mt-0.5 text-sm text-amber-300">
                  Review before end of week — no immediate blockers
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-700/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-100">
                Attention
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-4 rounded-xl border border-emerald-700/50 bg-emerald-950/20 px-5 py-4 ring-1 ring-emerald-700/20"
              data-testid="system-state-banner-clear"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700/50">
                <svg className="h-5 w-5 text-emerald-200" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-emerald-100">All clear — queue is current</p>
                <p className="mt-0.5 text-sm text-emerald-400">
                  No system issues detected. Proceed with weekly workflow.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-800/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-200">
                Clear
              </span>
            </div>
          )}

          {/* Weekly workflow — primary driver, rendered first */}
          {props.checklistPanel}

          <section
            id="action-center"
            className={`scroll-mt-24 space-y-4 rounded-xl border p-5 ${
              totalUrgentWork > 0
                ? "border-red-600/70 bg-red-950/20 ring-1 ring-red-600/30"
                : "border-slate-700 bg-slate-900/60 ring-1 ring-slate-700/50"
            }`}
            data-testid="action-center-section"
          >
            <div className={`flex items-center justify-between border-b pb-3 ${
              totalUrgentWork > 0 ? "border-red-800/50" : "border-slate-700/60"
            }`}>
              <div>
                <h2 className={`text-base font-semibold ${
                  totalUrgentWork > 0 ? "text-red-100" : "text-slate-100"
                }`}>
                  System Status
                </h2>
                <p className={`mt-0.5 text-xs ${
                  totalUrgentWork > 0 ? "text-red-400" : "text-slate-400"
                }`}>
                  {totalUrgentWork > 0 ? "System-detected issues requiring attention" : "No system issues detected"}
                </p>
              </div>
              {totalUrgentWork > 0 ? (
                <span className="inline-flex items-center rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
                  {totalUrgentWork} URGENT
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-emerald-800/70 px-3 py-1 text-xs font-semibold text-emerald-200">
                  All clear
                </span>
              )}
            </div>

            <UrgentOperationsQueue
              data={props.data}
              actions={props.actions}
              testId="urgent-queue"
            />

            <PhaseReadinessPanel
              data={props.data}
              actions={props.actions}
              testId="phase-readiness"
            />
          </section>

          <section
            id="compliance-oversight"
            className="scroll-mt-24 space-y-3"
            data-testid="league-health-section"
          >
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-sm font-medium text-slate-400">League Health</h2>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <ComplianceOversightPanel
              data={props.data}
              actions={props.actions}
              testId="compliance-oversight-panel"
            />
          </section>
        </div>
      )}

      {/* OPERATIONS CONSOLE TAB: Execution layer — tables, forms, admin tools */}
      {activeTab === "operations" && (
        <div
          className="space-y-4"
          id="contract-operations"
          data-testid="deep-workspace-section"
        >
          <div className="rounded-lg border border-slate-800/60 bg-slate-950/20 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-slate-400">Contract Operations</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Commissioner-only contract maintenance and roster intervention tools.
              </p>
            </div>
            <ContractOperationsPanel />
          </div>

          <div
            id="workspace-admin"
            className="space-y-4"
            data-testid="workspace-admin-section"
          >
            {props.children}
          </div>
        </div>
      )}
    </div>
  );
}