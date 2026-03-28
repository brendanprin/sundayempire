"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CompactEmptyState } from "@/components/layout/canonical-route-state";
import { requestJson } from "@/lib/client-request";
import { StatusPill, type StatusTone } from "@/components/table/standard-table";
import type { ActivityFeedProjection } from "@/types/activity";

function familyTone(family: string): StatusTone {
  if (family === "trade" || family === "lifecycle") return "info";
  if (family === "draft" || family === "auction") return "success";
  if (family === "compliance" || family === "commissioner") return "warning";
  if (family === "sync") return "danger";
  return "neutral";
}

function familyLabel(family: string) {
  if (family === "draft") return "Rookie Draft";
  if (family === "sync") return "Sync";
  return family
    .split(".")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function buildActivityPath(filters: {
  seasonId: string;
  teamId: string;
  type: string;
}) {
  const search = new URLSearchParams();
  search.set("limit", "60");
  if (filters.seasonId !== "ALL") {
    search.set("seasonId", filters.seasonId);
  }
  if (filters.teamId !== "ALL") {
    search.set("teamId", filters.teamId);
  }
  if (filters.type !== "ALL") {
    search.set("type", filters.type);
  }
  const query = search.toString();
  return `/api/activity${query ? `?${query}` : ""}`;
}

function formatActivityDayLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildActivityMeta(item: ActivityFeedProjection["feed"][number]) {
  const tokens = [];

  if (item.team) {
    tokens.push(item.team.name);
  }

  if (item.relatedTeam) {
    tokens.push(`vs ${item.relatedTeam.name}`);
  }

  if (item.player) {
    tokens.push(item.player.name);
  }

  if (item.actorUser) {
    tokens.push(item.actorUser.name ?? item.actorUser.email);
  }

  return tokens;
}

export default function ActivityPage() {
  const [payload, setPayload] = useState<ActivityFeedProjection | null>(null);
  const [filters, setFilters] = useState({
    seasonId: "ALL",
    teamId: "ALL",
    type: "ALL",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = useMemo(() => buildActivityPath(filters), [filters]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await requestJson<ActivityFeedProjection>(
        path,
        undefined,
        "Failed to load activity feed.",
      );
      setPayload(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load activity feed.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const summaryCards = useMemo(() => {
    return Object.entries(payload?.summary.byFamily ?? {}).sort((left, right) => right[1] - left[1]);
  }, [payload?.summary.byFamily]);

  const groupedFeed = useMemo(() => {
    const groups = new Map<string, ActivityFeedProjection["feed"]>();

    for (const item of payload?.feed ?? []) {
      const key = new Date(item.occurredAt).toISOString().slice(0, 10);
      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    return [...groups.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([key, items]) => ({
        key,
        label: formatActivityDayLabel(items[0].occurredAt),
        items,
      }));
  }, [payload?.feed]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">League feed</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-100">League Activity</h2>
        <p className="mt-2 text-sm text-slate-400">
          League-visible workflow events from league history. Commissioner-only audit
          records stay on the separate audit route.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4" data-testid="activity-feed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Visibility</p>
            <p className="mt-1 text-sm text-slate-200" data-testid="activity-visibility-label">
              League-visible events only
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-300">
              <span className="mr-2 text-slate-400">Season</span>
              <select
                value={filters.seasonId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, seasonId: event.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                data-testid="activity-filter-season"
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
              <span className="mr-2 text-slate-400">Team</span>
              <select
                value={filters.teamId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, teamId: event.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                data-testid="activity-filter-team"
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
              <span className="mr-2 text-slate-400">Type</span>
              <select
                value={filters.type}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, type: event.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                data-testid="activity-filter-type"
              >
                <option value="ALL">All</option>
                {(payload?.types ?? []).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                void loadFeed();
              }}
              disabled={loading}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
              data-testid="activity-refresh-button"
            >
              {loading ? "Refreshing..." : "Refresh Feed"}
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          <p data-testid="activity-summary-total">
            Total events in scope: {payload?.summary.total ?? 0}
          </p>
        </div>

        {summaryCards.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map(([family, count]) => (
              <div key={family} className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{familyLabel(family)}</p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{count}</p>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3">
            <CompactEmptyState message={error} tone="error" testId="activity-error-state" />
          </div>
        ) : null}

        {loading && !payload ? (
          <div className="mt-3">
            <CompactEmptyState
              message="Loading league-visible events and filter options."
              testId="activity-loading-state"
            />
          </div>
        ) : null}

        <div className="mt-3 space-y-4" data-testid="activity-feed-list">
          {groupedFeed.map((group) => (
            <section
              key={group.key}
              className="rounded-lg border border-slate-800 bg-slate-900/70"
              data-testid="activity-day-group"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{group.label}</h3>
                  <p className="text-[11px] text-slate-500">
                    {group.items.length} event{group.items.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-800">
                {group.items.map((item) => {
                  const metaTokens = buildActivityMeta(item);

                  return (
                    <article
                      key={item.id}
                      className="px-3 py-3"
                      data-testid="activity-item"
                      data-event-type={item.eventType}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-100">{item.title}</p>
                            <StatusPill
                              label={familyLabel(item.eventFamily)}
                              tone={familyTone(item.eventFamily)}
                            />
                          </div>
                          <p className="mt-1 text-sm text-slate-300">{item.body}</p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {metaTokens.length > 0 ? metaTokens.join(" · ") : "League-wide update"}
                          </p>
                        </div>
                        <div className="text-right text-[11px] text-slate-500">
                          <p>{formatActivityTime(item.occurredAt)}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {!loading && (payload?.feed.length ?? 0) === 0 && !error ? (
            <CompactEmptyState
              message="No league-visible events matched the current filters. Clear a filter or refresh after the next workflow update."
              testId="activity-empty-state"
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
