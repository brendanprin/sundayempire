import type { TeamRow, TeamForm } from "./types";

export function TeamDetailPanel(props: {
  team: TeamRow;
  edit: TeamForm;
  busyAction: string | null;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onEditChange: (next: TeamForm) => void;
}) {
  const { team, edit, busyAction } = props;
  const isSaving = busyAction === `save-team:${team.id}`;

  return (
    <section
      data-testid={`franchise-detail-panel-${team.id}`}
      className="rounded-lg border border-sky-800/40 bg-slate-900/60 p-4"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Edit Franchise Details</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Updating <span className="text-slate-300">{team.name}</span>. Assignment is managed
            separately via the Assign / Reassign actions in the table.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onCancel}
          className="flex-shrink-0 text-xs text-slate-500 hover:text-slate-300"
        >
          ✕ Close
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block space-y-1 text-xs text-slate-400">
          <span>Franchise Name</span>
          <input
            data-testid={`franchise-detail-name-${team.id}`}
            value={edit.name}
            onChange={(e) => props.onEditChange({ ...edit, name: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <label className="block space-y-1 text-xs text-slate-400">
          <span>Abbreviation</span>
          <input
            data-testid={`franchise-detail-abbr-${team.id}`}
            value={edit.abbreviation}
            onChange={(e) => props.onEditChange({ ...edit, abbreviation: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <label className="block space-y-1 text-xs text-slate-400">
          <span>Division</span>
          <input
            data-testid={`franchise-detail-division-${team.id}`}
            value={edit.divisionLabel}
            onChange={(e) => props.onEditChange({ ...edit, divisionLabel: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid={`franchise-detail-save-${team.id}`}
          onClick={props.onSave}
          disabled={busyAction !== null}
          className="rounded border border-sky-700 bg-sky-900/40 px-3 py-1.5 text-sm text-sky-200 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          data-testid={`franchise-detail-cancel-${team.id}`}
          onClick={props.onCancel}
          disabled={busyAction !== null}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-400 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
