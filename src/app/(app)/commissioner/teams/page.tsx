"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/lib/client-request";

type AuthPayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
  };
};

type OwnerRow = {
  id: string;
  name: string;
  email: string | null;
  teamCount: number;
};

type OwnerPayload = {
  owners: OwnerRow[];
};

type TeamRow = {
  id: string;
  name: string;
  abbreviation: string | null;
  divisionLabel: string | null;
  owner: {
    id: string;
    name: string;
  } | null;
};

type TeamPayload = {
  teams: TeamRow[];
};

type OwnerForm = {
  name: string;
  email: string;
};

type TeamForm = {
  name: string;
  abbreviation: string;
  divisionLabel: string;
  ownerId: string;
};

type FranchiseStatus = "unassigned" | "assigned" | "needs-reassignment";

const EMPTY_OWNER_FORM: OwnerForm = {
  name: "",
  email: "",
};

const EMPTY_TEAM_FORM: TeamForm = {
  name: "",
  abbreviation: "",
  divisionLabel: "",
  ownerId: "",
};

export default function CommissionerTeamsPage() {
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [ownerForm, setOwnerForm] = useState<OwnerForm>(EMPTY_OWNER_FORM);
  const [teamForm, setTeamForm] = useState<TeamForm>(EMPTY_TEAM_FORM);
  const [ownerEdits, setOwnerEdits] = useState<Record<string, OwnerForm>>({});
  const [teamEdits, setTeamEdits] = useState<Record<string, TeamForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [memberAssignTargets, setMemberAssignTargets] = useState<Record<string, string>>({});
  const [accessDenied, setAccessDenied] = useState(false);

  const reloadWorkspace = useCallback(async () => {
    const authPayload = await requestJson<AuthPayload>("/api/auth/me");
    if (authPayload.actor.leagueRole !== "COMMISSIONER") {
      setAccessDenied(true);
      window.location.replace("/teams");
      return;
    }

    setAccessDenied(false);
    const [ownersPayload, teamsPayload] = await Promise.all([
      requestJson<OwnerPayload>("/api/owners"),
      requestJson<TeamPayload>("/api/teams?scope=all"),
    ]);

    setOwners(ownersPayload.owners);
    setTeams(teamsPayload.teams);
  }, []);

  useEffect(() => {
    let mounted = true;

    reloadWorkspace()
      .then(() => {
        if (!mounted) return;
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load commissioner team administration workspace.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [reloadWorkspace]);

  useEffect(() => {
    setOwnerEdits((previous) => {
      const next = { ...previous };
      owners.forEach((owner) => {
        if (!next[owner.id]) {
          next[owner.id] = {
            name: owner.name,
            email: owner.email ?? "",
          };
        }
      });
      return next;
    });
  }, [owners]);

  useEffect(() => {
    setTeamEdits((previous) => {
      const next = { ...previous };
      teams.forEach((team) => {
        if (!next[team.id]) {
          next[team.id] = {
            name: team.name,
            abbreviation: team.abbreviation ?? "",
            divisionLabel: team.divisionLabel ?? "",
            ownerId: team.owner?.id ?? "",
          };
        }
      });
      return next;
    });
  }, [teams]);

  const ownerSelectOptions = useMemo(
    () =>
      owners.map((owner) => ({
        id: owner.id,
        label: owner.name,
      })),
    [owners],
  );

  const ownerById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  const leagueStats = useMemo(() => {
    const totalTeams = teams.length;
    const assignedTeams = teams.filter((t) => t.owner !== null).length;
    const unassignedTeams = totalTeams - assignedTeams;
    const membersWithoutTeam = owners.filter((o) => o.teamCount === 0).length;
    return { totalTeams, assignedTeams, unassignedTeams, membersWithoutTeam };
  }, [teams, owners]);

  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) => {
        if (!a.owner && b.owner) return -1;
        if (a.owner && !b.owner) return 1;
        return a.name.localeCompare(b.name);
      }),
    [teams],
  );

  const unassignedOwners = useMemo(
    () =>
      owners
        .filter((o) => o.teamCount === 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [owners],
  );

  const unassignedTeams = useMemo(
    () =>
      teams
        .filter((t) => t.owner === null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );

  function onOwnerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  async function createOwner() {
    if (ownerForm.name.trim().length < 2) {
      setError("Owner name must be at least 2 characters.");
      return;
    }

    setBusyAction("create-owner");
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        "/api/owners",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: ownerForm.name.trim(),
            email: ownerForm.email.trim() || null,
          }),
        },
        "Failed to create owner.",
      );
      setOwnerForm(EMPTY_OWNER_FORM);
      setMessage("Owner created.");
      await reloadWorkspace();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create owner.");
    } finally {
      setBusyAction(null);
    }
  }

  async function createTeam() {
    if (teamForm.name.trim().length < 2) {
      setError("Team name must be at least 2 characters.");
      return;
    }

    setBusyAction("create-team");
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        "/api/teams",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: teamForm.name.trim(),
            abbreviation: teamForm.abbreviation.trim() || null,
            divisionLabel: teamForm.divisionLabel.trim() || null,
            ownerId: teamForm.ownerId || null,
          }),
        },
        "Failed to create team.",
      );
      setTeamForm(EMPTY_TEAM_FORM);
      setMessage("Team created.");
      await reloadWorkspace();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create team.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveOwner(ownerId: string): Promise<boolean> {
    const edit = ownerEdits[ownerId];
    if (!edit) {
      return false;
    }

    setBusyAction(`save-owner:${ownerId}`);
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        `/api/owners/${ownerId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: edit.name.trim(),
            email: edit.email.trim() || null,
          }),
        },
        "Failed to save owner.",
      );
      setMessage("Owner updated.");
      await reloadWorkspace();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save owner.");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function discardOwnerEdit(ownerId: string) {
    const owner = owners.find((o) => o.id === ownerId);
    if (!owner) return;
    setOwnerEdits((previous) => ({
      ...previous,
      [ownerId]: { name: owner.name, email: owner.email ?? "" },
    }));
  }

  function cancelOwnerEdit(ownerId: string) {
    discardOwnerEdit(ownerId);
    setEditingOwnerId(null);
  }

  function startEditingOwner(ownerId: string) {
    if (editingOwnerId && editingOwnerId !== ownerId) {
      discardOwnerEdit(editingOwnerId);
    }
    setEditingOwnerId(ownerId);
  }

  async function assignOwnerToTeam(ownerId: string, teamId: string): Promise<boolean> {
    const team = teams.find((t) => t.id === teamId);
    const owner = owners.find((o) => o.id === ownerId);
    if (!team || !owner) return false;

    setBusyAction(`assign-to-team:${ownerId}`);
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        `/api/teams/${teamId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: team.name,
            abbreviation: team.abbreviation ?? null,
            divisionLabel: team.divisionLabel ?? null,
            ownerId: ownerId,
          }),
        },
        "Failed to assign member to franchise.",
      );
      setMessage(`${owner.name} assigned to ${team.name}.`);
      setMemberAssignTargets((previous) => {
        const next = { ...previous };
        delete next[ownerId];
        return next;
      });
      await reloadWorkspace();
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Failed to assign member to franchise.",
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTeam(teamId: string): Promise<boolean> {
    const edit = teamEdits[teamId];
    if (!edit) {
      return false;
    }

    setBusyAction(`save-team:${teamId}`);
    setError(null);
    setMessage(null);

    try {
      await requestJson(
        `/api/teams/${teamId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: edit.name.trim(),
            abbreviation: edit.abbreviation.trim() || null,
            divisionLabel: edit.divisionLabel.trim() || null,
            ownerId: edit.ownerId || null,
          }),
        },
        "Failed to save team.",
      );
      setMessage("Team updated.");
      await reloadWorkspace();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save team.");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function discardTeamEdit(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setTeamEdits((previous) => ({
      ...previous,
      [teamId]: {
        name: team.name,
        abbreviation: team.abbreviation ?? "",
        divisionLabel: team.divisionLabel ?? "",
        ownerId: team.owner?.id ?? "",
      },
    }));
  }

  function cancelTeamEdit(teamId: string) {
    discardTeamEdit(teamId);
    setEditingTeamId(null);
  }

  function startEditingTeam(teamId: string) {
    if (editingTeamId && editingTeamId !== teamId) {
      discardTeamEdit(editingTeamId);
    }
    setEditingTeamId(teamId);
  }

  if (accessDenied) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Commissioner Team Administration</h2>
        <p className="mt-1 text-sm text-slate-400">
          Assign and manage franchise control across all league teams.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs text-slate-500">Total Teams</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">{leagueStats.totalTeams}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs text-slate-500">Assigned</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">{leagueStats.assignedTeams}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs text-slate-500">Unassigned</p>
          <p
            className={`mt-1 text-2xl font-semibold ${leagueStats.unassignedTeams > 0 ? "text-amber-400" : "text-slate-100"}`}
          >
            {leagueStats.unassignedTeams}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs text-slate-500">Without Team</p>
          <p
            className={`mt-1 text-2xl font-semibold ${leagueStats.membersWithoutTeam > 0 ? "text-amber-400" : "text-slate-100"}`}
          >
            {leagueStats.membersWithoutTeam}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs text-slate-500">Pending Invites</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">0</p>
        </div>
      </div>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Franchise Assignments</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              One row per franchise. Unassigned franchises appear first.
            </p>
          </div>
          <span className="text-xs text-slate-400">{teams.length} teams</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" data-testid="commissioner-team-admin-teams-table">
            <thead className="text-slate-300">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left">Team Name</th>
                <th className="px-3 py-2 text-left">Abbr</th>
                <th className="px-3 py-2 text-left">Division</th>
                <th className="px-3 py-2 text-left">Assigned Member</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team) => {
                const edit = teamEdits[team.id] ?? {
                  name: team.name,
                  abbreviation: team.abbreviation ?? "",
                  divisionLabel: team.divisionLabel ?? "",
                  ownerId: team.owner?.id ?? "",
                };
                const isEditing = editingTeamId === team.id;

                const status: FranchiseStatus = !team.owner
                  ? "unassigned"
                  : (ownerById.get(team.owner.id)?.teamCount ?? 0) > 1
                    ? "needs-reassignment"
                    : "assigned";

                const savedMemberEmail = team.owner
                  ? (ownerById.get(team.owner.id)?.email ?? null)
                  : null;
                const editMemberEmail = edit.ownerId
                  ? (ownerById.get(edit.ownerId)?.email ?? null)
                  : null;

                const statusBadge =
                  status === "unassigned" ? (
                    <span
                      data-testid={`franchise-status-${team.id}`}
                      className="whitespace-nowrap rounded-full bg-amber-900/40 px-2 py-0.5 text-xs text-amber-400"
                    >
                      Unassigned
                    </span>
                  ) : status === "needs-reassignment" ? (
                    <span
                      data-testid={`franchise-status-${team.id}`}
                      className="whitespace-nowrap rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400"
                    >
                      Needs Reassignment
                    </span>
                  ) : (
                    <span
                      data-testid={`franchise-status-${team.id}`}
                      className="whitespace-nowrap rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-400"
                    >
                      Assigned
                    </span>
                  );

                if (isEditing) {
                  return (
                    <tr
                      key={team.id}
                      data-testid={`franchise-row-${team.id}`}
                      className="border-b border-slate-800/70 bg-slate-900/60 outline outline-1 outline-sky-800/60 last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <input
                          value={edit.name}
                          onChange={(event) =>
                            setTeamEdits((previous) => ({
                              ...previous,
                              [team.id]: { ...edit, name: event.target.value },
                            }))
                          }
                          className="w-full min-w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={edit.abbreviation}
                          onChange={(event) =>
                            setTeamEdits((previous) => ({
                              ...previous,
                              [team.id]: { ...edit, abbreviation: event.target.value },
                            }))
                          }
                          className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={edit.divisionLabel}
                          onChange={(event) =>
                            setTeamEdits((previous) => ({
                              ...previous,
                              [team.id]: { ...edit, divisionLabel: event.target.value },
                            }))
                          }
                          className="w-full min-w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={edit.ownerId}
                          onChange={(event) =>
                            setTeamEdits((previous) => ({
                              ...previous,
                              [team.id]: { ...edit, ownerId: event.target.value },
                            }))
                          }
                          className="w-full min-w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                        >
                          <option value="">Unassigned</option>
                          {ownerSelectOptions.map((ownerOption) => (
                            <option key={ownerOption.id} value={ownerOption.id}>
                              {ownerOption.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {editMemberEmail ?? <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2">{statusBadge}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            data-testid={`franchise-save-btn-${team.id}`}
                            onClick={async () => {
                              const saved = await saveTeam(team.id);
                              if (saved) setEditingTeamId(null);
                            }}
                            disabled={busyAction !== null}
                            className="rounded border border-sky-700 bg-sky-900/40 px-2 py-1 text-xs text-sky-200 disabled:opacity-50"
                          >
                            {busyAction === `save-team:${team.id}` ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            data-testid={`franchise-cancel-btn-${team.id}`}
                            onClick={() => cancelTeamEdit(team.id)}
                            disabled={busyAction !== null}
                            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={team.id}
                    data-testid={`franchise-row-${team.id}`}
                    className={`border-b border-slate-800/70 last:border-b-0 ${status === "unassigned" ? "bg-amber-950/10" : ""}`}
                  >
                    <td className="px-3 py-2 text-sm text-slate-100">{team.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {team.abbreviation || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {team.divisionLabel || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {team.owner ? (
                        <span className="text-sm text-slate-100">{team.owner.name}</span>
                      ) : (
                        <span className="text-xs text-amber-500">No member assigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {savedMemberEmail ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2">{statusBadge}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {status === "unassigned" ? (
                          <button
                            type="button"
                            data-testid={`franchise-assign-btn-${team.id}`}
                            onClick={() => startEditingTeam(team.id)}
                            disabled={busyAction !== null}
                            className="rounded border border-amber-700/60 bg-amber-900/20 px-2 py-1 text-xs text-amber-300 disabled:opacity-50"
                          >
                            Assign Member
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              data-testid={`franchise-reassign-btn-${team.id}`}
                              onClick={() => startEditingTeam(team.id)}
                              disabled={busyAction !== null}
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-50"
                            >
                              Reassign
                            </button>
                            <button
                              type="button"
                              data-testid={`franchise-edit-btn-${team.id}`}
                              onClick={() => startEditingTeam(team.id)}
                              disabled={busyAction !== null}
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No teams found. Add a franchise using League Setup Utilities below.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section
        data-testid="commissioner-team-admin-owners-table"
        className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-300">Unassigned / Pending Members</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              People not currently attached to a franchise.
            </p>
          </div>
          {unassignedOwners.length > 0 ? (
            <span className="rounded-full bg-amber-900/40 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              {unassignedOwners.length}
            </span>
          ) : null}
        </div>

        {unassignedOwners.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">
            All members are assigned to a franchise.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {unassignedOwners.map((owner) => {
              const edit = ownerEdits[owner.id] ?? { name: owner.name, email: owner.email ?? "" };
              const isEditing = editingOwnerId === owner.id;
              const assignTarget = memberAssignTargets[owner.id] ?? "";
              const isSavingOwner = busyAction === `save-owner:${owner.id}`;
              const isAssigning = busyAction === `assign-to-team:${owner.id}`;

              return (
                <li
                  key={owner.id}
                  data-testid={`member-row-${owner.id}`}
                  className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2.5"
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">
                    {owner.name.charAt(0).toUpperCase()}
                  </div>

                  {isEditing ? (
                    <>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <input
                          value={edit.name}
                          onChange={(event) =>
                            setOwnerEdits((previous) => ({
                              ...previous,
                              [owner.id]: { ...edit, name: event.target.value },
                            }))
                          }
                          placeholder="Name"
                          className="min-w-32 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                        />
                        <input
                          value={edit.email}
                          onChange={(event) =>
                            setOwnerEdits((previous) => ({
                              ...previous,
                              [owner.id]: { ...edit, email: event.target.value },
                            }))
                          }
                          placeholder="Email"
                          className="min-w-40 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                        />
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          data-testid={`member-save-btn-${owner.id}`}
                          onClick={async () => {
                            const saved = await saveOwner(owner.id);
                            if (saved) setEditingOwnerId(null);
                          }}
                          disabled={busyAction !== null}
                          className="rounded border border-sky-700 bg-sky-900/40 px-2 py-1 text-xs text-sky-200 disabled:opacity-50"
                        >
                          {isSavingOwner ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          data-testid={`member-cancel-btn-${owner.id}`}
                          onClick={() => cancelOwnerEdit(owner.id)}
                          disabled={busyAction !== null}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-100">{owner.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {owner.email ?? (
                            <span className="italic text-slate-600">No email on record</span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                        <select
                          data-testid={`member-assign-select-${owner.id}`}
                          value={assignTarget}
                          onChange={(event) =>
                            setMemberAssignTargets((previous) => ({
                              ...previous,
                              [owner.id]: event.target.value,
                            }))
                          }
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                        >
                          <option value="">Assign to franchise…</option>
                          {unassignedTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                          {unassignedTeams.length === 0 ? (
                            <option disabled value="">
                              No unassigned franchises
                            </option>
                          ) : null}
                        </select>
                        <button
                          type="button"
                          data-testid={`member-assign-btn-${owner.id}`}
                          onClick={() => {
                            if (assignTarget) assignOwnerToTeam(owner.id, assignTarget);
                          }}
                          disabled={!assignTarget || busyAction !== null}
                          className="rounded border border-amber-700/60 bg-amber-900/20 px-2 py-1 text-xs text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isAssigning ? "Assigning..." : "Assign"}
                        </button>
                        <button
                          type="button"
                          data-testid={`member-edit-btn-${owner.id}`}
                          onClick={() => startEditingOwner(owner.id)}
                          disabled={busyAction !== null}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
                        >
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-slate-700/50 bg-slate-950/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">League Setup Utilities</h3>
          <p className="mt-0.5 text-xs text-slate-500">Create new franchises and members.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form onSubmit={onOwnerSubmit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold">Create Owner</h3>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Name</span>
              <input
                data-testid="commissioner-team-admin-create-owner-name"
                value={ownerForm.name}
                onChange={(event) => setOwnerForm((previous) => ({ ...previous, name: event.target.value }))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Email</span>
              <input
                data-testid="commissioner-team-admin-create-owner-email"
                value={ownerForm.email}
                onChange={(event) => setOwnerForm((previous) => ({ ...previous, email: event.target.value }))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={createOwner}
              disabled={busyAction !== null}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "create-owner" ? "Creating..." : "Create Owner"}
            </button>
          </form>

          <form onSubmit={onOwnerSubmit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold">Create Team</h3>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Team Name</span>
              <input
                data-testid="commissioner-team-admin-create-team-name"
                value={teamForm.name}
                onChange={(event) => setTeamForm((previous) => ({ ...previous, name: event.target.value }))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs text-slate-400">
                <span>Abbreviation</span>
                <input
                  data-testid="commissioner-team-admin-create-team-abbr"
                  value={teamForm.abbreviation}
                  onChange={(event) =>
                    setTeamForm((previous) => ({ ...previous, abbreviation: event.target.value }))
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
              <label className="block space-y-1 text-xs text-slate-400">
                <span>Division</span>
                <input
                  data-testid="commissioner-team-admin-create-team-division"
                  value={teamForm.divisionLabel}
                  onChange={(event) =>
                    setTeamForm((previous) => ({ ...previous, divisionLabel: event.target.value }))
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Owner</span>
              <select
                data-testid="commissioner-team-admin-create-team-owner"
                value={teamForm.ownerId}
                onChange={(event) => setTeamForm((previous) => ({ ...previous, ownerId: event.target.value }))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              >
                <option value="">Unassigned</option>
                {ownerSelectOptions.map((ownerOption) => (
                  <option key={ownerOption.id} value={ownerOption.id}>
                    {ownerOption.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={createTeam}
              disabled={busyAction !== null}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "create-team" ? "Creating..." : "Create Team"}
            </button>
          </form>
        </div>
      </section>

      <Link href="/teams" className="inline-flex text-sm text-sky-300 hover:text-sky-200">
        Open browse-only Teams directory
      </Link>
    </div>
  );
}
