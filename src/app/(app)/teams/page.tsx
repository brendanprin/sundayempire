"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { requestJson } from "@/lib/client-request";
import {
  complianceStatusMeta,
  StandardTable,
  StatusPill,
  StickyHeaderCell,
  tableCellPaddingClass,
} from "@/components/table/standard-table";
import {
  TableDisplayControls,
  useTableDisplayPreferences,
} from "@/components/table/table-display-controls";
import {
  applyQuickFilter,
  matchesQuickFilter,
  TableFilterToolbar,
  useSavedTableFilters,
} from "@/components/table/table-filters";
import { TeamListItem } from "@/types/teams";

type SortKey = "name" | "rosterCount" | "capSpaceSoft";
type SortDirection = "asc" | "desc";
type TeamsColumnId = "team" | "owner" | "roster" | "capHit" | "capSpace" | "picks" | "compliance";
type TeamFilters = {
  compliance: "" | "needs-action" | "error" | "warning" | "ok";
};

type AuthLeagueRole = "COMMISSIONER" | "MEMBER";
type AuthMeActor = { leagueRole: AuthLeagueRole; teamId: string | null };

const DEFAULT_TEAM_FILTERS: TeamFilters = {
  compliance: "",
};

const TEAM_COLUMNS: {
  id: TeamsColumnId;
  label: string;
  alwaysVisible?: boolean;
}[] = [
  { id: "team", label: "Team", alwaysVisible: true },
  { id: "owner", label: "Owner" },
  { id: "roster", label: "Roster" },
  { id: "capHit", label: "Cap Hit" },
  { id: "capSpace", label: "Cap Space" },
  { id: "picks", label: "Picks (3y)" },
  { id: "compliance", label: "Compliance" },
];

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [actor, setActor] = useState<AuthMeActor | null>(null);
  const role = actor?.leagueRole ?? null;
  const isUnassigned = actor !== null && actor.leagueRole === "MEMBER" && actor.teamId === null;
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const {
    density: tableDensity,
    orderedColumns,
    visibleColumns,
    isColumnVisible,
    toggleDensity,
    toggleColumn,
    moveColumn,
  } = useTableDisplayPreferences({
    storageKey: "dynasty:table-display:teams:v2",
    columns: TEAM_COLUMNS,
  });

  const {
    filters: teamFilters,
    setFilters: setTeamFilters,
    hasSavedFilters,
    saveCurrentFilters,
    applySavedFilters,
    clearSavedFilters,
    resetFilters,
  } = useSavedTableFilters<TeamFilters>({
    storageKey: "dynasty:table-filters:teams:v1",
    initialFilters: DEFAULT_TEAM_FILTERS,
  });

  useEffect(() => {
    let mounted = true;

    Promise.all([
      requestJson<{ teams: TeamListItem[] }>("/api/teams?scope=all", undefined, "Failed to load teams."),
      requestJson<{ actor: AuthMeActor | null }>("/api/auth/me", undefined, "Failed to load actor role."),
    ])
      .then(([teamsPayload, authPayload]) => {
        if (!mounted) return;
        setTeams(teamsPayload.teams);
        setActor(authPayload.actor);
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load teams.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];

      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [teams, sortDirection, sortKey]);

  const filteredTeams = useMemo(() => {
    if (teamFilters.compliance === "") {
      return sortedTeams;
    }

    if (teamFilters.compliance === "needs-action") {
      return sortedTeams.filter((team) => team.complianceStatus !== "ok");
    }

    return sortedTeams.filter((team) => team.complianceStatus === teamFilters.compliance);
  }, [sortedTeams, teamFilters.compliance]);

  const visibleColumnIds = useMemo(
    () => visibleColumns.map((column) => column.id as TeamsColumnId),
    [visibleColumns],
  );
  const rowCellClass = tableCellPaddingClass(tableDensity);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 
          className="text-2xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Teams
        </h2>
        <p 
          className="mt-1 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Franchise directory for league-wide browse and scouting context.
        </p>
        {role === "COMMISSIONER" ? (
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            Team and owner administration is available in{" "}
            <Link
              href="/commissioner/teams"
              className="transition"
              style={{ color: "rgb(14, 165, 233)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgb(56, 189, 248)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgb(14, 165, 233)";
              }}
            >
              Commissioner Team Admin
            </Link>
            .
          </p>
        ) : null}
      </div>

      {isUnassigned ? (
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "rgb(30, 58, 138)",
            backgroundColor: "rgba(23, 37, 84, 0.4)",
          }}
          data-testid="no-team-onboarding-banner"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0"
              style={{ color: "rgb(96, 165, 250)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div>
              <p className="text-sm font-medium" style={{ color: "rgb(191, 219, 254)" }}>
                You don&apos;t have a team assigned yet
              </p>
              <p className="mt-1 text-sm" style={{ color: "rgb(147, 197, 253)" }}>
                You&apos;re a member of this league but haven&apos;t been assigned a team. Browse the teams below or contact your commissioner to get set up.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div 
          className="rounded-md px-4 py-3 text-sm text-red-200"
          style={{
            border: "1px solid rgb(185, 28, 28)",
            backgroundColor: "rgba(69, 10, 10, 0.4)",
          }}
        >
          {error}
        </div>
      ) : null}

      <TableFilterToolbar
        testIdPrefix="teams-table-filters"
        title="Team Filter Presets"
        chips={[
          {
            id: "all",
            label: "All Teams",
            active: matchesQuickFilter(teamFilters, { compliance: "" }),
            onClick: () => applyQuickFilter(setTeamFilters, { compliance: "" }),
          },
          {
            id: "needs-action",
            label: "Needs Action",
            active: matchesQuickFilter(teamFilters, { compliance: "needs-action" }),
            onClick: () => applyQuickFilter(setTeamFilters, { compliance: "needs-action" }),
          },
          {
            id: "error",
            label: "Errors",
            active: matchesQuickFilter(teamFilters, { compliance: "error" }),
            onClick: () => applyQuickFilter(setTeamFilters, { compliance: "error" }),
          },
          {
            id: "warning",
            label: "Warnings",
            active: matchesQuickFilter(teamFilters, { compliance: "warning" }),
            onClick: () => applyQuickFilter(setTeamFilters, { compliance: "warning" }),
          },
          {
            id: "ok",
            label: "Healthy",
            active: matchesQuickFilter(teamFilters, { compliance: "ok" }),
            onClick: () => applyQuickFilter(setTeamFilters, { compliance: "ok" }),
          },
        ]}
        hasSavedFilters={hasSavedFilters}
        onSaveCurrent={saveCurrentFilters}
        onApplySaved={applySavedFilters}
        onClearSaved={clearSavedFilters}
        onReset={resetFilters}
      />

      <TableDisplayControls
        testIdPrefix="teams-table-display"
        title="Table Display Controls"
        density={tableDensity}
        orderedColumns={orderedColumns}
        isColumnVisible={isColumnVisible}
        onToggleDensity={toggleDensity}
        onToggleColumn={toggleColumn}
        onMoveColumn={moveColumn}
      />

      <StandardTable testId="teams-standard-table">
        <table className="min-w-full text-sm" data-testid="teams-table" data-density={tableDensity}>
          <thead className="text-slate-300">
            <tr className="border-b border-slate-800">
              {visibleColumnIds.map((columnId) => {
                if (columnId === "team") {
                  return (
                    <HeaderButton
                      key={columnId}
                      label="Team"
                      isActive={sortKey === "name"}
                      sortDirection={sortDirection}
                      onClick={() => toggleSort("name")}
                    />
                  );
                }

                if (columnId === "owner") {
                  return <StickyHeaderCell key={columnId}>Owner</StickyHeaderCell>;
                }

                if (columnId === "roster") {
                  return (
                    <HeaderButton
                      key={columnId}
                      label="Roster"
                      isActive={sortKey === "rosterCount"}
                      sortDirection={sortDirection}
                      onClick={() => toggleSort("rosterCount")}
                    />
                  );
                }

                if (columnId === "capHit") {
                  return (
                    <StickyHeaderCell key={columnId} align="right">
                      Cap Hit
                    </StickyHeaderCell>
                  );
                }

                if (columnId === "capSpace") {
                  return (
                    <HeaderButton
                      key={columnId}
                      label="Cap Space"
                      isActive={sortKey === "capSpaceSoft"}
                      sortDirection={sortDirection}
                      onClick={() => toggleSort("capSpaceSoft")}
                      align="right"
                    />
                  );
                }

                if (columnId === "picks") {
                  return (
                    <StickyHeaderCell key={columnId} align="right">
                      Picks (3y)
                    </StickyHeaderCell>
                  );
                }

                return <StickyHeaderCell key={columnId}>Compliance</StickyHeaderCell>;
              })}
            </tr>
          </thead>
          <tbody>
            {filteredTeams.map((team) => (
              <tr key={team.id} className="border-b border-slate-800/70 last:border-b-0" data-testid="teams-table-row">
                {visibleColumnIds.map((columnId) => {
                  if (columnId === "team") {
                    return (
                      <td key={columnId} className={rowCellClass}>
                        <Link 
                          href={`/teams/${team.id}`} 
                          className="font-medium transition"
                          style={{ color: "rgb(14, 165, 233)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "rgb(56, 189, 248)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "rgb(14, 165, 233)";
                          }}
                        >
                          {team.name}
                        </Link>
                        <span 
                          className="ml-2 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {team.abbreviation}
                        </span>
                      </td>
                    );
                  }

                  if (columnId === "owner") {
                    return (
                      <td 
                        key={columnId} 
                        className={`${rowCellClass}`}
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {team.owner?.name ?? "Unassigned"}
                      </td>
                    );
                  }

                  if (columnId === "roster") {
                    return (
                      <td key={columnId} className={`${rowCellClass} text-right`}>
                        {team.rosterCount}
                      </td>
                    );
                  }

                  if (columnId === "capHit") {
                    return (
                      <td key={columnId} className={`${rowCellClass} text-right`}>
                        ${team.totalCapHit}
                      </td>
                    );
                  }

                  if (columnId === "capSpace") {
                    return (
                      <td key={columnId} className={`${rowCellClass} text-right`}>
                        ${team.capSpaceSoft}
                      </td>
                    );
                  }

                  if (columnId === "picks") {
                    return (
                      <td key={columnId} className={`${rowCellClass} text-right`}>
                        {team.futurePicksOwnedCount}
                      </td>
                    );
                  }

                  return (
                    <td key={columnId} className={rowCellClass}>
                      <div className="flex items-center gap-2">
                        <StatusPill {...complianceStatusMeta(team.complianceStatus)} />
                        <Link 
                          href={`/teams/${team.id}#compliance`} 
                          className="text-xs transition"
                          style={{ color: "rgb(14, 165, 233)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "rgb(56, 189, 248)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "rgb(14, 165, 233)";
                          }}
                        >
                          {team.complianceErrors ?? 0}E/{team.complianceWarnings ?? 0}W
                        </Link>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredTeams.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnIds.length} className="px-3 py-8 text-center text-slate-400">
                  No teams match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </StandardTable>
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
  isActive,
  sortDirection,
  align = "left",
}: {
  label: string;
  onClick: () => void;
  isActive: boolean;
  sortDirection: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <StickyHeaderCell align={align}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 font-medium text-slate-200 hover:text-white"
      >
        <span>{label}</span>
        {isActive ? <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </StickyHeaderCell>
  );
}
