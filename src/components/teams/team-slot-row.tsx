"use client";

import { useState } from "react";
import type { CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import type { TeamSlot } from "@/components/teams/league-members-workspace";

// ── Status helpers ─────────────────────────────────────────────────────────

type ComprehensiveSlotStatus =
  | "open_slot"
  | "team_created_no_owner"
  | "invite_pending"
  | "invite_delivery_failed"
  | "invite_not_configured"
  | "owner_joined"
  | "invite_revoked"
  | "invite_expired";

export function getComprehensiveStatus(slot: TeamSlot): ComprehensiveSlotStatus {
  if (slot.status === "filled" && slot.ownerName) {
    return "owner_joined";
  }
  if (slot.teamName && !slot.ownerName && !slot.ownerEmail) {
    return "team_created_no_owner";
  }
  if (slot.status === "pending_invite" || slot.ownerEmail) {
    if (slot.inviteStatus === "revoked") return "invite_revoked";
    if (slot.inviteStatus === "expired") return "invite_expired";
    if (slot.inviteDeliveryState === "failed") return "invite_delivery_failed";
    if (slot.inviteDeliveryState === "not_configured") return "invite_not_configured";
    return "invite_pending";
  }
  return "open_slot";
}

export function getStatusBadge(slot: TeamSlot) {
  const comprehensiveStatus = getComprehensiveStatus(slot);

  switch (comprehensiveStatus) {
    case "owner_joined":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-400/20">
          Owner Joined
        </span>
      );
    case "team_created_no_owner":
      return (
        <span className="inline-flex items-center rounded-full bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20">
          Team Created / No Owner
        </span>
      );
    case "invite_pending":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-400 ring-1 ring-inset ring-amber-400/20">
          Invite Pending
        </span>
      );
    case "invite_delivery_failed":
      return (
        <span className="inline-flex items-center rounded-full bg-orange-400/10 px-2 py-1 text-xs font-medium text-orange-400 ring-1 ring-inset ring-orange-400/20">
          Invite Created - Delivery Failed
        </span>
      );
    case "invite_not_configured":
      return (
        <span className="inline-flex items-center rounded-full bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20">
          Invite Created - Email Disabled
        </span>
      );
    case "invite_revoked":
      return (
        <span className="inline-flex items-center rounded-full bg-red-400/10 px-2 py-1 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
          Invite Revoked
        </span>
      );
    case "invite_expired":
      return (
        <span className="inline-flex items-center rounded-full bg-red-400/10 px-2 py-1 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
          Invite Expired
        </span>
      );
    case "open_slot":
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-slate-400/10 px-2 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-slate-400/20">
          Open Slot
        </span>
      );
  }
}

// ── Inline action dialogs ──────────────────────────────────────────────────

