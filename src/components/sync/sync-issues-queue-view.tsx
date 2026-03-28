"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatEnumLabel } from "@/lib/format-label";
import type { SyncIssuesQueueProjection } from "@/types/sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type QueueFilters = {
  status: string;
  severity: string;
  teamId: string;
};

type Props = {
  leagueId: string;
  queue: SyncIssuesQueueProjection;
  filters: QueueFilters;
  runForm: {
    sourceLabel: string;
    rosterCsv: string;
    transactionCsv: string;
  };
  runPending: boolean;
  runError: string | null;
  runSummary:
    | {
        jobId: string;
        status: string;
        totalDetected: number;
        warnings: string[];
        errors: string[];
      }
    | null;
  onFilterChange: (field: keyof QueueFilters, value: string) => void;
  onRunFormChange: (field: "sourceLabel" | "rosterCsv" | "transactionCsv", value: string) => void;
  onRunSync: () => Promise<void> | void;
};

function severityTone(severity: string) {
  if (severity === "HIGH_IMPACT") {
    return "border-red-700/60 bg-red-950/20 text-red-100";
  }
  if (severity === "WARNING") {
    return "border-amber-700/60 bg-amber-950/20 text-amber-100";
  }
  return "border-slate-700/60 bg-slate-900/70 text-slate-200";
}

function statusTone(status: string) {
  if (status === "ESCALATED") {
    return "text-red-300";
  }
  if (status === "RESOLVED") {
    return "text-emerald-300";
  }
  return "text-amber-300";
}

function priorityLabel(issue: SyncIssuesQueueProjection["issues"][number]) {
  if (issue.severity === "HIGH_IMPACT" && issue.status !== "RESOLVED") {
    return "Action needed now";
  }
  if (issue.status === "ESCALATED") {
    return "Escalated";
  }
  if (issue.status === "RESOLVED") {
    return "Resolved";
  }
  return "Open";
}

function issuePriorityRank(issue: SyncIssuesQueueProjection["issues"][number]) {
  if (issue.severity === "HIGH_IMPACT" && issue.status !== "RESOLVED") {
    return 0;
  }
  if (issue.status === "ESCALATED") {
    return 1;
  }
  if (issue.status === "OPEN") {
    return 2;
  }
  return 3;
}

function buildIssueGroups(issues: SyncIssuesQueueProjection["issues"]) {
  const grouped = new Map<
    string,
    {
      key: string;
      label: string;
      issues: SyncIssuesQueueProjection["issues"];
      openCount: number;
      escalatedCount: number;
      highImpactCount: number;
      teamCount: number;
    }
  >();

  for (const issue of issues) {
    const key = issue.mismatchType;
    const existing = grouped.get(key);
    if (existing) {
      existing.issues.push(issue);
      existing.openCount += issue.status === "OPEN" ? 1 : 0;
      existing.escalatedCount += issue.status === "ESCALATED" ? 1 : 0;
      existing.highImpactCount += issue.severity === "HIGH_IMPACT" ? 1 : 0;
      if (issue.team && !existing.issues.slice(0, -1).some((item) => item.team?.id === issue.team?.id)) {
        existing.teamCount += 1;
      }
      continue;
    }

    grouped.set(key, {
      key,
      label: formatEnumLabel(issue.mismatchType),
      issues: [issue],
      openCount: issue.status === "OPEN" ? 1 : 0,
      escalatedCount: issue.status === "ESCALATED" ? 1 : 0,
      highImpactCount: issue.severity === "HIGH_IMPACT" ? 1 : 0,
      teamCount: issue.team ? 1 : 0,
    });
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      issues: [...group.issues].sort((left, right) => {
        const priorityDelta = issuePriorityRank(left) - issuePriorityRank(right);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return new Date(right.lastDetectedAt).getTime() - new Date(left.lastDetectedAt).getTime();
      }),
    }))
    .sort((left, right) => {
      if (left.highImpactCount !== right.highImpactCount) {
        return right.highImpactCount - left.highImpactCount;
      }
      if (left.escalatedCount !== right.escalatedCount) {
        return right.escalatedCount - left.escalatedCount;
      }
      if (left.openCount !== right.openCount) {
        return right.openCount - left.openCount;
      }
      return right.issues.length - left.issues.length;
    });
}

