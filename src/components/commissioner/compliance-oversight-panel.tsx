"use client";

import Link from "next/link";
import { formatEnumLabel } from "@/lib/format-label";
import { Button } from "@/components/ui/button";
import type { RemediationRecord } from "@/lib/compliance/remediation";

type ScanResultSummary = {
  teamsEvaluated: number;
  ok: number;
  warning: number;
  error: number;
  totalFindings: number;
};

type ComplianceOversightData = {
  teams: Array<{
    id: string;
    name: string;
    complianceStatus: "ok" | "warning" | "error";
  }>;
  remediationRecords: RemediationRecord[];
  league: {
    league: { id: string; name: string };
  } | null;
  rulings: Array<{
    id: string;
    disputeTitle: string;
    decision: "approve" | "deny" | "manual-review";
    publishedAt: string;
  }>;
  lastScanResult?: ScanResultSummary | null;
};

type ComplianceOversightActions = {
  onRunComplianceScan: () => void;
  busyAction: string | null;
};

export function ComplianceOversightPanel(props: {
  data: ComplianceOversightData;
  actions: ComplianceOversightActions;
  testId?: string;
}) {
  const { teams, remediationRecords, league, rulings, lastScanResult } = props.data;

  const errorTeams = teams.filter(team => team.complianceStatus === "error");
  const warningTeams = teams.filter(team => team.complianceStatus === "warning");
  const okTeams = teams.filter(team => team.complianceStatus === "ok");

  const totalFindings = remediationRecords.length;
  const criticalFindings = remediationRecords.filter(r => r.severity === "error").length;
  const warningFindings = remediationRecords.filter(r => r.severity === "warning").length;

  const recentRulings = rulings
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);

  const isCritical = errorTeams.length > 2;
  const isConcerning = errorTeams.length > 0 && !isCritical;
  const isHealthy = errorTeams.length === 0;

  // Static header variant based on health state
  const headerBorder = isCritical
    ? "border-red-600 bg-red-950/30"
    : isConcerning
      ? "border-amber-700/70 bg-amber-950/20"
      : "border-slate-700/60 bg-slate-900/40";

  return (
    <section
      id="compliance-oversight"
      className="scroll-mt-24"
      data-testid={props.testId}
    >
      <div className={`rounded-lg border p-4 ${headerBorder}`}>
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Compliance Oversight
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-100">
              League-wide compliance monitoring
            </p>
          </div>

          {isCritical ? (
            <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
              CRITICAL — {errorTeams.length} TEAMS
            </span>
          ) : isConcerning ? (
            <span className="rounded-full bg-amber-700 px-3 py-1 text-xs font-bold text-amber-100">
              {errorTeams.length} team{errorTeams.length === 1 ? "" : "s"} with violations
            </span>
          ) : (
            <span className="rounded-full bg-emerald-800/70 px-3 py-1 text-xs font-semibold text-emerald-200">
              League Compliant
            </span>
          )}
        </div>

        {/* Critical state: prominent error count */}
        {(isCritical || isConcerning) && (
          <div className={`mt-3 flex items-center gap-4 rounded-md border px-4 py-3 ${
            isCritical
              ? "border-red-600/60 bg-red-950/50"
              : "border-amber-700/50 bg-amber-950/30"
          }`}>
            <p className={`text-5xl font-bold tabular-nums ${isCritical ? "text-red-200" : "text-amber-200"}`}>
              {errorTeams.length}
            </p>
            <div>
              <p className={`text-sm font-semibold ${isCritical ? "text-red-100" : "text-amber-100"}`}>
                team{errorTeams.length === 1 ? "" : "s"} with blocking violations
              </p>
              {totalFindings > 0 && (
                <p className={`mt-0.5 text-xs ${isCritical ? "text-red-300" : "text-amber-300"}`}>
                  {criticalFindings} critical · {warningFindings} warning findings in remediation queue
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {/* Team Status Summary */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team Status</p>
            <div className="mt-3 space-y-2">
              {errorTeams.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-red-300">Blocking Issues</span>
                  <span className="text-sm font-bold text-red-200">{errorTeams.length}</span>
                </div>
              )}
              {warningTeams.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-300">Review Required</span>
                  <span className="text-sm font-bold text-amber-200">{warningTeams.length}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400">Compliant</span>
                <span className="text-sm font-semibold text-emerald-300">{okTeams.length}</span>
              </div>
            </div>
            {teams.length > 0 && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{ width: `${(okTeams.length / teams.length) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {okTeams.length} of {teams.length} teams compliant
                </p>
              </div>
            )}
          </div>

          {/* Remediation Queue */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Remediation Queue</p>
            <div className="mt-3 space-y-2">
              {criticalFindings > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-red-300">Critical</span>
                  <span className="text-sm font-bold text-red-200">{criticalFindings}</span>
                </div>
              )}
              {warningFindings > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-300">Warning</span>
                  <span className="text-sm font-bold text-amber-200">{warningFindings}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Total Findings</span>
                <span className="text-sm font-semibold text-slate-200">{totalFindings}</span>
              </div>
            </div>
            {totalFindings > 0 && (
              <div className="mt-3">
                <Link
                  href="/commissioner/audit?severity=error"
                  className="inline-flex text-xs font-medium text-red-400 hover:text-red-300"
                  data-testid="compliance-urgent-link"
                >
                  View urgent items →
                </Link>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</p>
            <div className="mt-3 space-y-2">
              <Button
                type="button"
                onClick={props.actions.onRunComplianceScan}
                disabled={props.actions.busyAction !== null}
                variant="primary"
                className="w-full"
                data-testid="compliance-scan-button"
              >
                {props.actions.busyAction === "compliance" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Scanning…
                  </span>
                ) : "Run Compliance Scan"}
              </Button>
              {lastScanResult && props.actions.busyAction !== "compliance" && (
                <div
                  className={`rounded-md border px-3 py-2 ${
                    lastScanResult.error > 0
                      ? "border-red-700/60 bg-red-950/30"
                      : lastScanResult.warning > 0
                        ? "border-amber-700/50 bg-amber-950/20"
                        : "border-emerald-700/50 bg-emerald-950/20"
                  }`}
                  data-testid="compliance-scan-result"
                >
                  <p className={`text-xs font-medium ${
                    lastScanResult.error > 0 ? "text-red-200" : lastScanResult.warning > 0 ? "text-amber-200" : "text-emerald-200"
                  }`}>
                    {lastScanResult.error === 0 && lastScanResult.warning === 0
                      ? "Scan complete — no issues found"
                      : `Scan complete — ${[
                          lastScanResult.error > 0 ? `${lastScanResult.error} error${lastScanResult.error !== 1 ? "s" : ""}` : "",
                          lastScanResult.warning > 0 ? `${lastScanResult.warning} warning${lastScanResult.warning !== 1 ? "s" : ""}` : "",
                        ].filter(Boolean).join(", ")} detected`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {lastScanResult.teamsEvaluated} team{lastScanResult.teamsEvaluated !== 1 ? "s" : ""} evaluated
                  </p>
                </div>
              )}
              <Link
                href="/commissioner/audit"
                className="block w-full rounded-md border border-slate-700/60 px-3 py-2 text-center text-xs text-slate-300 hover:border-slate-600 hover:text-slate-200"
                data-testid="compliance-audit-link"
              >
                Open Audit History
              </Link>
              {league && (
                <Link
                  href={`/league/${league.league.id}/teams`}
                  className="block w-full rounded-md border border-slate-700/60 px-3 py-2 text-center text-xs text-slate-300 hover:border-slate-600 hover:text-slate-200"
                  data-testid="compliance-teams-link"
                >
                  Team Directory
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Teams with Issues */}
        {(errorTeams.length > 0 || warningTeams.length > 0) && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Teams Requiring Attention
            </h4>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2">
              {errorTeams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded border border-red-700/60 bg-red-950/50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-red-100">{team.name}</p>
                    <p className="text-xs text-red-400">Blocking compliance issues</p>
                  </div>
                  <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-bold text-white">
                    BLOCKED
                  </span>
                </div>
              ))}

              {warningTeams.slice(0, 3).map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded border border-amber-800/50 bg-amber-950/40 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-amber-100">{team.name}</p>
                    <p className="text-xs text-amber-400">Review required</p>
                  </div>
                  <span className="rounded-full bg-amber-700/80 px-2 py-0.5 text-xs font-semibold text-amber-100">
                    Warning
                  </span>
                </div>
              ))}

              {warningTeams.length > 3 && (
                <div className="flex items-center justify-center rounded border border-slate-700/50 px-3 py-2 text-xs text-slate-400">
                  +{warningTeams.length - 3} more teams with warnings
                </div>
              )}
            </div>
          </div>
        )}

        {/* Healthy state summary */}
        {isHealthy && (
          <div className="mt-4 rounded-md border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
            <p className="text-xs text-emerald-300">
              {totalFindings > 0
                ? `${totalFindings} finding${totalFindings === 1 ? "" : "s"} in remediation queue — no blocking issues.`
                : "No compliance findings. League is operating cleanly."}
            </p>
          </div>
        )}

        {/* Recent Commissioner Rulings */}
        {recentRulings.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recent Rulings
            </h4>
            <div className="mt-2 space-y-1.5">
              {recentRulings.map((ruling) => (
                <div
                  key={ruling.id}
                  className="flex items-start justify-between gap-3 rounded border border-slate-800/60 bg-slate-950/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{ruling.disputeTitle}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(ruling.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    ruling.decision === "approve"
                      ? "bg-emerald-800/70 text-emerald-200"
                      : ruling.decision === "deny"
                        ? "bg-red-800/70 text-red-200"
                        : "bg-amber-800/60 text-amber-200"
                  }`}>
                    {formatEnumLabel(ruling.decision)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
