import { FormEvent } from "react";
import type { OwnerForm, TeamForm, OwnerSelectOption } from "./types";

export function SetupUtilitiesSection(props: {
  setupOpen: boolean;
  ownerForm: OwnerForm;
  teamForm: TeamForm;
  ownerSelectOptions: OwnerSelectOption[];
  busyAction: string | null;
  onToggle: () => void;
  onOwnerFormChange: (next: OwnerForm) => void;
  onTeamFormChange: (next: TeamForm) => void;
  onCreateOwner: () => void;
  onCreateTeam: () => void;
}) {
  const { setupOpen, ownerForm, teamForm, ownerSelectOptions, busyAction } = props;

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section className="rounded-lg border border-slate-700/40 bg-slate-950/40">
      <button
        type="button"
        data-testid="setup-utilities-toggle"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-medium text-slate-400">League Setup Utilities</h3>
          <p className="mt-0.5 text-xs text-slate-600">Add franchises or members to the league.</p>
        </div>
        <span className="ml-4 flex-shrink-0 text-xs text-slate-600">{setupOpen ? "▲" : "▼"}</span>
      </button>

      {setupOpen ? (
        <div className="grid grid-cols-1 gap-4 border-t border-slate-800 px-4 pb-4 pt-4 lg:grid-cols-2">
          {/* Create Member */}
          <form
            onSubmit={handleFormSubmit}
            className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
          >
            <h3 className="text-sm font-semibold">Create League Member</h3>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Name</span>
              <input
                data-testid="commissioner-team-admin-create-owner-name"
                value={ownerForm.name}
                onChange={(e) => props.onOwnerFormChange({ ...ownerForm, name: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Email</span>
              <input
                data-testid="commissioner-team-admin-create-owner-email"
                value={ownerForm.email}
                onChange={(e) => props.onOwnerFormChange({ ...ownerForm, email: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={props.onCreateOwner}
              disabled={busyAction !== null}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "create-owner" ? "Adding..." : "Add League Member"}
            </button>
          </form>

          {/* Create Franchise */}
          <form
            onSubmit={handleFormSubmit}
            className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
          >
            <h3 className="text-sm font-semibold">Create Franchise</h3>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Franchise Name</span>
              <input
                data-testid="commissioner-team-admin-create-team-name"
                value={teamForm.name}
                onChange={(e) => props.onTeamFormChange({ ...teamForm, name: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs text-slate-400">
                <span>Abbreviation</span>
                <input
                  data-testid="commissioner-team-admin-create-team-abbr"
                  value={teamForm.abbreviation}
                  onChange={(e) =>
                    props.onTeamFormChange({ ...teamForm, abbreviation: e.target.value })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
              <label className="block space-y-1 text-xs text-slate-400">
                <span>Division</span>
                <input
                  data-testid="commissioner-team-admin-create-team-division"
                  value={teamForm.divisionLabel}
                  onChange={(e) =>
                    props.onTeamFormChange({ ...teamForm, divisionLabel: e.target.value })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs text-slate-400">
              <span>Assign to Member</span>
              <select
                data-testid="commissioner-team-admin-create-team-owner"
                value={teamForm.ownerId}
                onChange={(e) => props.onTeamFormChange({ ...teamForm, ownerId: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              >
                <option value="">Unassigned</option>
                {ownerSelectOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={props.onCreateTeam}
              disabled={busyAction !== null}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "create-team" ? "Adding..." : "Add Franchise"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
