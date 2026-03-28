"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/lib/client-request";
import { StatusPill, type StatusTone } from "@/components/table/standard-table";
import type { CommissionerAuditProjection } from "@/types/audit";

function sourceTone(sourceKind: string): StatusTone {
  if (sourceKind === "phase_transition" || sourceKind === "trade_proposal") return "info";
  if (sourceKind === "draft_selection" || sourceKind === "auction_award") return "success";
  if (sourceKind === "sync_mismatch") return "danger";
  return "warning";
}

function humanizeLabel(value: string) {
  return value
    .split(/[._:]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function buildAuditPath(filters: {
  seasonId: string;
  teamId: string;
  type: string;
  actor: string;
  entityType: string;
  entityId: string;
}) {
  const search = new URLSearchParams();
  search.set("limit", "80");
  if (filters.seasonId !== "ALL") search.set("seasonId", filters.seasonId);
  if (filters.teamId !== "ALL") search.set("teamId", filters.teamId);
  if (filters.type !== "ALL") search.set("type", filters.type);
  if (filters.actor.trim()) search.set("actor", filters.actor.trim());
  if (filters.entityType.trim()) search.set("entityType", filters.entityType.trim());
  if (filters.entityId.trim()) search.set("entityId", filters.entityId.trim());
  return `/api/commissioner/audit?${search.toString()}`;
}

export default function CommissionerAuditPage() {
  const [payload, setPayload] = useState<CommissionerAuditProjection | null>(null);
  const [filters, setFilters] = useState({
    seasonId: "ALL",
    teamId: "ALL",
    type: "ALL",
    actor: "",
    entityType: "",
    entityId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = useMemo(() => buildAuditPath(filters), [filters]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await requestJson<CommissionerAuditProjection>(
        path,
        undefined,
        "Failed to load commissioner audit activity.",
      );
      setPayload(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load commissioner audit activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const summaryCards = useMemo(
    () => Object.entries(payload?.summary.bySourceKind ?? {}).sort((left, right) => right[1] - left[1]),
    [payload?.summary.bySourceKind],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Commissioner-only history</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-100">Commissioner Audit</h2>
        <p className="mt-2 text-sm text-slate-400">
          Operational history for commissioner actions, sync interventions, lifecycle changes, and
          other records that should stay distinct from the public League Activity feed.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4" data-testid="commissioner-audit-feed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Audit scope</p>
            <p className="mt-1 text-sm text-slate-200">Commissioner-only operational history</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadAudit();
            }}
            disabled={loading}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh Audit"}
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs text-slate-300">
            <span className="mb-1 block text-slate-400">Season</span>
            <select
              value={filters.seasonId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, seasonId: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            >
              <option value="ALL">All</option>
              {(payload?.seasons ?? []).map((season) => (
                <option key={season.id} value={season.id}>
                  {season.year}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            <span className="mb-1 block text-slate-400">Team</span>
            <select
              value={filters.teamId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, teamId: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            >
              <option value="ALL">All</option>
              {(payload?.teams ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            <span className="mb-1 block text-slate-400">Type</span>
            <input
              value={filters.type === "ALL" ? "" : filters.type}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value.trim() ? event.target.value : "ALL",
                }))
              }
              placeholder="trade.proposal.accepted"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            />
          </label>
          <label className="text-xs text-slate-300">
            <span className="mb-1 block text-slate-400">Actor</span>
            <input
              value={filters.actor}
              onChange={(event) =>
                setFilters((current) => ({ ...current, actor: event.target.value }))
              }
              placeholder="user id or email"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            />
          </label>
          <label className="text-xs text-slate-300">
            <span className="mb-1 block text-slate-400">Entity type</span>
            <input
              value={filters.entityType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, entityType: event.target.value }))
              }
              placeholder="trade_proposal"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            />
          </label>
          <label className="text-xs text-slate-300">
            <span className="mb-1 block text-slate-400">Entity id</span>
            <input
              value={filters.entityId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, entityId: event.target.value }))
              }
              placeholder="entity id"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            />
          </label>
        </div>

        <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          Total audit entries in scope: {payload?.summary.total ?? 0}
        </div>

        {summaryCards.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-4">
            {summaryCards.map(([sourceKind, count]) => (
              <div key={sourceKind} className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {humanizeLabel(sourceKind)}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{count}</p>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        {loading && !payload ? (
          <p className="mt-3 rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
            Loading commissioner-only audit history and available filters.
          </p>
        ) : null}

        <div className="mt-3 space-y-2">
          {(payload?.entries ?? []).map((entry) => (
            <Link
              key={entry.id}
              href={`/commissioner/audit/${encodeURIComponent(entry.id)}`}
              className="block rounded border border-slate-800 bg-slate-900 px-3 py-2 transition hover:border-slate-600"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-100">{entry.headline}</p>
                <div className="flex items-center gap-2">
                  <StatusPill
                    label={humanizeLabel(entry.sourceKind)}
                    tone={sourceTone(entry.sourceKind)}
                  />
                  <StatusPill
                    label={entry.status ?? "recorded"}
                    tone={entry.status === "ESCALATED" ? "danger" : "neutral"}
                  />
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-300">{entry.detail}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                {new Date(entry.occurredAt).toLocaleString()}
                {entry.team ? ` · ${entry.team.name}` : ""}
                {entry.relatedTeam ? ` vs ${entry.relatedTeam.name}` : ""}
                {entry.actor ? ` · ${entry.actor.name ?? entry.actor.email ?? entry.actor.userId}` : ""}
                {` · ${entry.auditType}`}
              </p>
            </Link>
          ))}

          {!loading && (payload?.entries.length ?? 0) === 0 && !error ? (
            <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
              No audit records matched the current filters.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