// Combined form for both open slots (needs team + owner) and teams without an
// owner (team pre-filled, just needs owner). When `slot.teamName` is set the
// team fields are shown as read-only context and only owner fields are editable.
function InviteUserAction({
  slot,
  onInviteMember,
  disabled,
}: {
  slot: TeamSlot;
  onInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasTeam = Boolean(slot.teamName);

  const [teamName, setTeamName] = useState(slot.teamName ?? "");
  const [teamNameEdited, setTeamNameEdited] = useState(false);
  const [teamAbbr, setTeamAbbr] = useState(slot.teamAbbreviation ?? "");
  const [division, setDivision] = useState(slot.divisionLabel ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const canSubmit = (hasTeam || teamName.trim().length > 0) && ownerName.trim().length > 0 && ownerEmail.trim().length > 0;

  function deriveTeamName(email: string) {
    const prefix = email.split("@")[0] ?? "";
    return prefix ? `Team ${prefix}` : "";
  }

  const handleOpen = () => {
    setTeamName(slot.teamName ?? "");
    setTeamNameEdited(false);
    setTeamAbbr(slot.teamAbbreviation ?? "");
    setDivision(slot.divisionLabel ?? "");
    setOwnerName("");
    setOwnerEmail("");
    setIsOpen(true);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOwnerEmail(val);
    if (!hasTeam && !teamNameEdited) {
      setTeamName(deriveTeamName(val));
    }
  };

  const handleTeamNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTeamName(e.target.value);
    setTeamNameEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onInviteMember(slot.slotNumber, {
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim().toLowerCase(),
      teamName: teamName.trim(),
      teamAbbreviation: teamAbbr.trim(),
      divisionLabel: division.trim(),
    });
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
        disabled={disabled}
      >
        Invite User
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 w-full max-w-md">
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              {hasTeam ? `Invite owner for ${slot.teamName}` : "Invite a new member"}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {hasTeam
                ? "Send an invite to claim this team. They'll set their own password on first login."
                : "Fill in the team details and the person who will manage it. An invite email will be sent."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              {hasTeam ? (
                <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">{slot.teamName}</span>
                  {slot.teamAbbreviation && <span className="ml-2 text-slate-500">{slot.teamAbbreviation}</span>}
                  {slot.divisionLabel && <span className="ml-2">· {slot.divisionLabel}</span>}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Team Name *</label>
                    <input type="text" value={teamName} onChange={handleTeamNameChange} placeholder="e.g., Lightning Bolts" className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Abbreviation</label>
                      <input type="text" value={teamAbbr} onChange={(e) => setTeamAbbr(e.target.value)} placeholder="e.g., LB" maxLength={4} className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 uppercase" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Division</label>
                      <input type="text" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="e.g., North" className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                    </div>
                  </div>
                  <hr className="border-slate-700" />
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Owner Name *</label>
                <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g., John Smith" className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Owner Email *</label>
                <input type="email" value={ownerEmail} onChange={handleEmailChange} placeholder="e.g., john@example.com" className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100" required />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsOpen(false)} className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:text-slate-100">Cancel</button>
                <button type="submit" className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50" disabled={!canSubmit}>Send Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function RemoveTeamAction({
  slot,
  disabled,
  onRemoveTeam,
}: {
  slot: TeamSlot;
  disabled: boolean;
  onRemoveTeam?: (teamId: string) => Promise<void>;
}) {
  const handleRemove = async () => {
    if (!onRemoveTeam || !slot.teamId) return;
    if (confirm(`Remove team "${slot.teamName}" from slot ${slot.slotNumber}? This cannot be undone.`)) {
      await onRemoveTeam(slot.teamId);
    }
  };

  return (
    <button
      onClick={handleRemove}
      className="rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:text-red-100 hover:border-red-500 disabled:opacity-50"
      disabled={disabled || !onRemoveTeam}
    >
      Remove
    </button>
  );
}

function ViewTeamAction({
  slot,
  disabled,
  onViewTeam,
}: {
  slot: TeamSlot;
  disabled: boolean;
  onViewTeam?: (teamId: string) => void;
}) {
  return (
    <button
      onClick={() => { if (onViewTeam && slot.teamId) onViewTeam(slot.teamId); }}
      className="rounded border border-sky-600 px-2 py-1 text-xs text-sky-300 hover:text-sky-100 hover:border-sky-500 disabled:opacity-50"
      disabled={disabled || !onViewTeam}
    >
      View
    </button>
  );
}

// ── TeamSlotActions ────────────────────────────────────────────────────────

function TeamSlotActions({
  slot,
  busyAction,
  onEditTeam,
  onInviteMember,
  onResendInvite,
  onRevokeInvite,
  onCopyInviteLink,
  onRemoveTeam,
  onViewTeam,
  invites,
  copyFreshLinkEnabled,
}: {
  slot: TeamSlot;
  busyAction: string | null;
  onEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
  onResendInvite: (invite: CommissionerInviteRow) => Promise<void>;
  onRevokeInvite: (invite: CommissionerInviteRow) => Promise<void>;
  onCopyInviteLink: (invite: CommissionerInviteRow) => Promise<void>;
  onRemoveTeam?: (teamId: string) => Promise<void>;
  onViewTeam?: (teamId: string) => void;
  invites: CommissionerInviteRow[];
  copyFreshLinkEnabled: boolean;
}) {
  const comprehensiveStatus = getComprehensiveStatus(slot);
  const relatedInvite = invites.find(
    (invite) =>
      invite.team?.id === slot.teamId ||
      (invite.email && invite.email.toLowerCase() === slot.ownerEmail?.toLowerCase()),
  );
  const isRowBusy = Boolean(busyAction);
  const getTeamDataFromSlot = () => ({
    name: slot.teamName || "",
    abbreviation: slot.teamAbbreviation || "",
    divisionLabel: slot.divisionLabel || "",
  });

  switch (comprehensiveStatus) {
    case "open_slot":
      return (
        <div className="flex items-center gap-2">
          <InviteUserAction slot={slot} onInviteMember={onInviteMember} disabled={isRowBusy} />
        </div>
      );

    case "team_created_no_owner":
      return (
        <div className="flex items-center gap-1">
          <button onClick={() => onEditTeam(slot.teamId!, getTeamDataFromSlot())} className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 hover:border-slate-500 disabled:opacity-50" disabled={isRowBusy}>Edit</button>
          <InviteUserAction slot={slot} onInviteMember={onInviteMember} disabled={isRowBusy} />
          <RemoveTeamAction slot={slot} disabled={isRowBusy} onRemoveTeam={onRemoveTeam} />
        </div>
      );

    case "invite_pending":
    case "invite_delivery_failed":
    case "invite_not_configured":
      return (
        <div className="flex items-center gap-1">
          {slot.teamId && (
            <button onClick={() => onEditTeam(slot.teamId!, getTeamDataFromSlot())} className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 hover:border-slate-500 disabled:opacity-50" disabled={isRowBusy}>Edit</button>
          )}
          {relatedInvite && (
            <>
              <button onClick={() => onResendInvite(relatedInvite)} className="rounded border border-amber-600 px-2 py-1 text-xs text-amber-300 hover:text-amber-100 hover:border-amber-500 disabled:opacity-50" disabled={isRowBusy}>Resend</button>
              {copyFreshLinkEnabled && (
                <button onClick={() => onCopyInviteLink(relatedInvite)} className="rounded border border-sky-600 px-2 py-1 text-xs text-sky-300 hover:text-sky-100 hover:border-sky-500 disabled:opacity-50" disabled={isRowBusy}>Copy</button>
              )}
              <button onClick={() => onRevokeInvite(relatedInvite)} className="rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:text-red-100 hover:border-red-500 disabled:opacity-50" disabled={isRowBusy}>Revoke</button>
            </>
          )}
        </div>
      );

    case "owner_joined":
      return (
        <div className="flex items-center gap-1">
          <button onClick={() => onEditTeam(slot.teamId!, getTeamDataFromSlot())} className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 hover:border-slate-500 disabled:opacity-50" disabled={isRowBusy}>Edit</button>
          <ViewTeamAction slot={slot} disabled={isRowBusy} onViewTeam={onViewTeam} />
        </div>
      );

    case "invite_revoked":
    case "invite_expired":
      return (
        <div className="flex items-center gap-1">
          <button onClick={() => onEditTeam(slot.teamId!, getTeamDataFromSlot())} className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 hover:border-slate-500 disabled:opacity-50" disabled={isRowBusy}>Edit</button>
          <InviteUserAction slot={slot} onInviteMember={onInviteMember} disabled={isRowBusy} />
        </div>
      );

    default:
      return <span className="text-xs text-slate-500">—</span>;
  }
}

// ── TeamSlotRow ────────────────────────────────────────────────────────────

export function TeamSlotRow({
  slot,
  busyAction,
  onEditTeam,
  onInviteMember,
  onResendInvite,
  onRevokeInvite,
  onCopyInviteLink,
  onRemoveTeam,
  onViewTeam,
  invites,
  copyFreshLinkEnabled,
}: {
  slot: TeamSlot;
  busyAction: string | null;
  onEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
  onResendInvite: (invite: CommissionerInviteRow) => Promise<void>;
  onRevokeInvite: (invite: CommissionerInviteRow) => Promise<void>;
  onCopyInviteLink: (invite: CommissionerInviteRow) => Promise<void>;
  onRemoveTeam?: (teamId: string) => Promise<void>;
  onViewTeam?: (teamId: string) => void;
  invites: CommissionerInviteRow[];
  copyFreshLinkEnabled: boolean;
}) {
  const comprehensiveStatus = getComprehensiveStatus(slot);

  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="p-3 text-sm font-medium text-slate-200">#{slot.slotNumber}</td>
      <td className="p-3">
        {slot.teamName ? (
          <div>
            <div className="text-sm font-medium text-slate-100">{slot.teamName}</div>
            {slot.teamAbbreviation && <div className="text-xs text-slate-400">{slot.teamAbbreviation}</div>}
          </div>
        ) : (
          <span className="text-sm text-slate-500 italic">No team created</span>
        )}
      </td>
      <td className="p-3">
        {slot.ownerName ? (
          <div>
            <div className="text-sm font-medium text-slate-100">{slot.ownerName}</div>
            {slot.ownerEmail && <div className="text-xs text-slate-400">{slot.ownerEmail}</div>}
          </div>
        ) : slot.ownerEmail ? (
          <div>
            <div className="text-sm text-slate-300">
              {comprehensiveStatus === "invite_pending" ? "Invited" :
               comprehensiveStatus === "invite_delivery_failed" ? "Invite Created" :
               comprehensiveStatus === "invite_not_configured" ? "Invite Created" :
               comprehensiveStatus === "invite_revoked" ? "Revoked" :
               comprehensiveStatus === "invite_expired" ? "Expired" : "Invited"}
            </div>
            <div className="text-xs text-slate-400">{slot.ownerEmail}</div>
            {comprehensiveStatus === "invite_delivery_failed" && slot.inviteDeliveryDetail && (
              <div className="text-xs text-orange-400 mt-1">Email delivery failed. {slot.inviteDeliveryDetail}</div>
            )}
            {comprehensiveStatus === "invite_not_configured" && (
              <div className="text-xs text-blue-400 mt-1">Email delivery disabled in this environment. Invite is valid and can be copied or resent.</div>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-500 italic">
            {comprehensiveStatus === "team_created_no_owner" ? "No owner assigned" : "No owner"}
          </span>
        )}
      </td>
      <td className="p-3">
        {slot.divisionLabel && <span className="text-sm text-slate-300">{slot.divisionLabel}</span>}
      </td>
      <td className="p-3">{getStatusBadge(slot)}</td>
      <td className="p-3">
        <TeamSlotActions
          slot={slot}
          busyAction={busyAction}
          onEditTeam={onEditTeam}
          onInviteMember={onInviteMember}
          onResendInvite={onResendInvite}
          onRevokeInvite={onRevokeInvite}
          onCopyInviteLink={onCopyInviteLink}
          onRemoveTeam={onRemoveTeam}
          onViewTeam={onViewTeam}
          invites={invites}
          copyFreshLinkEnabled={copyFreshLinkEnabled}
        />
      </td>
    </tr>
  );
}
