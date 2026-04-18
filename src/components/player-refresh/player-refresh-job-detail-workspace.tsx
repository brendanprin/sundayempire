"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { StickySubnav } from "@/components/layout/sticky-subnav";
import { requestJson } from "@/lib/client-request";
import type {
  PlayerRefreshChangeDetail,
  PlayerRefreshJobDetailProjection,
} from "@/lib/read-models/player/player-refresh-types";

type AuthPayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
  };
};

function statusTone(status: string) {
  if (status === "SUCCEEDED" || status === "APPLIED") {
    return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  }
  if (status === "PARTIAL" || status === "PENDING") {
    return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  }
  if (status === "FAILED" || status === "REJECTED") {
    return "border-rose-700/50 bg-rose-950/40 text-rose-200";
  }
  return "border-slate-700 bg-slate-900 text-slate-200";
}

function changeHeadline(change: PlayerRefreshChangeDetail) {
  const incomingName =
    typeof change.incomingValues?.displayName === "string"
      ? change.incomingValues.displayName
      : typeof change.incomingValues?.name === "string"
        ? change.incomingValues.name
        : null;
  return change.player?.displayName ?? incomingName ?? change.id;
}

export function PlayerRefreshJobDetailWorkspace(props: { jobId: string }) {
  const [detail, setDetail] = useState<PlayerRefreshJobDetailProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyChangeId, setBusyChangeId] = useState<string | null>(null);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<"ALL" | "pending" | "applied" | "rejected">("ALL");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Record<string, string>>({});
  const [notesByChangeId, setNotesByChangeId] = useState<Record<string, string>>({});
  const [restrictedByChangeId, setRestrictedByChangeId] = useState<Record<string, boolean>>({});

  const loadDetail = useCallback(async () => {
    const authPayload = await requestJson<AuthPayload>("/api/auth/me");
    if (authPayload.actor.leagueRole !== "COMMISSIONER") {
      window.location.replace("/players");
      return;
    }

    const payload = await requestJson<PlayerRefreshJobDetailProjection>(
      `/api/commissioner/player-refresh/jobs/${props.jobId}`,
      undefined,
      "Failed to load player refresh job detail.",
    );

    setDetail(payload);
  }, [props.jobId]);

  useEffect(() => {
    let mounted = true;

    loadDetail()
      .then(() => {
        if (!mounted) return;
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load player refresh job detail.",
        );
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [loadDetail]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setSelectedPlayerIds((previous) => {
      const next = { ...previous };
      for (const group of detail.groups) {
        for (const change of group.changes) {
          if (!next[change.id]) {
            next[change.id] =
              change.player?.id ?? change.candidatePlayers[0]?.id ?? "";
          }
        }
      }
      return next;
    });

    setRestrictedByChangeId((previous) => {
      const next = { ...previous };
      for (const group of detail.groups) {
        for (const change of group.changes) {
          if (!(change.id in next)) {
            next[change.id] = Boolean(change.player?.id && change.candidatePlayers.find((player) => player.id === change.player?.id)?.isRestricted);
          }
        }
      }
      return next;
    });
  }, [detail]);

  const visibleGroups = useMemo(() => {
    if (!detail) {
      return [];
    }

    if (selectedGroup === "ALL") {
      return detail.groups;
    }

    return detail.groups.filter((group) => group.id === selectedGroup);
  }, [detail, selectedGroup]);

  async function applyDecision(change: PlayerRefreshChangeDetail) {
    const playerId = selectedPlayerIds[change.id] || change.player?.id || "";
    if (!playerId) {
      setError("Choose a target player before applying this review decision.");
      return;
    }

    setBusyChangeId(change.id);
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        `/api/commissioner/player-refresh/changes/${change.id}/resolve`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "APPLY_MAPPING",
            playerId,
            restricted: restrictedByChangeId[change.id] ?? false,
            notes: notesByChangeId[change.id] ?? "",
          }),
        },
        "Failed to apply player refresh review decision.",
      );

      setMessage("Player refresh change applied.");
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to apply player refresh review decision.",
      );
    } finally {
      setBusyChangeId(null);
    }
  }

  async function rejectChange(changeId: string) {
    setBusyChangeId(changeId);
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        `/api/commissioner/player-refresh/changes/${changeId}/resolve`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "REJECT",
            notes: notesByChangeId[changeId] ?? "",
          }),
        },
        "Failed to reject player refresh change.",
      );

      setMessage("Player refresh change rejected.");
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to reject player refresh change.",
      );
    } finally {
      setBusyChangeId(null);
    }
  }

  async function toggleRestriction(playerId: string, currentValue: boolean, changeId?: string) {
    setBusyPlayerId(playerId);
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        `/api/commissioner/player-refresh/players/${playerId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            restricted: !currentValue,
            changeId: changeId ?? null,
          }),
        },
        "Failed to update player restriction state.",
      );

      setMessage(`Player ${currentValue ? "re-activated" : "restricted"} for operations.`);
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update player restriction state.",
      );
    } finally {
      setBusyPlayerId(null);
    }
  }

  return (
    <div className="space-y-6" data-testid="player-refresh-job-detail">
      <PageHeaderBand
        eyebrow="Commissioner Player Refresh"
        title={detail ? `Refresh Job ${detail.job.id}` : "Refresh Job"}
        description={
          detail
            ? `${detail.job.adapterLabel} refresh. ${detail.summary.pendingReviewCount} change(s) remain pending commissioner review.`
            : "Review pending canonical player refresh changes."
        }
        supportingContent={
          detail ? (
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">
              <Link
                href="/commissioner/player-refresh"
                className="rounded-full border border-slate-700 px-3 py-1 hover:border-slate-500"
              >
                Back to Jobs
              </Link>
              <span className={`rounded-full border px-3 py-1 ${statusTone(detail.job.status)}`}>
                Run Status: {detail.job.status}
              </span>
              <span className="rounded-full border border-slate-700 px-3 py-1">
                Pending Review: {detail.summary.pendingReviewCount}
              </span>
            </div>
          ) : null
        }
      />

      <StickySubnav
        testId="player-refresh-detail-subnav"
        items={[
          { href: "#job-overview", label: "Overview" },
          { href: "#job-groups", label: "Change Groups" },
        ]}
      />

      {error ? (
        <div className="rounded-md border border-rose-700/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-700/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      <section
        id="job-overview"
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-100">Overview</h2>
          <p className="mt-1 text-sm text-slate-400">
            Review job classifications and current review state before approving manual corrections.
          </p>
        </div>

        {loading ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
            Loading job detail...
          </div>
        ) : null}

        {detail ? (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {[
              ["NEW", detail.summary.new],
              ["UPDATED", detail.summary.updated],
              ["UNCHANGED", detail.summary.unchanged],
              ["INVALID", detail.summary.invalid],
              ["AMBIGUOUS", detail.summary.ambiguous],
              ["DUPLICATE_SUSPECT", detail.summary.duplicateSuspect],
              ["Pending Review", detail.summary.pendingReviewCount],
              ["Rejected", detail.summary.rejectedReviewCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {detail?.summary.warnings.length ? (
          <div className="rounded-md border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
            <div className="font-medium">Warnings</div>
            <ul className="mt-2 space-y-1">
              {detail.summary.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {detail?.summary.errors.length ? (
          <div className="rounded-md border border-rose-700/40 bg-rose-950/20 p-3 text-sm text-rose-200">
            <div className="font-medium">Errors</div>
            <ul className="mt-2 space-y-1">
              {detail.summary.errors.map((errorItem, index) => (
                <li key={`${errorItem}-${index}`}>{errorItem}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section
        id="job-groups"
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Change Groups</h2>
            <p className="mt-1 text-sm text-slate-400">
              Pending rows stay visible until a commissioner applies or rejects them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["ALL", "All"],
              ["pending", "Pending"],
              ["applied", "Applied"],
              ["rejected", "Rejected"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedGroup(value as typeof selectedGroup)}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  selectedGroup === value
                    ? "border-sky-600 bg-sky-950/40 text-sky-200"
                    : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {visibleGroups.map((group) => (
          <div key={group.id} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                {group.label} ({group.changes.length})
              </h3>
              <p className="mt-1 text-xs text-slate-500">{group.description}</p>
            </div>

            {group.changes.length === 0 ? (
              <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-400">
                No changes in this group.
              </div>
            ) : null}

            {group.changes.map((change) => (
              <article
                key={change.id}
                className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-100">
                        {changeHeadline(change)}
                      </h4>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(change.changeType)}`}
                      >
                        {change.changeType}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(change.reviewStatus)}`}
                      >
                        {change.reviewStatus}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{change.notes ?? "No notes recorded."}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Created {new Date(change.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Source Identity</div>
                    <div className="mt-2 space-y-1 text-sm text-slate-300">
                      <div>Source Key: {change.sourceIdentity?.sourceKey ?? "-"}</div>
                      <div>Source Player ID: {change.sourceIdentity?.sourcePlayerId ?? "-"}</div>
                      <div>External ID: {change.sourceIdentity?.externalId ?? "-"}</div>
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Incoming Values</div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-300">
                      {JSON.stringify(change.incomingValues ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Applied / Previous</div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-300">
                      {JSON.stringify(
                        {
                          previousValues: change.previousValues,
                          appliedValues: change.appliedValues,
                          fieldMask: change.fieldMask,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>

                {change.candidatePlayers.length > 0 ? (
                  <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-sm font-medium text-slate-100">Candidate Players</div>
                    <div className="space-y-2">
                      {change.candidatePlayers.map((candidate) => {
                        const isSelected =
                          (selectedPlayerIds[change.id] || change.player?.id || "") === candidate.id;

                        return (
                          <label
                            key={candidate.id}
                            className={`flex flex-col gap-2 rounded-md border px-3 py-2 text-sm ${
                              isSelected
                                ? "border-sky-600 bg-sky-950/20"
                                : "border-slate-800 bg-slate-900/50"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`candidate-${change.id}`}
                                  checked={isSelected}
                                  onChange={() =>
                                    setSelectedPlayerIds((previous) => ({
                                      ...previous,
                                      [change.id]: candidate.id,
                                    }))
                                  }
                                />
                                <span className="font-medium text-slate-100">
                                  {candidate.displayName} ({candidate.position})
                                </span>
                                {candidate.isRestricted ? (
                                  <span className="rounded-full border border-rose-700/50 bg-rose-950/40 px-2 py-0.5 text-xs text-rose-200">
                                    Restricted
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                disabled={busyPlayerId === candidate.id}
                                onClick={() =>
                                  toggleRestriction(
                                    candidate.id,
                                    candidate.isRestricted,
                                    change.id,
                                  )
                                }
                                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
                              >
                                {busyPlayerId === candidate.id
                                  ? "Saving..."
                                  : candidate.isRestricted
                                    ? "Reactivate"
                                    : "Restrict"}
                              </button>
                            </div>
                            <div className="text-xs text-slate-500">
                              Team {candidate.nflTeam ?? "FA"} | Source {candidate.sourceKey ?? "-"} /{" "}
                              {candidate.sourcePlayerId ?? "-"}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {change.permissions.canResolve || change.permissions.canReject ? (
                  <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-300">Review Notes</span>
                      <textarea
                        value={notesByChangeId[change.id] ?? ""}
                        onChange={(event) =>
                          setNotesByChangeId((previous) => ({
                            ...previous,
                            [change.id]: event.target.value,
                          }))
                        }
                        className="min-h-24 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        placeholder="Document why this change was approved, rejected, or restricted."
                      />
                    </label>

                    {change.permissions.canResolve ? (
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={restrictedByChangeId[change.id] ?? false}
                          onChange={(event) =>
                            setRestrictedByChangeId((previous) => ({
                              ...previous,
                              [change.id]: event.target.checked,
                            }))
                          }
                        />
                        Mark selected player restricted/unavailable as part of this review
                      </label>
                    ) : (
                      <div className="text-xs text-slate-500">
                        This row cannot be applied to a canonical player. Leave review notes and
                        reject it or rerun the source data with corrections.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {change.permissions.canResolve ? (
                        <button
                          type="button"
                          disabled={
                            busyChangeId === change.id ||
                            (!selectedPlayerIds[change.id] && !change.player?.id)
                          }
                          onClick={() => applyDecision(change)}
                          className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                        >
                          {busyChangeId === change.id ? "Applying..." : "Apply Decision"}
                        </button>
                      ) : null}
                      {change.permissions.canReject ? (
                        <button
                          type="button"
                          disabled={busyChangeId === change.id}
                          onClick={() => rejectChange(change.id)}
                          className="rounded-md border border-rose-700/50 px-3 py-2 text-sm text-rose-200 disabled:opacity-50"
                        >
                          {busyChangeId === change.id ? "Saving..." : "Reject Change"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
