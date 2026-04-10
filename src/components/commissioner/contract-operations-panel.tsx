"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompatibilityNotice } from "@/components/layout/compatibility-notice";
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
import { Button, Input, Select, Checkbox } from "@/components/ui";
import { requestJson } from "@/lib/client-request";

type ContractRow = {
  id: string;
  salary: number;
  yearsTotal: number;
  yearsRemaining: number;
  isFranchiseTag: boolean;
  rookieOptionEligible: boolean;
  rookieOptionExercised: boolean;
  player: {
    id: string;
    name: string;
    position: string;
  };
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
};

type TeamOption = {
  id: string;
  name: string;
};

type PlayerOption = {
  id: string;
  name: string;
  position: string;
};

type Filters = {
  expiring: boolean;
  rookieOptionEligible: boolean;
  tagged: boolean;
};

type ContractCreateForm = {
  teamId: string;
  playerId: string;
  salary: string;
  yearsTotal: string;
  isRookieContract: boolean;
};

const POSITION_COLORS: Record<string, string> = {
  QB: "text-purple-300 bg-purple-900/40 border-purple-700/50",
  RB: "text-emerald-300 bg-emerald-900/40 border-emerald-700/50",
  WR: "text-sky-300 bg-sky-900/40 border-sky-700/50",
  TE: "text-amber-300 bg-amber-900/40 border-amber-700/50",
  K:  "text-slate-300 bg-slate-800/60 border-slate-700/50",
};

function positionBadgeClass(position: string) {
  return POSITION_COLORS[position] ?? "text-slate-300 bg-slate-800/60 border-slate-700/50";
}

function yearsRemainingClass(years: number) {
  if (years <= 0) return "text-red-400 font-semibold";
  if (years === 1) return "text-amber-300 font-semibold";
  return "text-slate-200";
}

const DEFAULT_FILTERS: Filters = {
  expiring: false,
  rookieOptionEligible: false,
  tagged: false,
};

