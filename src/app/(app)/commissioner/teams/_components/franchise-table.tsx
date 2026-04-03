import type {
  TeamRow,
  OwnerRow,
  AssignmentFlow,
  FranchiseStatus,
  OwnerSelectOption,
} from "./types";
import { REMOVE_ASSIGNMENT } from "./types";

function StatusBadge({ status, teamId }: { status: FranchiseStatus; teamId: string }) {
  if (status === "unassigned") {
    return (
      <span
        data-testid={`franchise-status-${teamId}`}
        className="whitespace-nowrap rounded-full bg-amber-900/40 px-2 py-0.5 text-xs text-amber-400"
      >
        Unassigned
      </span>
    );
  }
  if (status === "needs-reassignment") {
    return (
      <span
        data-testid={`franchise-status-${teamId}`}
        className="whitespace-nowrap rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400"
      >
        Needs Reassignment
      </span>
    );
  }
  return (
    <span
      data-testid={`franchise-status-${teamId}`}
      className="whitespace-nowrap rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-400"
    >
      Assigned
    </span>
  );
}

function AssignmentFlowRow(props: {
  team: TeamRow;
  flow: AssignmentFlow;
  ownerById: Map<string, OwnerRow>;
  ownerSelectOptions: OwnerSelectOption[];
  busyAction: string | null;
  onFlowChange: (next: AssignmentFlow) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { team, flow, ownerById, ownerSelectOptions, busyAction } = props;
  const isAssignMode = flow.mode === "assign";
  const { pendingOwnerId } = flow;
  const currentOwner = team.owner ? ownerById.get(team.owner.id) : null;
  const isRemoval = pendingOwnerId === REMOVE_ASSIGNMENT;
  const pendingOwner = !isRemoval && pendingOwnerId ? ownerById.get(pendingOwnerId) : null;
  const hasChosen = pendingOwnerId !== "";
  const isUnchanged = !isAssignMode && pendingOwnerId === team.owner?.id;
  const confirmDisabled = busyAction !== null || !hasChosen || isUnchanged;
  const isSaving = busyAction === `confirm-assignment:${team.id}`;

  const confirmLabel = isSaving
    ? "Saving..."
    : isRemoval
      ? "Confirm Removal"
      : isAssignMode
        ? "Confirm Assignment"
        : "Confirm Reassignment";

  return (
    <tr
      data-testid={`franchise-row-${team.id}`}
      className={`border-b border-slate-800/70 last:border-b-0 ${
        isAssignMode
          ? "bg-amber-950/5 outline outline-1 outline-amber-800/40"
          : "bg-slate-900/40 outline outline-1 outline-sky-800/40"
      }`}
    >
      <td className="px-3 py-2 text-sm font-medium text-slate-100">{team.name}</td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {team.abbreviation || <span className="text-slate-600">—</span>}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {team.divisionLabel || <span className="text-slate-600">—</span>}
      </td>
      <td colSpan={4} className="px-3 py-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-300">
            {isAssignMode ? "Assign a member to this franchise" : "Change franchise assignment"}
          </p>

          {!isAssignMode && currentOwner ? (
            <p className="text-xs text-slate-500">
              Currently:{" "}
              <span className="font-medium text-slate-300">{currentOwner.name}</span>
              {currentOwner.email ? (
                <span className="ml-1 text-slate-600">({currentOwner.email})</span>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <select
              data-testid={`franchise-assignment-select-${team.id}`}
              value={pendingOwnerId}
              onChange={(e) => props.onFlowChange({ ...flow, pendingOwnerId: e.target.value })}
              className="min-w-44 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            >
              <option value="" disabled>
                {isAssignMode ? "Select a member…" : "Choose new assignment…"}
              </option>
              {!isAssignMode ? (
                <option value={REMOVE_ASSIGNMENT}>— Remove assignment</option>
              ) : null}
              {ownerSelectOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            {!isAssignMode && hasChosen && !isRemoval && pendingOwner ? (
              <span className="text-xs text-slate-500">
                {currentOwner?.name}
                <span className="mx-1.5 text-slate-600">→</span>
                <span className="font-medium text-slate-200">{pendingOwner.name}</span>
              </span>
            ) : null}
          </div>

          {isRemoval && currentOwner ? (
            <p className="text-xs text-orange-400">
              {currentOwner.name} will be unassigned from {team.name} and moved to the unassigned
              queue.
            </p>
          ) : null}

          {!isAssignMode && !isRemoval && hasChosen && pendingOwner ? (
            <p className="text-xs text-amber-400">
              {currentOwner?.name} will lose control of {team.name}. {pendingOwner.name} will take
              over.
            </p>
          ) : null}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              data-testid={`franchise-confirm-assignment-btn-${team.id}`}
              onClick={props.onConfirm}
              disabled={confirmDisabled}
              className="rounded border border-sky-700 bg-sky-900/40 px-2.5 py-1 text-xs text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              data-testid={`franchise-cancel-assignment-btn-${team.id}`}
              onClick={props.onCancel}
              disabled={busyAction !== null}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function FranchiseViewRow(props: {
  team: TeamRow;
  status: FranchiseStatus;
  savedMemberEmail: string | null;
  isEditing: boolean;
  busyAction: string | null;
  onEdit: () => void;
  onAssign: () => void;
  onReassign: () => void;
}) {
  const { team, status, savedMemberEmail, isEditing, busyAction } = props;

  return (
    <tr
      data-testid={`franchise-row-${team.id}`}
      className={`border-b border-slate-800/70 last:border-b-0 ${
        isEditing
          ? "bg-slate-900/60 outline outline-1 outline-sky-900/60"
          : status === "unassigned"
            ? "bg-amber-950/10"
            : ""
      }`}
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
      <td className="px-3 py-2">
        <StatusBadge status={status} teamId={team.id} />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {status === "unassigned" ? (
            <button
              type="button"
              data-testid={`franchise-assign-btn-${team.id}`}
              onClick={props.onAssign}
              disabled={busyAction !== null}
              className="rounded border border-amber-700/60 bg-amber-900/20 px-2 py-1 text-xs text-amber-300 disabled:opacity-50"
            >
              Assign Member
            </button>
          ) : (
            <button
              type="button"
              data-testid={`franchise-reassign-btn-${team.id}`}
              onClick={props.onReassign}
              disabled={busyAction !== null}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-50"
            >
              Reassign
            </button>
          )}
          <button
            type="button"
            data-testid={`franchise-edit-btn-${team.id}`}
            onClick={props.onEdit}
            disabled={busyAction !== null}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
          >
            Edit
          </button>
        </div>
      </td>
    </tr>
  );
}

export function FranchiseTable(props: {
  teams: TeamRow[];
  ownerById: Map<string, OwnerRow>;
  ownerSelectOptions: OwnerSelectOption[];
  editingTeamId: string | null;
  assignmentFlow: AssignmentFlow | null;
  busyAction: string | null;
  onEdit: (teamId: string) => void;
  onAssign: (teamId: string) => void;
  onReassign: (teamId: string) => void;
  onFlowChange: (next: AssignmentFlow) => void;
  onFlowConfirm: () => void;
  onFlowCancel: () => void;
}) {
  const {
    teams,
    ownerById,
    ownerSelectOptions,
    editingTeamId,
    assignmentFlow,
    busyAction,
  } = props;

  return (
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
            {teams.map((team) => {
              const isEditing = editingTeamId === team.id;
              const isInAssignmentFlow = assignmentFlow?.teamId === team.id;

              const status: FranchiseStatus = !team.owner
                ? "unassigned"
                : (ownerById.get(team.owner.id)?.teamCount ?? 0) > 1
                  ? "needs-reassignment"
                  : "assigned";

              const savedMemberEmail = team.owner
                ? (ownerById.get(team.owner.id)?.email ?? null)
                : null;

              if (isInAssignmentFlow && assignmentFlow) {
                return (
                  <AssignmentFlowRow
                    key={team.id}
                    team={team}
                    flow={assignmentFlow}
                    ownerById={ownerById}
                    ownerSelectOptions={ownerSelectOptions}
                    busyAction={busyAction}
                    onFlowChange={props.onFlowChange}
                    onConfirm={props.onFlowConfirm}
                    onCancel={props.onFlowCancel}
                  />
                );
              }

              return (
                <FranchiseViewRow
                  key={team.id}
                  team={team}
                  status={status}
                  savedMemberEmail={savedMemberEmail}
                  isEditing={isEditing}
                  busyAction={busyAction}
                  onEdit={() => props.onEdit(team.id)}
                  onAssign={() => props.onAssign(team.id)}
                  onReassign={() => props.onReassign(team.id)}
                />
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
  );
}
