"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CompatibilityNotice } from "@/components/layout/compatibility-notice";
import {
  pickStatusMeta,
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
import { requestJson } from "@/lib/client-request";

type TeamOption = {
  id: string;
  name: string;
  abbreviation: string | null;
};

type PickRow = {
  id: string;
  seasonYear: number;
  round: number;
  overall: number | null;
  status: "available" | "used";
  originalTeam: TeamOption;
  currentTeam: TeamOption;
};

type Filters = {
  seasonYear: string;
};

const DEFAULT_FILTERS: Filters = {
  seasonYear: "",
};

export function PickOwnershipOperationsPanel() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});
  const [busyPickId, setBusyPickId] = useState<string | null>(null);
  const [showLegacyRetirementNotice, setShowLegacyRetirementNotice] = useState(false);
  const {
    filters,
    setFilters,
    hasSavedFilters,
    saveCurrentFilters,
    applySavedFilters,
    clearSavedFilters,
    resetFilters,
  } = useSavedTableFilters<Filters>({
    storageKey: "dynasty:table-filters:picks:v1",
    initialFilters: DEFAULT_FILTERS,
  });

  const availableYears = useMemo(() => {
    const values = Array.from(new Set(picks.map((pick) => pick.seasonYear)));
    return values.sort((a, b) => a - b);
  }, [picks]);

  const loadTeams = useCallback(async () => {
    const payload = await requestJson<{ teams: TeamOption[] }>(
      "/api/teams",
      undefined,
      "Failed to load teams.",
    );
    setTeams(
      payload.teams.map((team) => ({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
      })),
    );
  }, []);

  const loadPicks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.seasonYear) {
      params.set("seasonYear", filters.seasonYear);
    }

    const payload = await requestJson<{ picks: PickRow[] }>(
      `/api/picks${params.toString() ? `?${params.toString()}` : ""}`,
      undefined,
      "Failed to load picks.",
    );
    setPicks(payload.picks);
  }, [filters.seasonYear]);

  useEffect(() => {
    const syncLegacyRoute = () => {
      const params = new URLSearchParams(window.location.search);
      setShowLegacyRetirementNotice(params.get("legacy") === "picks");
    };

    syncLegacyRoute();
    window.addEventListener("popstate", syncLegacyRoute);
    return () => {
      window.removeEventListener("popstate", syncLegacyRoute);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    loadTeams().catch((requestError) => {
      if (!mounted) {
        return;
      }
      setMessage({
        type: "error",
        text:
          requestError instanceof Error ? requestError.message : "Failed to load commissioner teams.",
      });
    });

    return () => {
      mounted = false;
    };
  }, [loadTeams]);

  useEffect(() => {
    let mounted = true;

    loadPicks().catch((requestError) => {
      if (!mounted) {
        return;
      }
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to load pick ownership.",
      });
    });

    return () => {
      mounted = false;
    };
  }, [loadPicks]);

  const seasonFilterChips = useMemo(() => {
    const chips = [
      {
        id: "all-seasons",
        label: "All Seasons",
        values: { seasonYear: "" },
      },
    ];

    for (const year of availableYears.slice(0, 3)) {
      chips.push({
        id: `season-${year}`,
        label: String(year),
        values: { seasonYear: String(year) },
      });
    }

    return chips;
  }, [availableYears]);

  async function transferPick(pick: PickRow) {
    const newTeamId = transferTargets[pick.id];
    if (!newTeamId) {
      setMessage({ type: "error", text: "Select a destination team first." });
      return;
    }

    setBusyPickId(pick.id);
    setMessage(null);
    try {
      await requestJson(
        `/api/picks/${pick.id}/owner`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ newTeamId }),
        },
        "Failed to transfer pick.",
      );

      setMessage({ type: "success", text: "Pick ownership updated." });
      setTransferTargets((previous) => ({ ...previous, [pick.id]: "" }));
      await loadPicks();
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to transfer pick.",
      });
    } finally {
      setBusyPickId(null);
    }
  }

  return (
    <section
      id="pick-ownership-operations"
      className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5"
      data-testid="draft-pick-ownership-operations"
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Canonical operator flow</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-100">Pick Ownership Operations</h3>
        <p className="mt-2 text-sm text-slate-400">
          Review and transfer future pick ownership from within Picks & Draft instead of opening a
          separate utility route.
        </p>
      </div>

      {showLegacyRetirementNotice ? (
        <div className="mt-4">
          <CompatibilityNotice
            eyebrow="Retired compatibility route"
            title="Pick Ownership Utility retired"
            description="The old /picks route now lands in Picks & Draft. Use this section for commissioner pick transfers and the rookie pick summary above for detailed review."
            links={[
              { href: "/draft/rookie", label: "Open Rookie Draft" },
              { href: "/trades", label: "Open Trades" },
            ]}
            tone="warning"
            testId="picks-retired-notice"
          />
        </div>
      ) : null}

      {message ? (
        <div
          className={`mt-4 rounded-md px-4 py-3 text-sm ${
            message.type === "success"
              ? "border border-emerald-700 bg-emerald-950/40 text-emerald-200"
              : "border border-red-700 bg-red-950/40 text-red-200"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="mt-4">
        <TableFilterToolbar
          testIdPrefix="picks-table-filters"
          title="Pick Filter Presets"
          chips={seasonFilterChips.map((chip) => ({
            id: chip.id,
            label: chip.label,
            active: matchesQuickFilter(filters, chip.values),
            onClick: () => applyQuickFilter(setFilters, chip.values),
          }))}
          hasSavedFilters={hasSavedFilters}
          onSaveCurrent={saveCurrentFilters}
          onApplySaved={applySavedFilters}
          onClearSaved={clearSavedFilters}
          onReset={resetFilters}
        />
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 p-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Season Filter</span>
          <select
            data-testid="picks-filter-season-year"
            value={filters.seasonYear}
            onChange={(event) => setFilters((previous) => ({ ...previous, seasonYear: event.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          >
            <option value="">All seasons</option>
            {availableYears.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <StandardTable testId="picks-standard-table">
          <table className="min-w-full text-sm">
            <thead className="text-slate-300">
              <tr className="border-b border-slate-800">
                <StickyHeaderCell>Pick</StickyHeaderCell>
                <StickyHeaderCell>Original</StickyHeaderCell>
                <StickyHeaderCell>Current</StickyHeaderCell>
                <StickyHeaderCell>Status</StickyHeaderCell>
                <StickyHeaderCell>Transfer</StickyHeaderCell>
              </tr>
            </thead>
            <tbody>
              {picks.map((pick) => (
                <tr key={pick.id} className="border-b border-slate-800/70 last:border-b-0">
                  <td className="px-3 py-2">
                    {pick.seasonYear} R{pick.round}
                    {pick.overall ? ` · #${pick.overall}` : ""}
                  </td>
                  <td className="px-3 py-2">{pick.originalTeam.name}</td>
                  <td className="px-3 py-2">{pick.currentTeam.name}</td>
                  <td className="px-3 py-2">
                    <StatusPill {...pickStatusMeta(pick.status)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={transferTargets[pick.id] ?? ""}
                        onChange={(event) =>
                          setTransferTargets((previous) => ({
                            ...previous,
                            [pick.id]: event.target.value,
                          }))
                        }
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                      >
                        <option value="">Select Team</option>
                        {teams
                          .filter((team) => team.id !== pick.currentTeam.id)
                          .map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => transferPick(pick)}
                        disabled={busyPickId === pick.id}
                        className="rounded border border-slate-700 px-2 py-1 text-xs hover:border-slate-500 disabled:opacity-50"
                      >
                        {busyPickId === pick.id ? "Transferring..." : "Transfer"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {picks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    No picks found for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </StandardTable>
      </div>
    </section>
  );
}
