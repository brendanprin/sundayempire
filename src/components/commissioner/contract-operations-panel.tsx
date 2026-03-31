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
  const menuRef = useRef<HTMLDivElement | null>(null);

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

      <form onSubmit={createContract} className="mt-4 rounded-lg border border-[var(--brand-structure-muted)] bg-[var(--brand-surface-card)] p-4">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">Create League Contract Entry</h4>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Use this only for commissioner-maintained contract corrections or direct operator entry.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
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

      <div className="mt-4">
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

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-800 p-4 md:grid-cols-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            data-testid="contracts-filter-expiring"
            type="checkbox"
            checked={filters.expiring}
            onChange={(event) => setFilters((previous) => ({ ...previous, expiring: event.target.checked }))}
          />
          Expiring Only
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            data-testid="contracts-filter-option-eligible"
            type="checkbox"
            checked={filters.rookieOptionEligible}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, rookieOptionEligible: event.target.checked }))
            }
          />
          Rookie Option Eligible
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            data-testid="contracts-filter-tagged"
            type="checkbox"
            checked={filters.tagged}
            onChange={(event) => setFilters((previous) => ({ ...previous, tagged: event.target.checked }))}
          />
          Franchise Tagged
        </label>
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
              {contracts.map((contract) => (
                <tr key={contract.id} className="border-b border-slate-800/70 last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/players/${contract.player.id}`}
                        className="font-medium text-slate-100 hover:text-sky-300"
                      >
                        {contract.player.name}
                      </Link>
                      <span className="text-xs text-slate-400">{contract.player.position}</span>
                      {contract.isFranchiseTag ? (
                        <StatusPill label="Tagged" tone="warning" />
                      ) : (
                        <StatusPill label="Standard" tone="neutral" />
                      )}
                      {contract.rookieOptionEligible && !contract.rookieOptionExercised ? (
                        <StatusPill label="Option Eligible" tone="info" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/teams/${contract.team.id}`} className="hover:text-sky-300">
                      {contract.team.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">${contract.salary}</td>
                  <td className="px-3 py-2 text-right">{contract.yearsTotal}</td>
                  <td className="px-3 py-2 text-right">{contract.yearsRemaining}</td>
                  <td className="px-3 py-2">
                    {(() => {
                      // Determine primary action: highest-priority contextual action
                      const canExerciseOption =
                        contract.rookieOptionEligible && !contract.rookieOptionExercised;
                      const canApplyTag = !contract.isFranchiseTag;

                      const primaryAction = canExerciseOption
                        ? {
                            label:
                              busyAction === `option:${contract.id}`
                                ? "Applying..."
                                : "Exercise Option",
                            onClick: () => exerciseRookieOption(contract.id),
                            busy: busyAction === `option:${contract.id}`,
                            className:
                              "border-sky-700/70 text-sky-200 hover:border-sky-500",
                          }
                        : canApplyTag
                          ? {
                              label:
                                busyAction === `tag:${contract.id}`
                                  ? "Applying..."
                                  : "Apply Tag",
                              onClick: () => applyFranchiseTag(contract.id),
                              busy: busyAction === `tag:${contract.id}`,
                              className:
                                "border-amber-700/70 text-amber-200 hover:border-amber-500",
                            }
                          : null;

                      // Overflow items: Edit always; non-primary contextual actions
                      const overflowItems: Array<{
                        id: string;
                        label: string;
                        onClick: () => void;
                      }> = [
                        {
                          id: "edit",
                          label: "Edit",
                          onClick: () => {
                            setOpenMenuId(null);
                            beginEdit(contract);
                          },
                        },
                      ];

                      // When Exercise Option is primary, Apply Tag goes in overflow
                      if (canExerciseOption && canApplyTag) {
                        overflowItems.push({
                          id: "tag",
                          label: "Apply Tag",
                          onClick: () => {
                            setOpenMenuId(null);
                            applyFranchiseTag(contract.id);
                          },
                        });
                      }

                      const isMenuOpen = openMenuId === contract.id;

                      return (
                        <div className="flex items-center gap-1.5">
                          {primaryAction && (
                            <button
                              type="button"
                              onClick={primaryAction.onClick}
                              disabled={busyAction !== null}
                              className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${primaryAction.className}`}
                              data-testid={`contract-primary-action-${contract.id}`}
                            >
                              {primaryAction.label}
                            </button>
                          )}

                          <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(isMenuOpen ? null : contract.id);
                              }}
                              aria-label="More actions"
                              aria-expanded={isMenuOpen}
                              className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                              data-testid={`contract-overflow-menu-${contract.id}`}
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                              >
                                <circle cx="8" cy="2.5" r="1.5" />
                                <circle cx="8" cy="8" r="1.5" />
                                <circle cx="8" cy="13.5" r="1.5" />
                              </svg>
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-full z-20 mt-1 min-w-[128px] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl">
                                {overflowItems.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={item.onClick}
                                    disabled={busyAction !== null}
                                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                    data-testid={`contract-overflow-item-${item.id}-${contract.id}`}
                                  >
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {contracts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    No contracts found for selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </StandardTable>
      </div>

      {editingId ? (
        <form onSubmit={saveEdit} className="mt-4 rounded-lg border border-[var(--brand-structure-muted)] bg-[var(--brand-surface-card)] p-4">
          <h4 className="text-sm font-semibold text-[var(--foreground)]">Edit Contract</h4>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted-foreground)]">Salary</span>
              <Input
                value={salaryInput}
                onChange={(event) => setSalaryInput(event.target.value)}
                className="w-full"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted-foreground)]">Years Total</span>
              <Input
                value={yearsInput}
                onChange={(event) => setYearsInput(event.target.value)}
                className="w-full"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={busyAction !== null}
                loading={busyAction === `edit:${editingId}`}
              >
                {busyAction === `edit:${editingId}` ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}
