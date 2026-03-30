"use client";

import { FormEvent, useState } from "react";
import { InviteManagementPanel, type CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import { PageHeaderBand } from "@/components/layout/page-header-band";

// Types for team slot management
type TeamSlotStatus = "filled" | "pending_invite" | "open";
type InviteStatus = "pending" | "expired" | "accepted" | "revoked" | null;

export type TeamSlot = {
  id: string;
  slotNumber: number;
  teamName: string | null;
  teamAbbreviation: string | null;
  divisionLabel: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  status: TeamSlotStatus;
  inviteStatus: InviteStatus;
  inviteId: string | null;
  teamId: string | null;
  ownerId: string | null;
};

export type LeagueMembersSummary = {
  totalSlots: number;
  filledSlots: number;
  pendingInvites: number;
  openSlots: number;
  leagueName: string;
};

interface LeagueMembersWorkspaceProps {
  summary: LeagueMembersSummary;
  teamSlots: TeamSlot[];
  invites: CommissionerInviteRow[];
  setupInviteCopyFreshLinkEnabled: boolean;
  setupOpsBusyAction: string | null;
  setupOpsError: string | null;
  setupOpsMessage: string | null;
  setupBulkCsvText: string;
  setupBulkBusyAction: "validate" | "apply" | null;
  setupBulkValidation: any;
  setupBulkError: string | null;
  setupBulkMessage: string | null;
  setSetupBulkCsvText: (value: string) => void;
  onSlotCreateTeam: (slotNumber: number, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onSlotInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
  onSlotEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onSetupBulkValidate: () => Promise<void>;
  onSetupBulkApply: () => Promise<void>;
  onSetupInviteResend: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupInviteRevoke: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupCopyFreshInviteLink: (invite: CommissionerInviteRow) => Promise<void>;
}

function getStatusBadge(status: TeamSlotStatus, inviteStatus: InviteStatus) {
  if (status === "filled") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-400/20">
        Filled
      </span>
    );
  }
  
  if (status === "pending_invite") {
    const badgeColor = inviteStatus === "pending" ? "bg-amber-400/10 text-amber-400 ring-amber-400/20" : "bg-red-400/10 text-red-400 ring-red-400/20";
    const badgeText = inviteStatus === "pending" ? "Invited" : inviteStatus === "expired" ? "Expired" : "Revoked";
    
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeColor}`}>
        {badgeText}
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center rounded-full bg-slate-400/10 px-2 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-slate-400/20">
      Open
    </span>
  );
}

function TeamSlotRow({ 
  slot, 
  busyAction, 
  onCreateTeam, 
  onInviteMember, 
  onEditTeam 
}: {
  slot: TeamSlot;
  busyAction: string | null;
  onCreateTeam: (slotNumber: number, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
  onEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  
  const [createTeamName, setCreateTeamName] = useState("");
  const [createTeamAbbreviation, setCreateTeamAbbreviation] = useState("");
  const [createDivisionLabel, setCreateDivisionLabel] = useState(slot.divisionLabel || "");
  
  const [inviteOwnerName, setInviteOwnerName] = useState("");
  const [inviteOwnerEmail, setInviteOwnerEmail] = useState("");
  const [inviteTeamName, setInviteTeamName] = useState("");
  const [inviteTeamAbbreviation, setInviteTeamAbbreviation] = useState("");
  const [inviteDivisionLabel, setInviteDivisionLabel] = useState(slot.divisionLabel || "");
  
  const [editTeamName, setEditTeamName] = useState(slot.teamName || "");
  const [editTeamAbbreviation, setEditTeamAbbreviation] = useState(slot.teamAbbreviation || "");
  const [editDivisionLabel, setEditDivisionLabel] = useState(slot.divisionLabel || "");

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreateTeam(slot.slotNumber, {
      name: createTeamName.trim(),
      abbreviation: createTeamAbbreviation.trim(),
      divisionLabel: createDivisionLabel.trim()
    });
    setShowCreateForm(false);
    setCreateTeamName("");
    setCreateTeamAbbreviation("");
    setCreateDivisionLabel(slot.divisionLabel || "");
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onInviteMember(slot.slotNumber, {
      ownerName: inviteOwnerName.trim(),
      ownerEmail: inviteOwnerEmail.trim(),
      teamName: inviteTeamName.trim(),
      teamAbbreviation: inviteTeamAbbreviation.trim(),
      divisionLabel: inviteDivisionLabel.trim()
    });
    setShowInviteForm(false);
    setInviteOwnerName("");
    setInviteOwnerEmail("");
    setInviteTeamName("");
    setInviteTeamAbbreviation("");
    setInviteDivisionLabel(slot.divisionLabel || "");
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (slot.teamId) {
      await onEditTeam(slot.teamId, {
        name: editTeamName.trim(),
        abbreviation: editTeamAbbreviation.trim(),
        divisionLabel: editDivisionLabel.trim()
      });
      setShowEditForm(false);
    }
  };

  return (
    <>
      <tr className="border-b border-slate-800/60">
        <td className="p-3 text-sm font-medium text-slate-300">
          {slot.slotNumber}
        </td>
        <td className="p-3 text-sm text-slate-100">
          {slot.teamName ? (
            <div>
              <div className="font-medium">{slot.teamName}</div>
              {slot.teamAbbreviation && (
                <div className="text-xs text-slate-400">{slot.teamAbbreviation}</div>
              )}
            </div>
          ) : (
            <span className="text-slate-500 italic">No team</span>
          )}
        </td>
        <td className="p-3 text-sm text-slate-100">
          {slot.divisionLabel || <span className="text-slate-500 italic">None</span>}
        </td>
        <td className="p-3 text-sm text-slate-100">
          {slot.ownerName ? (
            <div>
              <div className="font-medium">{slot.ownerName}</div>
              {slot.ownerEmail && (
                <div className="text-xs text-slate-400">{slot.ownerEmail}</div>
              )}
            </div>
          ) : (
            <span className="text-slate-500 italic">No owner</span>
          )}
        </td>
        <td className="p-3">
          {getStatusBadge(slot.status, slot.inviteStatus)}
        </td>
        <td className="p-3">
          <div className="flex flex-wrap gap-1">
            {slot.status === "open" && (
              <>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="rounded bg-sky-600/20 px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-600/30"
                  disabled={Boolean(busyAction)}
                >
                  Add Team
                </button>
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="rounded bg-emerald-600/20 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30"
                  disabled={Boolean(busyAction)}
                >
                  Invite
                </button>
              </>
            )}
            {slot.status === "filled" && slot.teamId && (
              <button
                onClick={() => setShowEditForm(true)}
                className="rounded bg-slate-600/20 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600/30"
                disabled={Boolean(busyAction)}
              >
                Edit
              </button>
            )}
            {slot.status === "pending_invite" && slot.inviteStatus === "expired" && (
              <button
                onClick={() => setShowInviteForm(true)}
                className="rounded bg-amber-600/20 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-600/30"
                disabled={Boolean(busyAction)}
              >
                Re-invite
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Create Team Form Row */}
      {showCreateForm && (
        <tr className="bg-sky-950/20 border-b border-slate-800/60">
          <td className="p-3 text-xs text-slate-400">#{slot.slotNumber}</td>
          <td colSpan={5} className="p-3">
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <h4 className="text-sm font-medium text-sky-300">Create Team for Slot {slot.slotNumber}</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={createTeamName}
                  onChange={(e) => setCreateTeamName(e.target.value)}
                  placeholder="Team name"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                  required
                />
                <input
                  value={createTeamAbbreviation}
                  onChange={(e) => setCreateTeamAbbreviation(e.target.value)}
                  placeholder="Abbreviation"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 uppercase"
                />
                <input
                  value={createDivisionLabel}
                  onChange={(e) => setCreateDivisionLabel(e.target.value)}
                  placeholder="Division"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
                  disabled={Boolean(busyAction)}
                >
                  Create Team
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded bg-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-slate-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </td>
        </tr>
      )}

      {/* Invite Member Form Row */}
      {showInviteForm && (
        <tr className="bg-emerald-950/20 border-b border-slate-800/60">
          <td className="p-3 text-xs text-slate-400">#{slot.slotNumber}</td>
          <td colSpan={5} className="p-3">
            <form onSubmit={handleInviteSubmit} className="space-y-3">
              <h4 className="text-sm font-medium text-emerald-300">Invite Member + Create Team for Slot {slot.slotNumber}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={inviteOwnerName}
                  onChange={(e) => setInviteOwnerName(e.target.value)}
                  placeholder="Owner name"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                  required
                />
                <input
                  type="email"
                  value={inviteOwnerEmail}
                  onChange={(e) => setInviteOwnerEmail(e.target.value)}
                  placeholder="Owner email"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={inviteTeamName}
                  onChange={(e) => setInviteTeamName(e.target.value)}
                  placeholder="Team name"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                  required
                />
                <input
                  value={inviteTeamAbbreviation}
                  onChange={(e) => setInviteTeamAbbreviation(e.target.value)}
                  placeholder="Abbreviation"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 uppercase"
                />
                <input
                  value={inviteDivisionLabel}
                  onChange={(e) => setInviteDivisionLabel(e.target.value)}
                  placeholder="Division"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
                  disabled={Boolean(busyAction)}
                >
                  Create Team + Send Invite
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="rounded bg-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-slate-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </td>
        </tr>
      )}

      {/* Edit Team Form Row */}
      {showEditForm && (
        <tr className="bg-slate-950/40 border-b border-slate-800/60">
          <td className="p-3 text-xs text-slate-400">#{slot.slotNumber}</td>
          <td colSpan={5} className="p-3">
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <h4 className="text-sm font-medium text-slate-300">Edit Team in Slot {slot.slotNumber}</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  placeholder="Team name"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                  required
                />
                <input
                  value={editTeamAbbreviation}
                  onChange={(e) => setEditTeamAbbreviation(e.target.value)}
                  placeholder="Abbreviation"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 uppercase"
                />
                <input
                  value={editDivisionLabel}
                  onChange={(e) => setEditDivisionLabel(e.target.value)}
                  placeholder="Division"
                  className="rounded border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded bg-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-slate-500"
                  disabled={Boolean(busyAction)}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className="rounded bg-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-slate-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

export function LeagueMembersWorkspace(props: LeagueMembersWorkspaceProps) {
  const { summary, teamSlots } = props;
  
  // Calculate what the next action should be
  const nextAction = summary.openSlots > 0 
    ? `Add ${summary.openSlots} more team${summary.openSlots === 1 ? '' : 's'}`
    : summary.pendingInvites > 0 
    ? "Follow up on pending invites" 
    : "League setup complete";

  return (
    <div className="space-y-6" data-testid="league-members-workspace">
      <PageHeaderBand
        eyebrow="Team Management"
        eyebrowTestId="league-members-eyebrow"
        title={`${summary.leagueName} • Team Slots & Members`}
        titleTestId="league-members-title"
        description={`League setup progress and member management. ${nextAction}.`}
        supportingContent={
          <div className="flex flex-wrap items-center gap-3">
            <span className="shell-chip shell-chip--accent">
              {summary.filledSlots}/{summary.totalSlots} teams filled
            </span>
            {summary.pendingInvites > 0 && (
              <span className="shell-chip shell-chip--warning">
                {summary.pendingInvites} pending invite{summary.pendingInvites === 1 ? '' : 's'}
              </span>
            )}
            {summary.openSlots > 0 && (
              <span className="shell-chip shell-chip--neutral">
                {summary.openSlots} open slot{summary.openSlots === 1 ? '' : 's'}
              </span>
            )}
          </div>
        }
      />

      {/* Status Summary Bar */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-700/60 p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-100">{summary.totalSlots}</div>
            <div className="text-sm text-slate-400">Total Slots</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{summary.filledSlots}</div>
            <div className="text-sm text-slate-400">Teams Filled</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{summary.pendingInvites}</div>
            <div className="text-sm text-slate-400">Pending Invites</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-400">{summary.openSlots}</div>
            <div className="text-sm text-slate-400">Open Slots</div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {props.setupOpsError && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-100">
          {props.setupOpsError}
        </div>
      )}
      {props.setupOpsMessage && (
        <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {props.setupOpsMessage}
        </div>
      )}

      {/* Team Slots Table */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/20 overflow-hidden">
        <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-700/60">
          <h3 className="text-lg font-medium text-slate-100">Team Slots & Members</h3>
          <p className="mt-1 text-sm text-slate-400">
            Manage team assignments, send invites, and track league membership status.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/20">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Slot
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Team
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Division
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Owner/Manager
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {teamSlots.map((slot) => (
                <TeamSlotRow
                  key={slot.id}
                  slot={slot}
                  busyAction={props.setupOpsBusyAction}
                  onCreateTeam={props.onSlotCreateTeam}
                  onInviteMember={props.onSlotInviteMember}
                  onEditTeam={props.onSlotEditTeam}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Secondary Tools Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-slate-100">Bulk Tools & Utilities</h3>
        
        {/* Bulk Import */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/20 p-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-slate-100">Bulk Team Import (CSV)</h4>
              <p className="mt-1 text-xs text-slate-400">
                Import multiple teams and invites at once. Headers: ownerName, ownerEmail, teamName, teamAbbreviation, divisionLabel
              </p>
            </div>

            <textarea
              value={props.setupBulkCsvText}
              onChange={(event) => props.setSetupBulkCsvText(event.target.value)}
              className="min-h-[7rem] w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
              placeholder="ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel&#10;Alex Owner,alex@example.com,Empire East,EME,East"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onSetupBulkValidate}
                className="rounded-md bg-sky-600/20 border border-sky-600/40 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(props.setupBulkBusyAction)}
              >
                {props.setupBulkBusyAction === "validate" ? "Validating..." : "Validate CSV"}
              </button>
              <button
                type="button"
                onClick={props.onSetupBulkApply}
                className="rounded-md bg-emerald-600/20 border border-emerald-600/40 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(props.setupBulkBusyAction) || !props.setupBulkValidation || props.setupBulkValidation.summary.validRows === 0}
              >
                {props.setupBulkBusyAction === "apply" ? "Applying..." : "Apply Valid Rows"}
              </button>
            </div>

            {props.setupBulkError && (
              <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100">
                {props.setupBulkError}
              </div>
            )}
            {props.setupBulkMessage && (
              <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
                {props.setupBulkMessage}
              </div>
            )}
          </div>
        </div>

        {/* Invite Management */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/20 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-slate-100">Invite Management</h4>
            <span className="rounded-full border border-amber-600/50 px-2 py-0.5 text-xs text-amber-300">
              {props.invites.filter((invite) => invite.status === "pending").length} pending
            </span>
          </div>
          
          <InviteManagementPanel
            invites={props.invites}
            copyFreshLinkEnabled={props.setupInviteCopyFreshLinkEnabled}
            busyAction={props.setupOpsBusyAction}
            onResend={props.onSetupInviteResend}
            onRevoke={props.onSetupInviteRevoke}
            onCopyFreshLink={props.onSetupCopyFreshInviteLink}
          />
        </div>
      </div>
    </div>
  );
}