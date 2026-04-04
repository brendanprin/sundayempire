"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { SyncIssueDetailView } from "@/components/sync/sync-issue-detail-view";
import { requestJson } from "@/lib/client-request";
import type { SyncIssueDetailProjection } from "@/types/sync";

export default function SyncIssueDetailPage() {
  const params = useParams<{ leagueId: string; issueId: string }>();
  const leagueId = Array.isArray(params?.leagueId) ? params.leagueId[0] : params?.leagueId;
  const issueId = Array.isArray(params?.issueId) ? params.issueId[0] : params?.issueId;
  const [detail, setDetail] = useState<SyncIssueDetailProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const loadDetail = useCallback(async () => {
    if (!issueId) {
      return;
    }

    const payload = await requestJson<SyncIssueDetailProjection>(
      `/api/sync/issues/${issueId}`,
      undefined,
      "Failed to load sync issue detail.",
    );
    setDetail(payload);
  }, [issueId]);

  useEffect(() => {
    let mounted = true;

    loadDetail()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Failed to load sync issue detail.");
      });

    return () => {
      mounted = false;
    };
  }, [loadDetail]);

  const runAction = useCallback(
    async (
      path: string,
      actionName: string,
      body: Record<string, unknown>,
    ) => {
      setActionPending(actionName);
      setActionError(null);
      try {
        const payload = await requestJson<{ issue: SyncIssueDetailProjection | null }>(
          path,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
          `Failed to ${actionName.toLowerCase().replace(/_/g, " ")}.`,
        );
        if (payload.issue) {
          setDetail(payload.issue);
        } else {
          await loadDetail();
        }
      } catch (requestError) {
        setActionError(
          requestError instanceof Error ? requestError.message : `Failed to ${actionName.toLowerCase()}.`,
        );
      } finally {
        setActionPending(null);
      }
    },
    [loadDetail],
  );

  if (!leagueId || !issueId) {
    return (
      <CanonicalRouteState
        eyebrow="Sync Operations"
        title="Sync Issue Detail"
        description="Review the mismatch, compare records, and choose the safest resolution path."
        tone="error"
        message="This route is missing sync issue context, so the detail view cannot open."
        safetyCopy="Existing mismatch, resolution, and linked compliance records are unchanged. Reopen the issue from the Sync Queue."
        actionHref={leagueId ? `/league/${leagueId}/sync` : "/commissioner"}
        actionLabel={leagueId ? "Back to Sync Queue" : "Open Commissioner Operations"}
        testId="sync-issue-route-state"
      />
    );
  }

  if (error) {
    return (
      <CanonicalRouteState
        eyebrow="Sync Operations"
        title="Sync Issue Detail"
        description="Review the mismatch, compare records, and choose the safest resolution path."
        tone="error"
        message="Sync Issue Detail could not load."
        safetyCopy={`${error} Existing mismatch and resolution records are unchanged. Refresh to retry, or return to the Sync Queue.`}
        onRetry={loadDetail}
        actionHref={`/league/${leagueId}/sync`}
        actionLabel="Back to Sync Queue"
        testId="sync-issue-route-state"
      />
    );
  }

  if (!detail) {
    return (
      <CanonicalRouteState
        eyebrow="Sync Operations"
        title="Sync Issue Detail"
        description="Review the mismatch, compare records, and choose the safest resolution path."
        tone="loading"
        message="Loading mismatch detail, record comparison, and resolution options."
        safetyCopy="Existing mismatch and resolution records remain authoritative while the detail view loads."
        testId="sync-issue-route-state"
      />
    );
  }

  return (
    <SyncIssueDetailView
      leagueId={leagueId}
      detail={detail}
      actionPending={actionPending}
      actionError={actionError}
      note={note}
      onNoteChange={setNote}
      onResolve={(resolutionType) =>
        runAction(`/api/sync/issues/${issueId}/resolve`, resolutionType, {
          resolutionType,
          reason: note || null,
        })
      }
      onEscalate={() =>
        runAction(`/api/sync/issues/${issueId}/escalate`, "ESCALATE_TO_COMPLIANCE", {
          reason: note || null,
        })
      }
    />
  );
}