export function ContractOperationsPanel() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [freeAgents, setFreeAgents] = useState<PlayerOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [salaryInput, setSalaryInput] = useState("");
  const [yearsInput, setYearsInput] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showLegacyRetirementNotice, setShowLegacyRetirementNotice] = useState(false);
  const [createForm, setCreateForm] = useState<ContractCreateForm>({
    teamId: "",
    playerId: "",
    salary: "1",
    yearsTotal: "1",
    isRookieContract: false,
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByTeam, setGroupByTeam] = useState(false);
  const [page, setPage] = useState(0);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);

  const PAGE_SIZE = 25;

  const {
    filters,
    setFilters,
    hasSavedFilters,
    saveCurrentFilters,
    applySavedFilters,
    clearSavedFilters,
    resetFilters,
  } = useSavedTableFilters<Filters>({
    storageKey: "dynasty:table-filters:contracts:v1",
    initialFilters: DEFAULT_FILTERS,
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.expiring) params.set("expiring", "true");
    if (filters.rookieOptionEligible) params.set("rookieOptionEligible", "true");
    if (filters.tagged) params.set("tagged", "true");
    return params.toString();
  }, [filters]);

  const filteredContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(
      (c) =>
        c.player.name.toLowerCase().includes(q) ||
        c.team.name.toLowerCase().includes(q) ||
        (c.team.abbreviation ?? "").toLowerCase().includes(q) ||
        c.player.position.toLowerCase().includes(q),
    );
  }, [contracts, searchQuery]);

  const groupedContracts = useMemo(() => {
    if (!groupByTeam) return null;
    const map = new Map<string, { team: ContractRow["team"]; contracts: ContractRow[] }>();
    for (const c of filteredContracts) {
      const existing = map.get(c.team.id);
      if (existing) {
        existing.contracts.push(c);
      } else {
        map.set(c.team.id, { team: c.team, contracts: [c] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.team.name.localeCompare(b.team.name));
  }, [filteredContracts, groupByTeam]);

  const paginatedContracts = useMemo(() => {
    if (groupByTeam) return filteredContracts;
    const start = page * PAGE_SIZE;
    return filteredContracts.slice(start, start + PAGE_SIZE);
  }, [filteredContracts, groupByTeam, page]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / PAGE_SIZE));

  const loadContracts = useCallback(async () => {
    const payload = await requestJson<{ contracts: ContractRow[] }>(
      `/api/contracts${queryString ? `?${queryString}` : ""}`,
      undefined,
      "Failed to load contracts.",
    );
    setContracts(payload.contracts);
  }, [queryString]);

  const loadCreateDependencies = useCallback(async () => {
    const [teamsPayload, playersPayload] = await Promise.all([
      requestJson<{ teams: TeamOption[] }>("/api/teams", undefined, "Failed to load teams."),
      requestJson<{ players: PlayerOption[] }>(
        "/api/players?rostered=false&sortBy=name&sortDir=asc",
        undefined,
        "Failed to load free agents.",
      ),
    ]);

    setTeams(teamsPayload.teams.map((team) => ({ id: team.id, name: team.name })));
    setFreeAgents(
      playersPayload.players.map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
      })),
    );
    setCreateForm((previous) => ({
      ...previous,
      teamId: previous.teamId || teamsPayload.teams[0]?.id || "",
      playerId: previous.playerId || playersPayload.players[0]?.id || "",
    }));
  }, []);

  useEffect(() => {
    const syncLegacyRoute = () => {
      const params = new URLSearchParams(window.location.search);
      setShowLegacyRetirementNotice(params.get("legacy") === "contracts");
    };

    syncLegacyRoute();
    window.addEventListener("popstate", syncLegacyRoute);
    return () => {
      window.removeEventListener("popstate", syncLegacyRoute);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    loadCreateDependencies().catch((requestError) => {
      if (!mounted) {
        return;
      }
      setMessage({
        type: "error",
        text:
          requestError instanceof Error
            ? requestError.message
            : "Failed to load contract operator dependencies.",
      });
    });

    return () => {
      mounted = false;
    };
  }, [loadCreateDependencies]);

  useEffect(() => {
    let mounted = true;

    loadContracts().catch((requestError) => {
      if (!mounted) {
        return;
      }
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to load contracts.",
      });
    });

    return () => {
      mounted = false;
    };
  }, [loadContracts]);

  useEffect(() => {
    if (!openMenuId) return;

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  function renderContractRow(contract: ContractRow) {
    const isEditing = editingId === contract.id;
    const canExerciseOption = contract.rookieOptionEligible && !contract.rookieOptionExercised;
    const canApplyTag = !contract.isFranchiseTag;
    const isMenuOpen = openMenuId === contract.id;

    if (isEditing) {
      return (
        <tr key={contract.id} className="border-b border-slate-700 bg-slate-800/60">
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${positionBadgeClass(contract.player.position)}`}>
                {contract.player.position}
              </span>
              <span className="font-medium text-slate-100">{contract.player.name}</span>
            </div>
          </td>
          <td className="px-3 py-2 text-slate-400">{contract.team.abbreviation ?? contract.team.name}</td>
          <td className="px-3 py-2 text-right">
            <Input type="number" min={1} value={salaryInput} onChange={(e) => setSalaryInput(e.target.value)} className="w-20 text-right" data-testid={`contract-edit-salary-${contract.id}`} />
          </td>
          <td className="px-3 py-2 text-right">
            <Input type="number" min={1} value={yearsInput} onChange={(e) => setYearsInput(e.target.value)} className="w-16 text-right" data-testid={`contract-edit-years-${contract.id}`} />
          </td>
          <td className="px-3 py-2 text-right text-slate-400">{contract.yearsRemaining}</td>
          <td className="px-3 py-2">
            <form onSubmit={saveEdit} className="flex items-center gap-1.5">
              <Button type="submit" variant="primary" disabled={busyAction !== null} loading={busyAction === `edit:${contract.id}`}>Save</Button>
              <Button type="button" variant="secondary" onClick={cancelEdit}>Cancel</Button>
            </form>
          </td>
        </tr>
      );
    }

    return (
      <tr key={contract.id} className="border-b border-slate-800/70 last:border-b-0 hover:bg-slate-800/30">
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${positionBadgeClass(contract.player.position)}`}>
              {contract.player.position}
            </span>
            <Link href={`/players/${contract.player.id}`} className="font-medium text-slate-100 hover:text-sky-300">
              {contract.player.name}
            </Link>
            {contract.isFranchiseTag ? <StatusPill label="Tagged" tone="warning" /> : null}
            {contract.rookieOptionEligible && !contract.rookieOptionExercised ? <StatusPill label="Option Eligible" tone="info" /> : null}
          </div>
        </td>
        <td className="px-3 py-2">
          <Link href={`/teams/${contract.team.id}`} className="text-slate-300 hover:text-sky-300">
            {contract.team.abbreviation ?? contract.team.name}
          </Link>
        </td>
        <td className="px-3 py-2 text-right font-mono text-slate-200">${contract.salary}</td>
        <td className="px-3 py-2 text-right text-slate-400">{contract.yearsTotal}</td>
        <td className={`px-3 py-2 text-right font-mono ${yearsRemainingClass(contract.yearsRemaining)}`}>
          {contract.yearsRemaining}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {canApplyTag && (
              <button
                type="button"
                onClick={() => applyFranchiseTag(contract.id)}
                disabled={busyAction !== null}
                className="inline-flex items-center rounded border border-amber-700/70 px-2.5 py-1 text-xs font-medium text-amber-200 transition-colors hover:border-amber-500 disabled:opacity-50"
                data-testid={`contract-primary-action-${contract.id}`}
              >
                {busyAction === `tag:${contract.id}` ? "Applying..." : "Apply Tag"}
              </button>
            )}
            <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : contract.id); }}
                aria-label="More actions"
                aria-expanded={isMenuOpen}
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                data-testid={`contract-overflow-menu-${contract.id}`}
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="2.5" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13.5" r="1.5" />
                </svg>
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[128px] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl">
                  <button type="button" onClick={() => { setOpenMenuId(null); beginEdit(contract); }} disabled={busyAction !== null} className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40" data-testid={`contract-overflow-item-edit-${contract.id}`}>
                    Edit
                  </button>
                  {canExerciseOption && (
                    <button type="button" onClick={() => { setOpenMenuId(null); exerciseRookieOption(contract.id); }} disabled={busyAction !== null} className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40" data-testid={`contract-overflow-item-exercise-option-${contract.id}`}>
                      Exercise Option
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  function toggleTeamCollapse(teamId: string) {
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function beginEdit(contract: ContractRow) {
    setEditingId(contract.id);
    setSalaryInput(String(contract.salary));
    setYearsInput(String(contract.yearsTotal));
  }

  function cancelEdit() {
    setEditingId(null);
    setSalaryInput("");
    setYearsInput("");
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = window.prompt(
      "Enter a reason for creating this contract.",
      "Commissioner contract entry",
    );
    if (reason === null) {
      return;
    }

    setBusyAction("create");
    setMessage(null);
    try {
      await requestJson(
        "/api/contracts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            teamId: createForm.teamId,
            playerId: createForm.playerId,
            salary: Number(createForm.salary),
            yearsTotal: Number(createForm.yearsTotal),
            isRookieContract: createForm.isRookieContract,
            reason,
          }),
        },
        "Failed to create contract.",
      );

      setMessage({ type: "success", text: "Contract created." });
      await Promise.all([loadContracts(), loadCreateDependencies()]);
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to create contract.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    const reason = window.prompt(
      "Enter a reason for updating this contract.",
      "Commissioner contract adjustment",
    );
    if (reason === null) {
      return;
    }

    setBusyAction(`edit:${editingId}`);
    setMessage(null);
    try {
      await requestJson(
        `/api/contracts/${editingId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            salary: Number.parseInt(salaryInput, 10),
            yearsTotal: Number.parseInt(yearsInput, 10),
            reason,
          }),
        },
        "Failed to update contract.",
      );

      setMessage({ type: "success", text: "Contract updated." });
      cancelEdit();
      await loadContracts();
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to update contract.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function applyFranchiseTag(contractId: string) {
    setBusyAction(`tag:${contractId}`);
    setMessage(null);
    try {
      await requestJson(
        `/api/contracts/${contractId}/franchise-tag`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        "Failed to apply franchise tag.",
      );

      setMessage({ type: "success", text: "Franchise tag applied." });
      await loadContracts();
    } catch (requestError) {
      setMessage({
        type: "error",
        text:
          requestError instanceof Error ? requestError.message : "Failed to apply franchise tag.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function exerciseRookieOption(contractId: string) {
    setBusyAction(`option:${contractId}`);
    setMessage(null);
    try {
      await requestJson(
        `/api/contracts/${contractId}/exercise-option`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        "Failed to exercise rookie option.",
      );

      setMessage({ type: "success", text: "Rookie option exercised." });
      await loadContracts();
    } catch (requestError) {
      setMessage({
        type: "error",
        text:
          requestError instanceof Error
            ? requestError.message
            : "Failed to exercise rookie option.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section
      id="contract-operations"
      className="rounded-lg border border-slate-800 bg-slate-900 p-4"
      data-testid="commissioner-contract-operations"
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Canonical operator flow</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-100">Contract Operations</h3>
        <p className="mt-2 text-sm text-slate-400">
          Create, adjust, and finalize contract maintenance tasks from Commissioner Operations instead
          of using a standalone utility route.
        </p>
      </div>

      {showLegacyRetirementNotice ? (
        <div className="mt-4">
          <CompatibilityNotice
            eyebrow="Retired compatibility route"
            title="Contracts Utility retired"
            description="The old /contracts route now lands in Commissioner Operations. Use this section for league-wide contract maintenance, then return to team and player detail for detailed review."
            links={[
              { href: "/teams", label: "Open Teams Directory" },
              { href: "/players", label: "Open Players Directory" },
            ]}
            tone="warning"
            testId="contracts-retired-notice"
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

      <div className="mt-4 rounded-lg border border-[var(--brand-structure-muted)] bg-[var(--brand-surface-card)]">
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-[var(--foreground)]">Create League Contract Entry</span>
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${showCreateForm ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showCreateForm && (
          <form onSubmit={createContract} className="border-t border-[var(--brand-structure-muted)] px-4 pb-4 pt-3">
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">
              Use this only for commissioner-maintained contract corrections or direct operator entry.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <Select
                value={createForm.teamId}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, teamId: event.target.value }))}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
              <Select
                value={createForm.playerId}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, playerId: event.target.value }))
                }
                className="md:col-span-2"
              >
                {freeAgents.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} ({player.position})
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={1}
                value={createForm.salary}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, salary: event.target.value }))}
                placeholder="Salary"
              />
              <Input
                type="number"
                min={1}
                value={createForm.yearsTotal}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, yearsTotal: event.target.value }))
                }
                placeholder="Years"
              />
              <label className="inline-flex items-center gap-2 text-sm text-[var(--foreground)]">
                <Checkbox
                  checked={createForm.isRookieContract}
                  onChange={(event) =>
                    setCreateForm((previous) => ({
                      ...previous,
                      isRookieContract: event.target.checked,
                    }))
                  }
                />
                Rookie Contract
              </label>
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={busyAction !== null || !createForm.teamId || !createForm.playerId}
              loading={busyAction === "create"}
              className="mt-3"
            >
              {busyAction === "create" ? "Creating..." : "Create Contract"}
            </Button>
          </form>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search player, team, or position…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            data-testid="contracts-search-input"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300 select-none">
            <button
              type="button"
              role="switch"
              aria-checked={groupByTeam}
              onClick={() => { setGroupByTeam((v) => !v); setPage(0); }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${groupByTeam ? "border-sky-600 bg-sky-600" : "border-slate-600 bg-slate-700"}`}
              data-testid="contracts-group-by-team-toggle"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${groupByTeam ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
            Group by team
          </label>

          <span className="text-xs text-slate-500">
            {filteredContracts.length} contract{filteredContracts.length !== 1 ? "s" : ""}
            {searchQuery ? ` matching "${searchQuery}"` : ""}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <TableFilterToolbar
          testIdPrefix="contracts-table-filters"
          title="Contract Filter Presets"
          chips={[
            {
              id: "all",
              label: "All Contracts",
              active: matchesQuickFilter(filters, DEFAULT_FILTERS),
              onClick: () => setFilters(DEFAULT_FILTERS),
            },
            {
              id: "expiring",
              label: "Expiring",
              active: matchesQuickFilter(filters, { ...DEFAULT_FILTERS, expiring: true }),
              onClick: () => applyQuickFilter(setFilters, { ...DEFAULT_FILTERS, expiring: true }),
            },
            {
              id: "option-eligible",
              label: "Option Eligible",
              active: matchesQuickFilter(filters, { ...DEFAULT_FILTERS, rookieOptionEligible: true }),
              onClick: () =>
                applyQuickFilter(setFilters, {
                  ...DEFAULT_FILTERS,
                  rookieOptionEligible: true,
                }),
            },
            {
              id: "tagged",
              label: "Tagged",
              active: matchesQuickFilter(filters, { ...DEFAULT_FILTERS, tagged: true }),
              onClick: () => applyQuickFilter(setFilters, { ...DEFAULT_FILTERS, tagged: true }),
            },
            {
              id: "expiring-tagged",
              label: "Expiring + Tagged",
              active: matchesQuickFilter(filters, {
                ...DEFAULT_FILTERS,
                expiring: true,
                tagged: true,
              }),
              onClick: () =>
                applyQuickFilter(setFilters, {
                  ...DEFAULT_FILTERS,
                  expiring: true,
                  tagged: true,
                }),
            },
          ]}
          hasSavedFilters={hasSavedFilters}
          onSaveCurrent={saveCurrentFilters}
          onApplySaved={applySavedFilters}
          onClearSaved={clearSavedFilters}
          onReset={resetFilters}
        />
      </div>

      <div className="mt-4">
        <StandardTable testId="contracts-standard-table">
          <table className="min-w-full text-sm">
            <thead className="text-slate-300">
              <tr className="border-b border-slate-800">
                <StickyHeaderCell>Player</StickyHeaderCell>
                <StickyHeaderCell>Team</StickyHeaderCell>
                <StickyHeaderCell align="right">Salary</StickyHeaderCell>
                <StickyHeaderCell align="right">Years Total</StickyHeaderCell>
                <StickyHeaderCell align="right">Years Left</StickyHeaderCell>
                <StickyHeaderCell>Actions</StickyHeaderCell>
              </tr>
            </thead>
            <tbody>
              {groupByTeam && groupedContracts ? (
                groupedContracts.map(({ team, contracts: teamContracts }) => {
                  const isCollapsed = collapsedTeams.has(team.id);
                  const capTotal = teamContracts.reduce((sum, c) => sum + c.salary, 0);
                  return (
                    <>
                      <tr
                        key={`group-${team.id}`}
                        className="cursor-pointer border-b border-slate-700 bg-slate-800/50 hover:bg-slate-800"
                        onClick={() => toggleTeamCollapse(team.id)}
                      >
                        <td colSpan={6} className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            <svg
                              className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="font-semibold text-slate-100">{team.name}</span>
                            {team.abbreviation && (
                              <span className="text-xs text-slate-500">{team.abbreviation}</span>
                            )}
                            <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
                              <span>{teamContracts.length} player{teamContracts.length !== 1 ? "s" : ""}</span>
                              <span className="font-mono text-slate-300">${capTotal} cap</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && teamContracts.map((contract) => {
                        const isEditing = editingId === contract.id;
                        const canExerciseOption = contract.rookieOptionEligible && !contract.rookieOptionExercised;
                        const canApplyTag = !contract.isFranchiseTag;
                        const isMenuOpen = openMenuId === contract.id;
                        return renderContractRow(contract);
                      })}
                    </>
                  );
                })
              ) : null}
              {!groupByTeam && paginatedContracts.map((contract) => renderContractRow(contract))}
              {filteredContracts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    {searchQuery ? `No contracts matching "${searchQuery}".` : "No contracts found for selected filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </StandardTable>
      </div>

      {!groupByTeam && filteredContracts.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredContracts.length)} of {filteredContracts.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs transition-colors ${
                  i === page
                    ? "border-sky-600 bg-sky-900/40 text-sky-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

    </section>
  );
}
