"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatEnumLabel } from "@/lib/format-label";
import type { SyncIssueDetailProjection } from "@/types/sync";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  leagueId: string;
  detail: SyncIssueDetailProjection;
  actionPending: string | null;
  actionError: string | null;
  note: string;
  onNoteChange: (value: string) => void;
  onResolve: (resolutionType: "ACCEPT_HOST_PLATFORM" | "KEEP_DYNASTY_TRUTH" | "DISMISS_FALSE_POSITIVE") => Promise<void> | void;
  onEscalate: () => Promise<void> | void;
};

function tone(severity: string) {
  if (severity === "HIGH_IMPACT") return "border-red-700/50 bg-red-950/20";
  if (severity === "WARNING") return "border-amber-700/50 bg-amber-950/20";
  return "border-slate-800 bg-slate-900/60";
}

function renderJsonBlock(value: Record<string, unknown> | null) {
  if (!value) {
    return (
      <p className="text-sm text-slate-500">
        No snapshot is available for this side of the comparison. Review the timeline and affected records before choosing a resolution.
      </p>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function buildActionGuidance(detail: SyncIssueDetailProjection) {
  if (detail.mismatch.status === "RESOLVED") {
    return "This mismatch has already been resolved. Review the resolution details and linked records below.";
  }
  if (detail.permissions.canResolve || detail.permissions.canEscalate) {
    return "Commissioner action is available. Review both record snapshots, then choose the safest resolution path.";
  }
  return "No commissioner action is available for the current viewer.";
}

export function SyncIssueDetailView(props: Props) {
  const mismatch = props.detail.mismatch;
  const actionGuidance = buildActionGuidance(props.detail);

  return (
    <div className="space-y-6" data-testid="sync-issue-detail-view">
      <section className={`rounded-2xl border p-6 ${tone(mismatch.severity)}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Sync operations</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-100">Sync Issue Detail</h2>
            <p className="mt-2 text-sm font-medium text-slate-100">{mismatch.title}</p>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">{mismatch.message}</p>
          </div>
          <Link
            href={`/league/${props.leagueId}/sync`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-100"
          >
            Back to Sync Queue
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="What Happened" eyebrow="Mismatch type">
          <p className="text-lg font-semibold text-slate-100">{formatEnumLabel(mismatch.mismatchType)}</p>
        </DashboardCard>
        <DashboardCard title="Status" eyebrow="Resolution state">
          <p className="text-lg font-semibold text-slate-100">{formatEnumLabel(mismatch.status)}</p>
        </DashboardCard>
        <DashboardCard title="Affected Records" eyebrow="Team / player">
          <p className="text-sm font-medium text-slate-100">
            {mismatch.team ? mismatch.team.name : "Unresolved team"}
            {mismatch.player ? ` · ${mismatch.player.name}` : ""}
          </p>
        </DashboardCard>
        <DashboardCard title="Action Needed" eyebrow="Operator guidance">
          <p className="text-sm font-medium text-slate-100">{actionGuidance}</p>
        </DashboardCard>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <DashboardCard
            title="What happened"
            description="The key mismatch facts and the timestamps that determine urgency."
            testId="sync-issue-what-happened"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500">Severity and status</p>
                <p className="mt-2 text-slate-100">
                  {formatEnumLabel(mismatch.severity)} · {formatEnumLabel(mismatch.status)}
                </p>
                <p className="mt-2">Detected {mismatch.detectionCount} time(s).</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500">Timeline</p>
                <p className="mt-2">First detected: {new Date(mismatch.firstDetectedAt).toLocaleString()}</p>
                <p className="mt-1">Last detected: {new Date(mismatch.lastDetectedAt).toLocaleString()}</p>
                <p className="mt-1">
                  Resolved: {mismatch.resolvedAt ? new Date(mismatch.resolvedAt).toLocaleString() : "Not yet resolved"}
                </p>
              </div>
            </div>

            {mismatch.resolutionReason ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500">Resolution note</p>
                <p className="mt-2">{mismatch.resolutionReason}</p>
              </div>
            ) : null}
          </DashboardCard>

          <DashboardCard
            title="Record comparison"
            description="Compare the host snapshot with the current dynasty record before applying a resolution."
            testId="sync-issue-record-comparison"
          >
            <div className="grid gap-6 2xl:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Host snapshot</p>
                <div className="mt-4">{renderJsonBlock(mismatch.hostValue)}</div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Dynasty snapshot</p>
                <div className="mt-4">{renderJsonBlock(mismatch.dynastyValue)}</div>
              </div>
            </div>
          </DashboardCard>
        </div>

        <div className="space-y-6">
          <DashboardCard
            title="Resolution options"
            description="Buttons stay tied to the deterministic resolution workflow so the underlying records remain authoritative."
            testId="sync-issue-resolution"
          >
            <p className="text-sm text-slate-300">{actionGuidance}</p>
            <label className="mt-4 block space-y-2 text-sm text-slate-300">
              <span className="text-slate-400">Resolution note</span>
              <Textarea
                value={props.note}
                onChange={(event) => props.onNoteChange(event.target.value)}
                rows={4}
                placeholder="Optional operator note"
              />
            </label>

            {props.actionError ? (
              <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {props.actionError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={!props.detail.permissions.canResolve || props.actionPending !== null}
                onClick={() => void props.onResolve("ACCEPT_HOST_PLATFORM")}
                variant="primary"
                loading={props.actionPending === "ACCEPT_HOST_PLATFORM"}
              >
                {props.actionPending === "ACCEPT_HOST_PLATFORM"
                  ? "Applying..."
                  : "Accept Host Snapshot as Reference"}
              </Button>
              <Button
                type="button"
                disabled={!props.detail.permissions.canResolve || props.actionPending !== null}
                onClick={() => void props.onResolve("KEEP_DYNASTY_TRUTH")}
                variant="secondary"
                loading={props.actionPending === "KEEP_DYNASTY_TRUTH"}
              >
                {props.actionPending === "KEEP_DYNASTY_TRUTH"
                  ? "Saving..."
                  : "Keep Dynasty Record"}
              </Button>
              <Button
                type="button"
                disabled={!props.detail.permissions.canResolve || props.actionPending !== null}
                onClick={() => void props.onResolve("DISMISS_FALSE_POSITIVE")}
                variant="subtle"
                loading={props.actionPending === "DISMISS_FALSE_POSITIVE"}
              >
                {props.actionPending === "DISMISS_FALSE_POSITIVE"
                  ? "Saving..."
                  : "Dismiss False Positive"}
              </Button>
              <Button
                type="button"
                disabled={!props.detail.permissions.canEscalate || props.actionPending !== null}
                onClick={() => void props.onEscalate()}
                variant="destructive"
                loading={props.actionPending === "ESCALATE_TO_COMPLIANCE"}
              >
                {props.actionPending === "ESCALATE_TO_COMPLIANCE"
                  ? "Escalating..."
                  : "Escalate to Compliance"}
              </Button>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Affected records"
            description="See which job, roster assignment, and compliance records are tied to this mismatch."
            testId="sync-issue-affected-records"
          >
            <div className="space-y-2 text-sm text-slate-300">
              <p>Host reference: <span className="font-medium text-slate-100">{mismatch.hostPlatformReferenceId ?? "None"}</span></p>
              <p>Roster assignment: <span className="font-medium text-slate-100">{mismatch.rosterAssignment?.id ?? "None"}</span></p>
              <p>Compliance issue: <span className="font-medium text-slate-100">{mismatch.complianceIssue?.id ?? "None"}</span></p>
              <p>Resolved by: <span className="font-medium text-slate-100">{mismatch.resolvedByUser?.email ?? "Unresolved"}</span></p>
              <p>Resolution type: <span className="font-medium text-slate-100">{mismatch.resolutionType ?? "Pending"}</span></p>
              <p>Job type: <span className="font-medium text-slate-100">{props.detail.job ? formatEnumLabel(props.detail.job.jobType) : "Unavailable"}</span></p>
            </div>
          </DashboardCard>

          <DashboardCard title="Metadata" eyebrow="Technical details">
            {renderJsonBlock(mismatch.metadata)}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
