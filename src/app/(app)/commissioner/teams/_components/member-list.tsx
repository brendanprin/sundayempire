import type { OwnerRow, TeamRow, OwnerForm } from "./types";

function MemberListItem(props: {
  owner: OwnerRow;
  edit: OwnerForm;
  unassignedTeams: TeamRow[];
  assignTarget: string;
  assignmentStatus?: "pending" | "success" | "error";
  isEditing: boolean;
  busyAction: string | null;
  onEditChange: (next: OwnerForm) => void;
  onAssignTargetChange: (teamId: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onStartEdit: () => void;
  onAssign: () => void;
}) {
  const { owner, edit, unassignedTeams, assignTarget, assignmentStatus, isEditing, busyAction } = props;
  const isSavingOwner = busyAction === `save-owner:${owner.id}`;
  const isAssigning = busyAction === `assign-to-team:${owner.id}`;

  return (
    <li
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
              onChange={(e) => props.onEditChange({ ...edit, name: e.target.value })}
              placeholder="Name"
              className="min-w-32 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
            <input
              value={edit.email}
              onChange={(e) => props.onEditChange({ ...edit, email: e.target.value })}
              placeholder="Email"
              className="min-w-40 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid={`member-save-btn-${owner.id}`}
              onClick={props.onSave}
              disabled={busyAction !== null}
              className="rounded border border-sky-700 bg-sky-900/40 px-2 py-1 text-xs text-sky-200 disabled:opacity-50"
            >
              {isSavingOwner ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              data-testid={`member-cancel-btn-${owner.id}`}
              onClick={props.onCancel}
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
            <div className="flex items-center gap-2">
              <p className="truncate text-sm text-slate-100">{owner.name}</p>
              {assignmentStatus === "pending" && (
                <span className="text-xs text-amber-400">applying…</span>
              )}
              {assignmentStatus === "success" && (
                <span className="text-xs text-emerald-400">assigned</span>
              )}
              {assignmentStatus === "error" && (
                <span className="text-xs text-red-400">failed</span>
              )}
            </div>
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
              onChange={(e) => props.onAssignTargetChange(e.target.value)}
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
              onClick={props.onAssign}
              disabled={!assignTarget || busyAction !== null}
              className="rounded border border-amber-700/60 bg-amber-900/20 px-2 py-1 text-xs text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isAssigning ? "Assigning..." : "Assign"}
            </button>
            <button
              type="button"
              data-testid={`member-edit-btn-${owner.id}`}
              onClick={props.onStartEdit}
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
}

export function MemberList(props: {
  unassignedOwners: OwnerRow[];
  unassignedTeams: TeamRow[];
  ownerEdits: Record<string, OwnerForm>;
  memberAssignTargets: Record<string, string>;
  assignmentStatuses: Record<string, "pending" | "success" | "error">;
  editingOwnerId: string | null;
  busyAction: string | null;
  onEditChange: (ownerId: string, next: OwnerForm) => void;
  onAssignTargetChange: (ownerId: string, teamId: string) => void;
  onSave: (ownerId: string) => Promise<void>;
  onCancel: (ownerId: string) => void;
  onStartEdit: (ownerId: string) => void;
  onAssign: (ownerId: string) => void;
  onBulkAssign: () => Promise<void>;
}) {
  const { unassignedOwners, unassignedTeams, ownerEdits, memberAssignTargets, assignmentStatuses, editingOwnerId, busyAction } = props;
  const pendingCount = Object.values(memberAssignTargets).filter(Boolean).length;

  return (
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
        <>
          <ul className="space-y-1.5">
            {unassignedOwners.map((owner) => {
              const edit = ownerEdits[owner.id] ?? { name: owner.name, email: owner.email ?? "" };
              const isEditing = editingOwnerId === owner.id;
              const assignTarget = memberAssignTargets[owner.id] ?? "";

              return (
                <MemberListItem
                  key={owner.id}
                  owner={owner}
                  edit={edit}
                  unassignedTeams={unassignedTeams}
                  assignTarget={assignTarget}
                  assignmentStatus={assignmentStatuses[owner.id]}
                  isEditing={isEditing}
                  busyAction={busyAction}
                  onEditChange={(next) => props.onEditChange(owner.id, next)}
                  onAssignTargetChange={(teamId) => props.onAssignTargetChange(owner.id, teamId)}
                  onSave={() => props.onSave(owner.id)}
                  onCancel={() => props.onCancel(owner.id)}
                  onStartEdit={() => props.onStartEdit(owner.id)}
                  onAssign={() => props.onAssign(owner.id)}
                />
              );
            })}
          </ul>

          {pendingCount >= 1 && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2.5">
              <p className="text-xs text-amber-300">
                {pendingCount} assignments ready to apply
              </p>
              <button
                type="button"
                data-testid="bulk-assign-btn"
                onClick={() => void props.onBulkAssign()}
                disabled={busyAction !== null}
                className="rounded border border-amber-600/60 bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busyAction === "bulk-assign" ? "Applying…" : `Apply All ${pendingCount} Assignments`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
