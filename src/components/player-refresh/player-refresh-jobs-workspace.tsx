"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { StickySubnav } from "@/components/layout/sticky-subnav";
import { requestJson } from "@/lib/client-request";
import type { PlayerRefreshJobsProjection } from "@/lib/read-models/player/player-refresh-types";

type AuthPayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
  };
};

type TriggerResponse = {
  job: {
    id: string;
    status: string;
  };
};

function statusTone(status: string) {
  if (status === "SUCCEEDED") {
    return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  }
  if (status === "PARTIAL") {
    return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  }
  if (status === "FAILED") {
    return "border-rose-700/50 bg-rose-950/40 text-rose-200";
  }
  return "border-slate-700 bg-slate-900 text-slate-200";
}

export function PlayerRefreshJobsWorkspace() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<PlayerRefreshJobsProjection | null>(null);
  const [adapterKey, setAdapterKey] = useState("csv-manual");
  const [sourceLabel, setSourceLabel] = useState("");
  const [manualFormat, setManualFormat] = useState<"json" | "csv">("json");
  const [payloadText, setPayloadText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    const authPayload = await requestJson<AuthPayload>("/api/auth/me");
    if (authPayload.actor.leagueRole !== "COMMISSIONER") {
      window.location.replace("/players");
      return;
    }

    const payload = await requestJson<PlayerRefreshJobsProjection>(
      "/api/commissioner/player-refresh/jobs",
      undefined,
      "Failed to load player refresh jobs.",
    );

    setWorkspace(payload);
    if (payload.adapters.some((adapter) => adapter.key === adapterKey)) {
      return;
    }

    setAdapterKey(payload.adapters[0]?.key ?? "csv-manual");
  }, [adapterKey]);

  useEffect(() => {
    let mounted = true;

    loadWorkspace()
      .then(() => {
        if (!mounted) return;
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load player refresh workspace.",
        );
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [loadWorkspace]);

  const adapterOptions = workspace?.adapters ?? [];
  const selectedAdapter = adapterOptions.find((adapter) => adapter.key === adapterKey) ?? null;
  const requiresManualPayload = adapterKey === "csv-manual";

  const pendingReviewCount = useMemo(
    () =>
      workspace?.jobs.reduce((sum, job) => sum + job.pendingReviewCount, 0) ?? 0,
    [workspace],
  );

  async function runRefresh() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      let payload: Record<string, unknown> | null = null;

      if (requiresManualPayload) {
        if (!payloadText.trim()) {
          throw new Error("Manual refresh payload is required.");
        }

        if (manualFormat === "json") {
          let parsedPlayers: unknown;
          try {
            parsedPlayers = JSON.parse(payloadText);
          } catch {
            throw new Error("JSON player payload is invalid.");
          }

          payload = {
            format: "json",
            players: parsedPlayers,
          };
        } else {
          payload = {
            format: "csv",
            csv: payloadText,
          };
        }
      }

      const response = await requestJson<TriggerResponse>(
        "/api/commissioner/player-refresh/jobs",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            adapterKey,
            sourceLabel: sourceLabel.trim() || null,
            payload,
          }),
        },
        "Failed to trigger player refresh.",
      );

      setMessage(`Refresh job ${response.job.id} created.`);
      await loadWorkspace();
      router.push(`/commissioner/player-refresh/${response.job.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to trigger player refresh.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="player-refresh-jobs-workspace">
      <PageHeaderBand
        eyebrow="Commissioner Player Refresh"
        title="Player Refresh Review"
        description={
          workspace
            ? `Review canonical player refresh jobs for ${workspace.league.name}. ${pendingReviewCount} change(s) currently remain pending review.`
            : "Load and review canonical player refresh jobs before trusting ambiguous player updates."
        }
        supportingContent={
          workspace ? (
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">
              <span className="rounded-full border border-slate-700 px-3 py-1">
                {workspace.jobs.length} refresh job{workspace.jobs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-700 px-3 py-1">
                {pendingReviewCount} pending review
              </span>
            </div>
          ) : null
        }
      />

      <StickySubnav
        testId="player-refresh-jobs-subnav"
        items={[
          { href: "#trigger-refresh", label: "Trigger Refresh" },
          { href: "#recent-jobs", label: "Recent Jobs" },
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
        id="trigger-refresh"
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-100">Trigger Refresh</h2>
          <p className="mt-1 text-sm text-slate-400">
            Start a canonical player refresh job from a supported adapter. Manual payloads still
            go through the same reviewable refresh pipeline.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Adapter</span>
            <select
              value={adapterKey}
              onChange={(event) => setAdapterKey(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            >
              {adapterOptions.map((adapter) => (
                <option key={adapter.key} value={adapter.key}>
                  {adapter.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Source Label</span>
            <input
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              placeholder={
                selectedAdapter?.key === "fantasypros-seed"
                  ? "Optional run label"
                  : "Commissioner review batch"
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {requiresManualPayload ? (
          <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-300">Manual payload format</span>
              <select
                value={manualFormat}
                onChange={(event) => setManualFormat(event.target.value as "json" | "csv")}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </div>

            <textarea
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              placeholder={
                manualFormat === "json"
                  ? '[{"sourceKey":"sleeper","sourcePlayerId":"1001","name":"Example Player","position":"WR","nflTeam":"BUF"}]'
                  : "sourceKey,sourcePlayerId,name,position,nflTeam,isRestricted\nsleeper,1001,Example Player,WR,BUF,false"
              }
              className="min-h-40 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
        ) : (
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm text-slate-400">
            {selectedAdapter?.label ?? "Selected adapter"} does not require a manual payload.
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Low-confidence rows will remain pending review and will not be silently merged.
          </p>
          <button
            type="button"
            onClick={runRefresh}
            disabled={busy}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-100 disabled:opacity-50"
          >
            {busy ? "Running Refresh..." : "Run Refresh"}
          </button>
        </div>
      </section>

      <section
        id="recent-jobs"
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Recent Jobs</h2>
            <p className="mt-1 text-sm text-slate-400">
              Open a job to review pending ambiguous, duplicate-suspect, or invalid rows.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
            Loading refresh jobs...
          </div>
        ) : null}

        {!loading && workspace?.jobs.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
            No player refresh jobs have been run yet.
          </div>
        ) : null}

        {!loading && workspace?.jobs.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-300">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 text-left font-medium">Job</th>
                  <th className="px-3 py-2 text-left font-medium">Adapter</th>
                  <th className="px-3 py-2 text-right font-medium">Pending</th>
                  <th className="px-3 py-2 text-right font-medium">Applied</th>
                  <th className="px-3 py-2 text-right font-medium">Rejected</th>
                  <th className="px-3 py-2 text-right font-medium">Processed</th>
                  <th className="px-3 py-2 text-right font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {workspace.jobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-800/70 last:border-b-0">
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/commissioner/player-refresh/${job.id}`}
                            className="font-medium text-slate-100 hover:text-sky-300"
                          >
                            {job.sourceLabel ?? job.id}
                          </Link>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(job.status)}`}
                          >
                            {job.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Started {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-300">
                      <div>{job.adapterLabel}</div>
                      <div className="text-xs text-slate-500">{job.adapterKey}</div>
                    </td>
                    <td className="px-3 py-3 text-right align-top">{job.pendingReviewCount}</td>
                    <td className="px-3 py-3 text-right align-top">{job.appliedReviewCount}</td>
                    <td className="px-3 py-3 text-right align-top">{job.rejectedReviewCount}</td>
                    <td className="px-3 py-3 text-right align-top">
                      {job.summary?.totalProcessed ?? 0}
                    </td>
                    <td className="px-3 py-3 text-right align-top">
                      {job.summary?.new ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
