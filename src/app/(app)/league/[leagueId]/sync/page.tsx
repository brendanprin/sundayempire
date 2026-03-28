"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { SyncIssuesQueueView } from "@/components/sync/sync-issues-queue-view";
import { requestJson } from "@/lib/client-request";
import type { SyncIssuesQueueProjection } from "@/types/sync";

export default function SyncIssuesQueuePage() {
  const params = useParams<{ leagueId: string }>();
  const leagueId = Array.isArray(params?.leagueId) ? params.leagueId[0] : params?.leagueId;
  const [queue, setQueue] = useState<SyncIssuesQueueProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<{
    jobId: string;
    status: string;
    totalDetected: number;
    warnings: string[];
    errors: string[];
  } | null>(null);
  const [filters, setFilters] = useState({
    status: "OPEN",
    severity: "ALL",
    teamId: "ALL",
  });
  const [runForm, setRunForm] = useState({
    sourceLabel: "",
    rosterCsv: "",
    transactionCsv: "",
  });

  const queuePath = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.severity !== "ALL") params.set("severity", filters.severity);
    if (filters.teamId !== "ALL") params.set("teamId", filters.teamId);
    const suffix = params.toString();
    return `/api/sync/issues${suffix ? `?${suffix}` : ""}`;
  }, [filters]);

  const loadQueue = useCallback(async () => {
    const payload = await requestJson<SyncIssuesQueueProjection>(
      queuePath,
      undefined,
      "Failed to load sync issues queue.",
    );
    setQueue(payload);
  }, [queuePath]);

  useEffect(() => {
    let mounted = true;

    loadQueue()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Failed to load sync issues queue.");
      });

    return () => {
      mounted = false;
    };
  }, [loadQueue]);

  const runSync = useCallback(async () => {
    setRunPending(true);
    setRunError(null);
    setRunSummary(null);

    try {
      const payload = await requestJson<{
        job: {
          id: string;
          status: string;
        };
        summary: {
          totalDetected: number;
          warnings: string[];
          errors: string[];
        };
      }>(
        "/api/sync/run",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            adapterKey: "csv-manual",
            sourceLabel: runForm.sourceLabel || null,
            ...(runForm.rosterCsv.trim()
              ? {
                  roster: {
                    format: "csv",
                    csv: runForm.rosterCsv,
                  },
                }
              : {}),
            ...(runForm.transactionCsv.trim()
              ? {
                  transactions: {
                    format: "csv",
                    csv: runForm.transactionCsv,
                  },
                }
              : {}),
          }),
        },
        "Failed to run host platform sync.",
      );

      setRunSummary({
        jobId: payload.job.id,
        status: payload.job.status,
        totalDetected: payload.summary.totalDetected,
        warnings: payload.summary.warnings,
        errors: payload.summary.errors,
      });
      await loadQueue();
    } catch (requestError) {
      setRunError(requestError instanceof Error ? requestError.message : "Failed to run host platform sync.");
    } finally {
      setRunPending(false);
    }
  }, [loadQueue, runForm]);

  if (!leagueId) {
    return (
      <CanonicalRouteState
        eyebrow="Operations Queue"
        title="Sync Queue"
        description="Review unresolved sync mismatches, then run a new host sync when the queue is ready."
        tone="error"
        message="This route is missing league context, so the Sync Queue cannot open."
        safetyCopy="Existing sync jobs and mismatch records are unchanged. Reopen the queue from Commissioner Operations."
        actionHref="/commissioner"
        actionLabel="Open Commissioner Operations"
        testId="sync-queue-route-state"
      />
    );
  }

  if (error && !queue) {
    return (
      <CanonicalRouteState
        eyebrow="Operations Queue"
        title="Sync Queue"
        description="Review unresolved sync mismatches, then run a new host sync when the queue is ready."
        tone="error"
        message="Sync Queue could not load."
        safetyCopy={`${error} Existing sync jobs, mismatches, and resolutions are unchanged. Refresh to retry, or return to Commissioner Operations.`}
        actionHref="/commissioner"
        actionLabel="Open Commissioner Operations"
        testId="sync-queue-route-state"
      />
    );
  }

  if (!queue) {
    return (
      <CanonicalRouteState
        eyebrow="Operations Queue"
        title="Sync Queue"
        description="Review unresolved sync mismatches, then run a new host sync when the queue is ready."
        tone="loading"
        message="Loading unresolved sync issues, queue filters, and recent jobs."
        safetyCopy="Existing sync jobs and mismatch records remain authoritative while the queue loads."
        testId="sync-queue-route-state"
      />
    );
  }

  return (
    <SyncIssuesQueueView
      leagueId={leagueId}
      queue={queue}
      filters={filters}
      runForm={runForm}
      runPending={runPending}
      runError={runError}
      runSummary={runSummary}
      onFilterChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
      onRunFormChange={(field, value) => setRunForm((current) => ({ ...current, [field]: value }))}
      onRunSync={runSync}
    />
  );
}
