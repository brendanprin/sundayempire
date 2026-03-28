"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/lib/client-request";
import {
  StandardTable,
  StatusPill,
  StickyHeaderCell,
} from "@/components/table/standard-table";
import {
  applyQuickFilter,
  matchesQuickFilter,
  TableFilterToolbar,
  useSavedTableFilters,
} from "@/components/table/table-filters";

type PlayerRow = {
  id: string;
  name: string;
  position: string;
  nflTeam: string | null;
  age: number | null;
  isRestricted: boolean;
  isRostered: boolean;
  ownerTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  contract: {
    salary: number;
    yearsRemaining: number;
  } | null;
};

type ImportResult = {
  jobId: string;
  jobStatus: string;
  submitted: number;
  normalized: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

type Filters = {
  search: string;
  position: string;
  rostered: string;
  sortBy: string;
  sortDir: "asc" | "desc";
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  position: "",
  rostered: "",
  sortBy: "name",
  sortDir: "asc",
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const {
    filters,
    setFilters,
    hasSavedFilters,
    saveCurrentFilters,
    applySavedFilters,
    clearSavedFilters,
    resetFilters,
  } = useSavedTableFilters<Filters>({
    storageKey: "dynasty:table-filters:players:v1",
    initialFilters: DEFAULT_FILTERS,
  });
  const [error, setError] = useState<string | null>(null);
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importPayload, setImportPayload] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.position) params.set("position", filters.position);
    if (filters.rostered) params.set("rostered", filters.rostered);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortDir) params.set("sortDir", filters.sortDir);
    return params.toString();
  }, [filters]);

  const loadPlayers = useCallback(async () => {
    const payload = await requestJson<{ players: PlayerRow[] }>(
      `/api/players${queryString ? `?${queryString}` : ""}`,
      undefined,
      "Failed to load players.",
    );
    setPlayers(payload.players);
  }, [queryString]);

  useEffect(() => {
    let mounted = true;

    loadPlayers()
      .then(() => {
        if (!mounted) return;
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load players.");
      });

    return () => {
      mounted = false;
    };
  }, [loadPlayers]);

  async function runImport() {
    if (!importPayload.trim()) {
      setError("Import payload is required.");
      return;
    }

    setImportBusy(true);
    setError(null);
    setImportErrors([]);
    setImportResult(null);

    try {
      let body: Record<string, unknown>;
      if (importFormat === "json") {
        let parsedPlayers: unknown;
        try {
          parsedPlayers = JSON.parse(importPayload);
        } catch {
          throw new Error("JSON import payload is invalid.");
        }

        body = {
          format: "json",
          players: parsedPlayers,
        };
      } else {
        body = {
          format: "csv",
          csv: importPayload,
        };
      }

      const payload = await requestJson<{
        job: {
          id: string;
          status: string;
        };
        totals: {
          submitted: number;
          normalized: number;
          created: number;
          updated: number;
          skipped: number;
          errors: number;
        };
        errors: string[];
      }>(
        "/api/players/import",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        "Player import failed.",
      );

      setImportResult({
        jobId: payload.job.id,
        jobStatus: payload.job.status,
        ...payload.totals,
      });
      setImportErrors(payload.errors.slice(0, 10));
      await loadPlayers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Player import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Players</h2>
        <p className="mt-1 text-sm text-slate-400">Search and filter rostered players and free agents.</p>
      </div>

      <TableFilterToolbar
        testIdPrefix="players-table-filters"
        title="Player Filter Presets"
        chips={[
          {
            id: "all",
            label: "All Players",
            active: matchesQuickFilter(filters, DEFAULT_FILTERS),
            onClick: () => setFilters(DEFAULT_FILTERS),
          },
          {
            id: "rostered",
            label: "Rostered",
            active: matchesQuickFilter(filters, { rostered: "true" }),
            onClick: () => applyQuickFilter(setFilters, { ...DEFAULT_FILTERS, rostered: "true" }),
          },
          {
            id: "free-agents",
            label: "Free Agents",
            active: matchesQuickFilter(filters, { rostered: "false" }),
            onClick: () => applyQuickFilter(setFilters, { ...DEFAULT_FILTERS, rostered: "false" }),
          },
          {
            id: "qb-pool",
            label: "QB Pool",
            active: matchesQuickFilter(filters, { position: "QB" }),
            onClick: () => applyQuickFilter(setFilters, { ...DEFAULT_FILTERS, position: "QB" }),
          },
          {
            id: "k-pool",
            label: "K Pool",
            active: matchesQuickFilter(filters, { position: "K" }),
            onClick: () => applyQuickFilter(setFilters, { ...DEFAULT_FILTERS, position: "K" }),
          },
          {
            id: "expiring-deals",
            label: "Expiring Deals",
            active: matchesQuickFilter(filters, {
              rostered: "true",
              sortBy: "yearsRemaining",
              sortDir: "asc",
            }),
            onClick: () =>
              applyQuickFilter(setFilters, {
                ...DEFAULT_FILTERS,
                rostered: "true",
                sortBy: "yearsRemaining",
                sortDir: "asc",
              }),
          },
        ]}
        hasSavedFilters={hasSavedFilters}
        onSaveCurrent={saveCurrentFilters}
        onApplySaved={applySavedFilters}
        onClearSaved={clearSavedFilters}
        onReset={resetFilters}
      />

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 p-4 md:grid-cols-5">
        <input
          data-testid="players-filter-search"
          placeholder="Search name"
          value={filters.search}
          onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <select
          data-testid="players-filter-position"
          value={filters.position}
          onChange={(event) => setFilters((previous) => ({ ...previous, position: event.target.value }))}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="">All Positions</option>
          <option value="QB">QB</option>
          <option value="RB">RB</option>
          <option value="WR">WR</option>
          <option value="TE">TE</option>
          <option value="K">K</option>
          <option value="DST">DST</option>
        </select>

        <select
          data-testid="players-filter-rostered"
          value={filters.rostered}
          onChange={(event) => setFilters((previous) => ({ ...previous, rostered: event.target.value }))}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="">Rostered + Free Agents</option>
          <option value="true">Rostered</option>
          <option value="false">Free Agents</option>
        </select>

        <select
          data-testid="players-filter-sort-by"
          value={filters.sortBy}
          onChange={(event) => setFilters((previous) => ({ ...previous, sortBy: event.target.value }))}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="name">Sort: Name</option>
          <option value="age">Sort: Age</option>
          <option value="salary">Sort: Salary</option>
          <option value="yearsRemaining">Sort: Years Remaining</option>
        </select>

        <select
          data-testid="players-filter-sort-dir"
          value={filters.sortDir}
          onChange={(event) =>
            setFilters((previous) => ({ ...previous, sortDir: event.target.value as "asc" | "desc" }))
          }
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </form>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Player Import</h3>
            <p className="text-xs text-slate-400">
              Submit JSON array or CSV rows into the canonical player refresh pipeline. Ambiguous
              or duplicate-suspect rows stay reviewable in the commissioner queue.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={importFormat}
              onChange={(event) => setImportFormat(event.target.value as "json" | "csv")}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <button
              type="button"
              onClick={runImport}
              disabled={importBusy || !importPayload.trim()}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
            >
              {importBusy ? "Submitting..." : "Submit Refresh"}
            </button>
          </div>
        </div>

        <textarea
          value={importPayload}
          onChange={(event) => setImportPayload(event.target.value)}
          placeholder={
            importFormat === "json"
              ? '[{"externalId":"sample-1","name":"Sample Player","position":"WR","nflTeam":"BUF"}]'
              : "externalId,name,position,nflTeam,age,yearsPro,isRestricted\nsample-1,Sample Player,WR,BUF,24,3,false"
          }
          className="min-h-36 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
        />

        {importResult ? (
          <div className="rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
            <p>
              Submitted {importResult.submitted} | Normalized {importResult.normalized} | Created{" "}
              {importResult.created} | Updated {importResult.updated} | Skipped {importResult.skipped}
            </p>
            <p>
              Job {importResult.jobId} | Status {importResult.jobStatus} | Errors {importResult.errors}
            </p>
            <p className="mt-2">
              <Link
                href={`/commissioner/player-refresh/${importResult.jobId}`}
                className="text-sky-300 hover:text-sky-200"
              >
                Open refresh review job
              </Link>
            </p>
            {importErrors.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {importErrors.map((importError, index) => (
                  <li
                    key={`${importError}-${index}`}
                    className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-amber-200"
                  >
                    {importError}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <StandardTable testId="players-standard-table">
        <table className="min-w-full text-sm">
          <thead className="text-slate-300">
            <tr className="border-b border-slate-800">
              <StickyHeaderCell>Player</StickyHeaderCell>
              <StickyHeaderCell>Pos</StickyHeaderCell>
              <StickyHeaderCell>Team</StickyHeaderCell>
              <StickyHeaderCell align="right">Age</StickyHeaderCell>
              <StickyHeaderCell align="right">Salary</StickyHeaderCell>
              <StickyHeaderCell align="right">Years</StickyHeaderCell>
              <StickyHeaderCell>Roster</StickyHeaderCell>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className="border-b border-slate-800/70 last:border-b-0">
                <td className="px-3 py-2">
                  <Link href={`/players/${player.id}`} className="font-medium text-slate-100 hover:text-sky-300">
                    {player.name}
                  </Link>
                  {player.isRestricted ? (
                    <span className="ml-2 rounded border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300">
                      Restricted
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{player.position}</td>
                <td className="px-3 py-2">{player.nflTeam ?? "FA"}</td>
                <td className="px-3 py-2 text-right">{player.age ?? "-"}</td>
                <td className="px-3 py-2 text-right">{player.contract ? `$${player.contract.salary}` : "-"}</td>
                <td className="px-3 py-2 text-right">{player.contract?.yearsRemaining ?? "-"}</td>
                <td className="px-3 py-2">
                  {player.isRostered && player.ownerTeam ? (
                    <div className="flex items-center gap-2">
                      <StatusPill label="Rostered" tone="info" />
                      <Link href={`/teams/${player.ownerTeam.id}`} className="text-sky-300 hover:text-sky-200">
                        {player.ownerTeam.name}
                      </Link>
                    </div>
                  ) : (
                    <StatusPill label="Free Agent" tone="success" />
                  )}
                </td>
              </tr>
            ))}
            {players.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  No players match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </StandardTable>
    </div>
  );
}
