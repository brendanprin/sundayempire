"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatEnumLabel } from "@/lib/format-label";
import type { RemediationRecord } from "@/lib/compliance/remediation";
import { Button } from "@/components/ui/button";

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
  const { teams, remediationRecords, league, rulings } = props.data;
  
  // Calculate compliance metrics
  const errorTeams = teams.filter(team => team.complianceStatus === "error");
  const warningTeams = teams.filter(team => team.complianceStatus === "warning");
  const okTeams = teams.filter(team => team.complianceStatus === "ok");
  
  const totalFindings = remediationRecords.length;
  const criticalFindings = remediationRecords.filter(r => r.severity === "error").length;
  const warningFindings = remediationRecords.filter(r => r.severity === "warning").length;
  
  const recentRulings = rulings
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);

  const complianceHealth = errorTeams.length === 0 
    ? "healthy"
    : errorTeams.length <= 2 
      ? "concerning" 
      : "critical";

  const healthConfig = {
    healthy: {
      tone: "emerald",
      label: "League Compliant",
      description: "No blocking compliance violations"
    },
    concerning: {
      tone: "amber", 
      label: "Issues Present",
      description: `${errorTeams.length} team${errorTeams.length === 1 ? " has" : "s have"} violations`
    },
    critical: {
      tone: "red",
      label: "Critical Issues", 
      description: `${errorTeams.length} teams require immediate attention`
    }
  };

  const config = healthConfig[complianceHealth];

  return (
    <section
      id="compliance-oversight"
      className="scroll-mt-24"
      data-testid={props.testId}
    >
      <DashboardCard 
        title="Compliance Oversight"
        description="League-wide compliance monitoring and remediation tracking"
        className={`border-${config.tone}-700/60 bg-${config.tone}-950/20`}
      >
        <div>
          <div className="flex items-center justify-between">
            <div></div>
            <span className={`inline-flex items-center rounded-full bg-${config.tone}-900/50 px-3 py-1 text-sm font-medium text-${config.tone}-200`}>
              {config.label}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {/* Team Status Summary */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Team Status</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-300">Compliant</span>
                <span className="font-semibold text-slate-100">{okTeams.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-300">Review Required</span> 
                <span className="font-semibold text-slate-100">{warningTeams.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-300">Blocking Issues</span>
                <span className="font-semibold text-slate-100">{errorTeams.length}</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="h-2 rounded-full bg-slate-800">
                <div 
                  className="h-2 rounded-full bg-emerald-600"
                  style={{ width: `${(okTeams.length / teams.length) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {okTeams.length} of {teams.length} teams compliant
              </p>
            </div>
          </div>

          {/* Remediation Queue */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Remediation Queue</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-300">Critical</span>
                <span className="font-semibold text-slate-100">{criticalFindings}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-300">Warning</span>
                <span className="font-semibold text-slate-100">{warningFindings}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total Findings</span>
                <span className="font-semibold text-slate-100">{totalFindings}</span>
              </div>
            </div>
            {totalFindings > 0 && (
              <div className="mt-3">
                <Link
                  href="#urgent-queue"
                  className="inline-flex text-xs text-sky-300 hover:text-sky-200"
                  data-testid="compliance-urgent-link"
                >
                  View Urgent Items →
                </Link>
              </div>
            )}
          </div>

          {/* Compliance Actions */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Actions</p>
            <div className="mt-3 space-y-2">
              <Button
                type="button"
                onClick={props.actions.onRunComplianceScan}
                disabled={props.actions.busyAction !== null}
                variant="primary"
                className="w-full"
                data-testid="compliance-scan-button"
              >
                {props.actions.busyAction === "compliance" ? "Scanning..." : "Run Compliance Scan"}
              </Button>
              <Link
                href="/commissioner/audit"
                className="block w-full rounded-md border border-slate-700/60 px-3 py-2 text-center text-sm text-slate-200 hover:border-slate-600"
                data-testid="compliance-audit-link"
              >
                Open Audit History
              </Link>
              {league && (
                <Link
                  href={`/league/${league.league.id}/teams`}
                  className="block w-full rounded-md border border-slate-700/60 px-3 py-2 text-center text-sm text-slate-200 hover:border-slate-600"
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
            <h4 className="text-xs font-semibold text-slate-200">Teams Requiring Attention</h4>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {errorTeams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded border border-red-800/60 bg-red-950/60 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-red-100">{team.name}</p>
                    <p className="text-xs text-red-300">Blocking compliance issues</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-900/60 px-2 py-1 text-xs text-red-200">
                    Error
                  </span>
                </div>
              ))}
              
              {warningTeams.slice(0, 3).map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded border border-amber-800/60 bg-amber-950/60 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-amber-100">{team.name}</p>
                    <p className="text-xs text-amber-300">Review required</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-amber-900/60 px-2 py-1 text-xs text-amber-200">
                    Warning
                  </span>
                </div>
              ))}
              
              {warningTeams.length > 3 && (
                <div className="flex items-center justify-center rounded border border-slate-700/60 bg-slate-950/60 p-3 text-xs text-slate-400">
                  +{warningTeams.length - 3} more teams with warnings
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Commissioner Rulings */}
        {recentRulings.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-slate-200">Recent Commissioner Rulings</h4>
            <div className="mt-2 space-y-2">
              {recentRulings.map((ruling) => (
                <div
                  key={ruling.id}
                  className="flex items-start justify-between rounded border border-slate-800/60 bg-slate-950/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">{ruling.disputeTitle}</p>
                    <p className="text-xs text-slate-400">
                      {formatEnumLabel(ruling.decision)} • {new Date(ruling.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`ml-3 inline-flex items-center rounded-full px-2 py-1 text-xs ${
                    ruling.decision === "approve" 
                      ? "bg-emerald-900/60 text-emerald-200"
                      : ruling.decision === "deny"
                        ? "bg-red-900/60 text-red-200"
                        : "bg-amber-900/60 text-amber-200"
                  }`}>
                    {formatEnumLabel(ruling.decision)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary and Health Status */}
        <div className="mt-4 rounded-lg border border-slate-800/40 bg-slate-950/30 p-3">
          <p className="text-xs font-semibold text-slate-200">Compliance Health Summary</p>
          <p className="mt-1 text-sm text-slate-300">
            {config.description}.
            {totalFindings > 0 && ` ${totalFindings} total finding${totalFindings === 1 ? "" : "s"} in remediation queue.`}
            {errorTeams.length > 0 && " Address blocking issues before phase transitions."}
            {errorTeams.length === 0 && warningTeams.length > 0 && " Review warnings for potential future issues."}
            {errorTeams.length === 0 && warningTeams.length === 0 && " League compliance is healthy."}
          </p>
        </div>
      </DashboardCard>
    </section>
  );
}