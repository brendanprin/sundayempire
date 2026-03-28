"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { requestJson } from "@/lib/client-request";
import type { CommissionerAuditEntryDetail } from "@/types/audit";

type AuditDetailPayload = {
  entry: CommissionerAuditEntryDetail;
};

export default function CommissionerAuditDetailPage() {
  const params = useParams<{ entryId: string }>();
  const entryId = Array.isArray(params?.entryId) ? params.entryId[0] : params?.entryId;
  const [entry, setEntry] = useState<CommissionerAuditEntryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEntry = useCallback(async () => {
    if (!entryId) {
      return;
    }

    const payload = await requestJson<AuditDetailPayload>(
      `/api/commissioner/audit/${encodeURIComponent(entryId)}`,
      undefined,
      "Failed to load commissioner audit detail.",
    );
    setEntry(payload.entry);
  }, [entryId]);

  useEffect(() => {
    let mounted = true;

    loadEntry()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load commissioner audit detail.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [loadEntry]);

  if (!entryId) {
    return (
      <CanonicalRouteState
        eyebrow="Commissioner-only History"
        title="Audit Entry Detail"
        description="Review the operational record, source context, and structured audit sections for this event."
        tone="error"
        message="This route is missing audit entry context, so the detail view cannot open."
        safetyCopy="Existing audit history is unchanged. Reopen the entry from Commissioner Audit."
        actionHref="/commissioner/audit"
        actionLabel="Back to Commissioner Audit"
        testId="commissioner-audit-detail-route-state"
      />
    );
  }

  if (error) {
    return (
      <CanonicalRouteState
        eyebrow="Commissioner-only History"
        title="Audit Entry Detail"
        description="Review the operational record, source context, and structured audit sections for this event."
        tone="error"
        message="Audit Entry Detail could not load."
        safetyCopy={`${error} Existing audit history is unchanged. Refresh to retry, or return to Commissioner Audit.`}
        actionHref="/commissioner/audit"
        actionLabel="Back to Commissioner Audit"
        testId="commissioner-audit-detail-route-state"
      />
    );
  }

  if (!entry) {
    return (
      <CanonicalRouteState
        eyebrow="Commissioner-only History"
        title="Audit Entry Detail"
        description="Review the operational record, source context, and structured audit sections for this event."
        tone="loading"
        message="Loading audit history, source context, and structured detail."
        safetyCopy="Existing audit history remains authoritative while the detail view loads."
        testId="commissioner-audit-detail-route-state"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Audit Entry Detail</h2>
          <p className="mt-1 text-sm text-slate-400">{entry.auditType}</p>
        </div>
        <Link
          href="/commissioner/audit"
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200"
        >
          Back to Audit
        </Link>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Headline</p>
            <p className="mt-1 text-base text-slate-100">{entry.headline}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Occurred</p>
            <p className="mt-1 text-sm text-slate-200">{new Date(entry.occurredAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 text-sm text-slate-200">{entry.status ?? "recorded"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Source</p>
            <p className="mt-1 text-sm text-slate-200">{entry.sourceKind}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Actor</p>
            <p className="mt-1 text-sm text-slate-200">
              {entry.actor?.name ?? entry.actor?.email ?? entry.actor?.userId ?? "System"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Entity</p>
            <p className="mt-1 text-sm text-slate-200">
              {entry.entity ? `${entry.entity.entityType} ${entry.entity.entityId}` : "Not linked"}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Summary</p>
          <p className="mt-1 text-sm text-slate-300">{entry.detail}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-sm font-semibold text-slate-100">Sections</h3>
        <div className="mt-3 space-y-3">
          {entry.sections.map((section) => (
            <article key={section.label} className="rounded border border-slate-800 bg-slate-900 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{section.label}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-200">
                {JSON.stringify(section.value, null, 2)}
              </pre>
            </article>
          ))}
          {entry.sections.length === 0 ? (
            <p className="text-sm text-slate-400">No structured detail sections were recorded.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
