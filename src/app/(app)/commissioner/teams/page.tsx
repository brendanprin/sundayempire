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

  async function saveOwner(ownerId: string) {
    const edit = ownerEdits[ownerId];
    if (!edit) {
      return;
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save owner.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTeam(teamId: string) {
    const edit = teamEdits[teamId];
    if (!edit) {
      return;
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save team.");
    } finally {
      setBusyAction(null);
    }
  }

  if (accessDenied) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Commissioner Team Administration</h2>
        <p className="mt-1 text-sm text-slate-400">
          Owner records and franchise administration controls are isolated from the Teams browse directory.
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form onSubmit={onOwnerSubmit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
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

        <form onSubmit={onOwnerSubmit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
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
      </section>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Owner Management</h3>
          <span className="text-xs text-slate-400">{owners.length} owners</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" data-testid="commissioner-team-admin-owners-table">
            <thead className="text-slate-300">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-right">Teams</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((owner) => {
                const edit = ownerEdits[owner.id] ?? { name: owner.name, email: owner.email ?? "" };
                return (
                  <tr key={owner.id} className="border-b border-slate-800/70 last:border-b-0">
                    <td className="px-3 py-2">
                      <input
                        value={edit.name}
                        onChange={(event) =>
                          setOwnerEdits((previous) => ({
                            ...previous,
                            [owner.id]: { ...edit, name: event.target.value },
                          }))
                        }
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={edit.email}
                        onChange={(event) =>
                          setOwnerEdits((previous) => ({
                            ...previous,
                            [owner.id]: { ...edit, email: event.target.value },
                          }))
                        }
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{owner.teamCount}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveOwner(owner.id)}
                        disabled={busyAction !== null}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-100 disabled:opacity-50"
                      >
                        {busyAction === `save-owner:${owner.id}` ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {owners.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    No owners found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Team Administration</h3>
          <span className="text-xs text-slate-400">{teams.length} teams</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" data-testid="commissioner-team-admin-teams-table">
            <thead className="text-slate-300">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Abbr</th>
                <th className="px-3 py-2 text-left">Division</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const edit = teamEdits[team.id] ?? {
                  name: team.name,
                  abbreviation: team.abbreviation ?? "",
                  divisionLabel: team.divisionLabel ?? "",
                  ownerId: team.owner?.id ?? "",
                };

                return (
                  <tr key={team.id} className="border-b border-slate-800/70 last:border-b-0">
                    <td className="px-3 py-2">
                      <input
                        value={edit.name}
                        onChange={(event) =>
                          setTeamEdits((previous) => ({
                            ...previous,
                            [team.id]: { ...edit, name: event.target.value },
                          }))
                        }
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
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
                        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
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
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
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
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                      >
                        <option value="">Unassigned</option>
                        {ownerSelectOptions.map((ownerOption) => (
                          <option key={ownerOption.id} value={ownerOption.id}>
                            {ownerOption.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveTeam(team.id)}
                        disabled={busyAction !== null}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-100 disabled:opacity-50"
                      >
                        {busyAction === `save-team:${team.id}` ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No teams found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/teams" className="inline-flex text-sm text-sky-300 hover:text-sky-200">
        Open browse-only Teams directory
      </Link>
    </div>
  );
}
