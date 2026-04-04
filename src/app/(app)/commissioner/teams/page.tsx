"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/lib/client-request";
import { AssignmentSummaryStrip } from "./_components/assignment-summary-strip";
import { FranchiseTable } from "./_components/franchise-table";
import { TeamDetailPanel } from "./_components/team-detail-panel";
import { MemberList } from "./_components/member-list";
import { SetupUtilitiesSection } from "./_components/setup-utilities-section";
import type {
  OwnerRow,
  TeamRow,
  OwnerForm,
  TeamForm,
  AssignmentFlow,
} from "./_components/types";
import { REMOVE_ASSIGNMENT } from "./_components/types";

type AuthPayload = { actor: { leagueRole: "COMMISSIONER" | "MEMBER" } };
type OwnerPayload = { owners: OwnerRow[] };
type TeamPayload = { teams: TeamRow[] };

const EMPTY_OWNER_FORM: OwnerForm = { name: "", email: "" };
const EMPTY_TEAM_FORM: TeamForm = { name: "", abbreviation: "", divisionLabel: "", ownerId: "" };

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
  const [setupOpen, setSetupOpen] = useState(false);
  const [assignmentFlow, setAssignmentFlow] = useState<AssignmentFlow | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

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
      .then(() => { if (mounted) setError(null); })
      .catch((requestError) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load commissioner team administration workspace.",
        );
      });
    return () => { mounted = false; };
  }, [reloadWorkspace]);

  // Keep edit buffers in sync with server data without overwriting in-progress edits
  useEffect(() => {
    setOwnerEdits((prev) => {
      const next = { ...prev };
      owners.forEach((owner) => {
        if (!next[owner.id]) {
          next[owner.id] = { name: owner.name, email: owner.email ?? "" };
        }
      });
      return next;
    });
  }, [owners]);

  useEffect(() => {
    setTeamEdits((prev) => {
      const next = { ...prev };
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

  // ── Derived data ──────────────────────────────────────────────────────────

  const ownerById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  const ownerSelectOptions = useMemo(
    () => owners.map((o) => ({ id: o.id, label: o.name })),
    [owners],
  );

  const leagueStats = useMemo(() => {
    const totalTeams = teams.length;
    const assignedTeams = teams.filter((t) => t.owner !== null).length;
    return {
      totalTeams,
      assignedTeams,
      unassignedTeams: totalTeams - assignedTeams,
      membersWithoutTeam: owners.filter((o) => o.teamCount === 0).length,
    };
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
    () => owners.filter((o) => o.teamCount === 0).sort((a, b) => a.name.localeCompare(b.name)),
    [owners],
  );

  const unassignedTeams = useMemo(
    () => teams.filter((t) => t.owner === null).sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );

  // ── Owner actions ─────────────────────────────────────────────────────────

  async function createOwner() {
    if (ownerForm.name.trim().length < 2) {
      setError("Member name must be at least 2 characters.");
      return;
    }
    setBusyAction("create-owner");
    setError(null);
    setMessage(null);
    try {
      await requestJson("/api/owners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: ownerForm.name.trim(), email: ownerForm.email.trim() || null }),
      }, "Failed to add league member.");
      setOwnerForm(EMPTY_OWNER_FORM);
      setMessage("League member added.");
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add league member.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveOwner(ownerId: string): Promise<void> {
    const edit = ownerEdits[ownerId];
    if (!edit) return;
    setBusyAction(`save-owner:${ownerId}`);
    setError(null);
    setMessage(null);
    try {
      await requestJson(`/api/owners/${ownerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: edit.name.trim(), email: edit.email.trim() || null }),
      }, `Failed to update member "${edit.name}".`);
      setMessage("Member updated.");
      setEditingOwnerId(null);
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update member "${edit.name}".`);
    } finally {
      setBusyAction(null);
    }
  }

  function discardOwnerEdit(ownerId: string) {
    const owner = owners.find((o) => o.id === ownerId);
    if (!owner) return;
    setOwnerEdits((prev) => ({ ...prev, [ownerId]: { name: owner.name, email: owner.email ?? "" } }));
  }

  function startEditingOwner(ownerId: string) {
    if (editingOwnerId && editingOwnerId !== ownerId) discardOwnerEdit(editingOwnerId);
    setEditingOwnerId(ownerId);
  }

  async function assignOwnerToTeam(ownerId: string): Promise<void> {
    const teamId = memberAssignTargets[ownerId];
    if (!teamId) return;
    const team = teams.find((t) => t.id === teamId);
    const owner = owners.find((o) => o.id === ownerId);
    if (!team || !owner) return;

    setBusyAction(`assign-to-team:${ownerId}`);
    setError(null);
    setMessage(null);
    try {
      await requestJson(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: team.name,
          abbreviation: team.abbreviation ?? null,
          divisionLabel: team.divisionLabel ?? null,
          ownerId,
        }),
      }, `Failed to assign ${owner.name} to ${team.name}.`);
      setMessage(`${owner.name} assigned to ${team.name}.`);
      setMemberAssignTargets((prev) => { const next = { ...prev }; delete next[ownerId]; return next; });
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to assign ${owner.name} to ${team.name}.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function bulkAssign() {
    const entries = Object.entries(memberAssignTargets).filter(([, teamId]) => !!teamId);
    if (entries.length === 0) return;
    setBusyAction("bulk-assign");
    setError(null);
    setMessage(null);
    try {
      const results = await Promise.allSettled(
        entries.map(([ownerId, teamId]) => {
          const team = teams.find((t) => t.id === teamId);
          const owner = owners.find((o) => o.id === ownerId);
          if (!team || !owner) return Promise.reject(new Error("Missing team or member data."));
          return requestJson(`/api/teams/${teamId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: team.name,
              abbreviation: team.abbreviation ?? null,
              divisionLabel: team.divisionLabel ?? null,
              ownerId,
            }),
          }, `Failed to assign ${owner.name} to ${team.name}.`);
        }),
      );
      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      // Always clear the entries that succeeded so they don't sit in pending state
      const failedOwnerIds = new Set(
        entries
          .filter((_, i) => results[i].status === "rejected")
          .map(([ownerId]) => ownerId),
      );
      setMemberAssignTargets((prev) => {
        const next = { ...prev };
        for (const [ownerId] of entries) {
          if (!failedOwnerIds.has(ownerId)) delete next[ownerId];
        }
        return next;
      });
      if (failed.length > 0) {
        const reasons = failed
          .map((r) => (r.status === "rejected" && r.reason instanceof Error ? r.reason.message : "Unknown error"))
          .join(" ");
        setError(`${failed.length} assignment(s) failed. ${succeeded} succeeded. ${reasons}`);
      } else {
        setMessage(`${succeeded} member${succeeded === 1 ? "" : "s"} assigned to their franchises.`);
      }
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk assignment failed.");
    } finally {
      setBusyAction(null);
    }
  }

  // ── Team actions ──────────────────────────────────────────────────────────

  async function createTeam() {
    if (teamForm.name.trim().length < 2) {
      setError("Team name must be at least 2 characters.");
      return;
    }
    setBusyAction("create-team");
    setError(null);
    setMessage(null);
    try {
      await requestJson("/api/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: teamForm.name.trim(),
          abbreviation: teamForm.abbreviation.trim() || null,
          divisionLabel: teamForm.divisionLabel.trim() || null,
          ownerId: teamForm.ownerId || null,
        }),
      }, "Failed to create team.");
      setTeamForm(EMPTY_TEAM_FORM);
      setMessage("Team created.");
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTeam(teamId: string): Promise<void> {
    const edit = teamEdits[teamId];
    const team = teams.find((t) => t.id === teamId);
    if (!edit || !team) return;
    setBusyAction(`save-team:${teamId}`);
    setError(null);
    setMessage(null);
    try {
      await requestJson(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: edit.name.trim(),
          abbreviation: edit.abbreviation.trim() || null,
          divisionLabel: edit.divisionLabel.trim() || null,
          ownerId: edit.ownerId || null,
        }),
      }, `Failed to save team "${team.name}".`);
      setMessage("Team updated.");
      setEditingTeamId(null);
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save team "${team.name}".`);
    } finally {
      setBusyAction(null);
    }
  }

  function discardTeamEdit(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setTeamEdits((prev) => ({
      ...prev,
      [teamId]: {
        name: team.name,
        abbreviation: team.abbreviation ?? "",
        divisionLabel: team.divisionLabel ?? "",
        ownerId: team.owner?.id ?? "",
      },
    }));
  }

  function startEditingTeam(teamId: string) {
    if (editingTeamId && editingTeamId !== teamId) discardTeamEdit(editingTeamId);
    setAssignmentFlow(null);
    setEditingTeamId(teamId);
  }

  function cancelTeamEdit(teamId: string) {
    discardTeamEdit(teamId);
    setEditingTeamId(null);
  }

  // ── Assignment flow ───────────────────────────────────────────────────────

  function startAssignmentFlow(teamId: string) {
    if (editingTeamId) cancelTeamEdit(editingTeamId);
    setAssignmentFlow({ teamId, mode: "assign", pendingOwnerId: "" });
  }

  function startReassignmentFlow(teamId: string) {
    if (editingTeamId) cancelTeamEdit(editingTeamId);
    setAssignmentFlow({ teamId, mode: "reassign", pendingOwnerId: "" });
  }

  async function confirmAssignmentChange() {
    const flow = assignmentFlow;
    if (!flow) return;

    const { teamId, mode, pendingOwnerId } = flow;
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const isRemoval = pendingOwnerId === REMOVE_ASSIGNMENT;
    const newOwnerId = isRemoval ? null : pendingOwnerId || null;
    const currentOwnerName = team.owner?.name ?? null;
    const newOwner = newOwnerId ? ownerById.get(newOwnerId) : null;

    setBusyAction(`confirm-assignment:${teamId}`);
    setError(null);
    setMessage(null);
    try {
      await requestJson(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: team.name,
          abbreviation: team.abbreviation ?? null,
          divisionLabel: team.divisionLabel ?? null,
          ownerId: newOwnerId,
        }),
      }, `Failed to update assignment for ${team.name}.`);

      if (mode === "assign") {
        setMessage(`${newOwner?.name ?? "Member"} assigned to ${team.name}.`);
      } else if (isRemoval) {
        setMessage(`${currentOwnerName ?? "Member"} removed from ${team.name}.`);
      } else {
        setMessage(
          `${team.name} reassigned from ${currentOwnerName ?? "previous member"} to ${newOwner?.name ?? "new member"}.`,
        );
      }

      setAssignmentFlow(null);
      await reloadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update assignment for ${team.name}.`);
    } finally {
      setBusyAction(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (accessDenied) return null;

  const editingTeam = editingTeamId ? teams.find((t) => t.id === editingTeamId) : null;
  const editingTeamEdit = editingTeamId
    ? (teamEdits[editingTeamId] ?? {
        name: editingTeam?.name ?? "",
        abbreviation: editingTeam?.abbreviation ?? "",
        divisionLabel: editingTeam?.divisionLabel ?? "",
        ownerId: editingTeam?.owner?.id ?? "",
      })
    : null;

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

      <AssignmentSummaryStrip stats={leagueStats} />

      <FranchiseTable
        teams={sortedTeams}
        ownerById={ownerById}
        ownerSelectOptions={ownerSelectOptions}
        editingTeamId={editingTeamId}
        assignmentFlow={assignmentFlow}
        busyAction={busyAction}
        onEdit={startEditingTeam}
        onAssign={startAssignmentFlow}
        onReassign={startReassignmentFlow}
        onFlowChange={setAssignmentFlow}
        onFlowConfirm={confirmAssignmentChange}
        onFlowCancel={() => setAssignmentFlow(null)}
      />

      {editingTeamId && editingTeam && editingTeamEdit ? (
        <TeamDetailPanel
          team={editingTeam}
          edit={editingTeamEdit}
          busyAction={busyAction}
          onSave={() => saveTeam(editingTeamId)}
          onCancel={() => cancelTeamEdit(editingTeamId)}
          onEditChange={(next) =>
            setTeamEdits((prev) => ({ ...prev, [editingTeamId]: next }))
          }
        />
      ) : null}

      <MemberList
        unassignedOwners={unassignedOwners}
        unassignedTeams={unassignedTeams}
        ownerEdits={ownerEdits}
        memberAssignTargets={memberAssignTargets}
        editingOwnerId={editingOwnerId}
        busyAction={busyAction}
        onEditChange={(ownerId, next) =>
          setOwnerEdits((prev) => ({ ...prev, [ownerId]: next }))
        }
        onAssignTargetChange={(ownerId, teamId) =>
          setMemberAssignTargets((prev) => ({ ...prev, [ownerId]: teamId }))
        }
        onSave={saveOwner}
        onCancel={(ownerId) => {
          discardOwnerEdit(ownerId);
          setEditingOwnerId(null);
        }}
        onStartEdit={startEditingOwner}
        onAssign={assignOwnerToTeam}
        onBulkAssign={bulkAssign}
      />

      <SetupUtilitiesSection
        setupOpen={setupOpen}
        ownerForm={ownerForm}
        teamForm={teamForm}
        ownerSelectOptions={ownerSelectOptions}
        busyAction={busyAction}
        onToggle={() => setSetupOpen((prev) => !prev)}
        onOwnerFormChange={setOwnerForm}
        onTeamFormChange={setTeamForm}
        onCreateOwner={createOwner}
        onCreateTeam={createTeam}
      />

      <Link href="/teams" className="inline-flex text-sm text-sky-300 hover:text-sky-200">
        Open browse-only Teams directory
      </Link>
    </div>
  );
}