export function SyncIssuesQueueView(props: Props) {
  const issueGroups = buildIssueGroups(props.queue.issues);

  return (
    <div className="space-y-6" data-testid="sync-issues-queue-view">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Operations queue</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-100">Sync Queue</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Review unresolved sync mismatches first, then run a new host sync when the queue is ready
          for another snapshot.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Open Issues" eyebrow="Queue summary">
          <p className="text-3xl font-semibold text-slate-100">{props.queue.summary.openCount}</p>
        </DashboardCard>
        <DashboardCard title="High Impact" eyebrow="Urgent priority">
          <p className="text-3xl font-semibold text-slate-100">
            {props.queue.summary.highImpactCount}
          </p>
        </DashboardCard>
        <DashboardCard title="Escalated" eyebrow="Compliance handoff">
          <p className="text-3xl font-semibold text-slate-100">
            {props.queue.summary.escalatedCount}
          </p>
        </DashboardCard>
        <DashboardCard title="Adapters" eyebrow="Available">
          <p className="text-sm font-medium text-slate-100">
            {props.queue.adapters.map((adapter) => adapter.label).join(", ")}
          </p>
        </DashboardCard>
      </div>

      <section
        className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5"
        data-testid="sync-priority-queue"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Priority work</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">Unresolved Sync Issues</h3>
            <p className="mt-2 text-sm text-slate-400">
              Start here to see what happened, which team or player is affected, and what needs action next.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Status</span>
              <Select
                value={props.filters.status}
                onChange={(event) => props.onFilterChange("status", event.target.value)}
              >
                <option value="ALL">All</option>
                <option value="OPEN">Open</option>
                <option value="ESCALATED">Escalated</option>
                <option value="RESOLVED">Resolved</option>
              </Select>
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Severity</span>
              <Select
                value={props.filters.severity}
                onChange={(event) => props.onFilterChange("severity", event.target.value)}
              >
                <option value="ALL">All</option>
                <option value="HIGH_IMPACT">High Impact</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
              </Select>
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Team</span>
              <Select
                value={props.filters.teamId}
                onChange={(event) => props.onFilterChange("teamId", event.target.value)}
              >
                <option value="ALL">All teams</option>
                {props.queue.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-3" data-testid="sync-issue-groups">
          {issueGroups.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400 xl:col-span-3">
              No grouped issue clusters are available for the current filters.
            </div>
          ) : (
            issueGroups.map((group) => (
              <div
                key={group.key}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                data-testid={`sync-issue-group-summary-${group.key.toLowerCase()}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{group.label}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {group.issues.length} issue{group.issues.length === 1 ? "" : "s"} across{" "}
                      {group.teamCount > 0
                        ? `${group.teamCount} team${group.teamCount === 1 ? "" : "s"}`
                        : "unassigned records"}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                    {group.highImpactCount} high impact
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
                  <span className="rounded-full border border-amber-700/40 bg-amber-950/20 px-2 py-0.5">
                    {group.openCount} open
                  </span>
                  <span className="rounded-full border border-red-700/40 bg-red-950/20 px-2 py-0.5">
                    {group.escalatedCount} escalated
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 space-y-4" data-testid="sync-issues-list">
          {props.queue.issues.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">
              No sync mismatches match the current filters. Clear one or more filters, or run a new host sync when you are ready for another snapshot.
            </div>
          ) : (
            issueGroups.map((group) => (
              <section
                key={group.key}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                data-testid={`sync-issue-group-${group.key.toLowerCase()}`}
              >
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">{group.label}</h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Repeated mismatches are grouped here so you can clear the pattern before running another host sync.
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {group.issues.length} linked issue{group.issues.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  {group.issues.map((issue) => (
                    <Link
                      key={issue.id}
                      href={`/league/${props.leagueId}/sync/${issue.id}`}
                      className={`block rounded-lg border p-3 transition hover:border-slate-600 ${severityTone(issue.severity)}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{issue.title}</p>
                            <span className="rounded-full border border-slate-700/60 px-2 py-0.5 text-[11px] opacity-90">
                              {priorityLabel(issue)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs opacity-80">
                            {formatEnumLabel(issue.status)} · detected {issue.detectionCount} time(s)
                          </p>
                          <p className="mt-2 text-sm opacity-90">{issue.message}</p>
                        </div>
                        <div className="text-right text-xs opacity-80">
                          <p>{new Date(issue.lastDetectedAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs opacity-80">
                        <span>{issue.team ? `Team: ${issue.team.name}` : "Team: unresolved"}</span>
                        <span>{issue.player ? `Player: ${issue.player.name}` : "Player: unresolved"}</span>
                        <span>{issue.complianceIssueId ? "Compliance issue linked" : "No compliance issue linked"}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
        <section
          className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5"
          data-testid="sync-run-sync"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Run host sync</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">Manual CSV Snapshot</h3>
              <p className="mt-2 text-sm text-slate-400">
                Paste a roster CSV and optional transaction CSV to create a new server-side sync job after you review the current queue.
              </p>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {props.queue.adapters.map((adapter) => adapter.label).join(", ")}
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Source Label</span>
              <Input
                value={props.runForm.sourceLabel}
                onChange={(event) => props.onRunFormChange("sourceLabel", event.target.value)}
                placeholder="Sleeper export 2026-03-21"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Roster CSV</span>
              <Textarea
                value={props.runForm.rosterCsv}
                onChange={(event) => props.onRunFormChange("rosterCsv", event.target.value)}
                rows={8}
                placeholder="playerExternalId,playerName,position,teamName,rosterStatus,hostPlatformReferenceId"
                className="font-mono text-xs"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Transaction CSV (optional)</span>
              <Textarea
                value={props.runForm.transactionCsv}
                onChange={(event) => props.onRunFormChange("transactionCsv", event.target.value)}
                rows={7}
                placeholder="transactionType,summary,teamName,playerExternalId,occurredAt"
                className="font-mono text-xs"
              />
            </label>
          </div>

          {props.runError ? (
            <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {props.runError}
            </div>
          ) : null}

          {props.runSummary ? (
            <div className="mt-4 rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
              Job {props.runSummary.jobId} completed with status {props.runSummary.status}. Detected{" "}
              {props.runSummary.totalDetected} mismatches.
              {props.runSummary.warnings.length > 0 ? ` Warnings: ${props.runSummary.warnings.length}.` : ""}
              {props.runSummary.errors.length > 0 ? ` Errors: ${props.runSummary.errors.length}.` : ""}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={() => void props.onRunSync()}
              disabled={props.runPending}
              variant="primary"
              loading={props.runPending}
            >
              {props.runPending ? "Running Sync..." : "Run Host Sync"}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Recent jobs</p>
          <div className="mt-4 space-y-3">
            {props.queue.recentJobs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No sync jobs are recorded yet. Run a host sync after you have reviewed the current queue.
              </p>
            ) : (
              props.queue.recentJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-100">{formatEnumLabel(job.jobType)}</p>
                    <span className={statusTone(job.status)}>{job.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {job.adapterKey} · {new Date(job.createdAt).toLocaleString()} · {job.mismatchCount} mismatches
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
