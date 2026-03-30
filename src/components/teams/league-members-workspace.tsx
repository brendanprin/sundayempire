"use client";

import { FormEvent, useState } from "react";
import { InviteManagementPanel, type CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import { PageHeaderBand } from "@/components/layout/page-header-band";

// Types for team slot management
type TeamSlotStatus = "filled" | "pending_invite" | "open";
type InviteStatus = "pending" | "expired" | "accepted" | "revoked" | null;

// Comprehensive status that combines team + invite + delivery state
type ComprehensiveSlotStatus = 
  | "open_slot"                    // No team, no invite
  | "team_created_no_owner"        // Team exists, no owner assigned
  | "invite_pending"               // Invite sent and pending
  | "invite_delivery_failed"       // Invite failed to deliver
  | "invite_not_configured"        // Delivery system not set up
  | "owner_joined"                 // Owner has joined
  | "invite_revoked"               // Invite was revoked
  | "invite_expired";              // Invite has expired

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
  // Enhanced invite delivery information
  inviteDeliveryState?: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown" | null;
  inviteDeliveryDetail?: string | null;
};

function LeagueSizeControl({ 
  summary, 
  onChangeLeagueSize, 
  busyAction 
}: {
  summary: LeagueMembersSummary;
  onChangeLeagueSize?: (newSize: number) => Promise<void>;
  busyAction: string | null;
}) {
  const [showSizeForm, setShowSizeForm] = useState(false);
  const [newSize, setNewSize] = useState(summary.totalSlots.toString());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const size = parseInt(newSize, 10);
    
    if (size < summary.filledSlots) {
      alert(`Cannot reduce league size below ${summary.filledSlots} (current filled teams)`);
      return;
    }
    
    if (size < 4 || size > 32) {
      alert('League size must be between 4 and 32 teams');
      return;
    }
    
    setLoading(true);
    try {
      if (onChangeLeagueSize) {
        await onChangeLeagueSize(size);
        setShowSizeForm(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!summary.canChangeSize || !onChangeLeagueSize) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {!showSizeForm ? (
        <button
          onClick={() => setShowSizeForm(true)}
          className="rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-700/50 transition"
          disabled={Boolean(busyAction)}
        >
          Change Size
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="number"
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            min={Math.max(4, summary.filledSlots)}
            max={32}
            className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
            disabled={loading}
          />
          <button
            type="submit"
            className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            disabled={loading || Boolean(busyAction)}
          >
            {loading ? "..." : "Set"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSizeForm(false);
              setNewSize(summary.totalSlots.toString());
            }}
            className="rounded bg-slate-600 px-2 py-1 text-xs font-medium text-white hover:bg-slate-500"
            disabled={loading}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

export type LeagueMembersSummary = {
  totalSlots: number;
  filledSlots: number;
  openSlots: number;
  pendingInvites: number;
  createdTeams: number;
  claimedTeams: number;
  leagueName: string;
  canChangeSize: boolean;
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
  onChangeLeagueSize?: (newSize: number) => Promise<void>;
}

// Determine comprehensive status combining team, invite, and delivery states
function getComprehensiveStatus(slot: TeamSlot): ComprehensiveSlotStatus {
  // Owner has joined (filled slot with owner)
  if (slot.status === "filled" && slot.ownerName) {
    return "owner_joined";
  }
  
  // Team created but no owner assigned yet
  if (slot.teamName && !slot.ownerName && !slot.ownerEmail) {
    return "team_created_no_owner";
  }
  
  // Handle invite states
  if (slot.status === "pending_invite" || slot.ownerEmail) {
    if (slot.inviteStatus === "revoked") {
      return "invite_revoked";
    }
    if (slot.inviteStatus === "expired") {
      return "invite_expired";
    }
    if (slot.inviteDeliveryState === "failed") {
      return "invite_delivery_failed";
    }
    if (slot.inviteDeliveryState === "not_configured") {
      return "invite_not_configured";
    }
    return "invite_pending";
  }
  
  // Default to open slot
  return "open_slot";
}

function getStatusBadge(slot: TeamSlot) {
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
          Invite Delivery Failed
        </span>
      );
    
    case "invite_not_configured":
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-400/10 px-2 py-1 text-xs font-medium text-yellow-400 ring-1 ring-inset ring-yellow-400/20">
          Delivery Unavailable
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

function TeamSetupModes({
  busyAction,
  setupBulkCsvText,
  setupBulkBusyAction,
  setupBulkValidation,
  setupBulkError,
  setupBulkMessage,
  setSetupBulkCsvText,
  onSetupBulkValidate,
  onSetupBulkApply,
  onSlotCreateTeam,
  onSlotInviteMember
}: {
  busyAction: string | null;
  setupBulkCsvText: string;
  setupBulkBusyAction: "validate" | "apply" | null;
  setupBulkValidation: any;
  setupBulkError: string | null;
  setupBulkMessage: string | null;
  setSetupBulkCsvText: (value: string) => void;
  onSetupBulkValidate: () => Promise<void>;
  onSetupBulkApply: () => Promise<void>;
  onSlotCreateTeam: (slotNumber: number, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onSlotInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
}) {
  const [activeMode, setActiveMode] = useState<'team' | 'invite' | 'bulk'>('team');
  
  // Single team form state
  const [teamName, setTeamName] = useState("");
  const [teamAbbreviation, setTeamAbbreviation] = useState("");
  const [divisionLabel, setDivisionLabel] = useState("");
  
  // Team + invite form state
  const [inviteOwnerName, setInviteOwnerName] = useState("");
  const [inviteOwnerEmail, setInviteOwnerEmail] = useState("");
  const [inviteTeamName, setInviteTeamName] = useState("");
  const [inviteTeamAbbreviation, setInviteTeamAbbreviation] = useState("");
  const [inviteDivisionLabel, setInviteDivisionLabel] = useState("");

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Find the next available slot
    const nextSlot = 1; // This would need to be calculated based on available slots
    await onSlotCreateTeam(nextSlot, {
      name: teamName.trim(),
      abbreviation: teamAbbreviation.trim(),
      divisionLabel: divisionLabel.trim()
    });
    // Reset form
    setTeamName("");
    setTeamAbbreviation("");
    setDivisionLabel("");
  };

  const handleCreateTeamAndInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Find the next available slot
    const nextSlot = 1; // This would need to be calculated based on available slots
    await onSlotInviteMember(nextSlot, {
      ownerName: inviteOwnerName.trim(),
      ownerEmail: inviteOwnerEmail.trim(),
      teamName: inviteTeamName.trim(),
      teamAbbreviation: inviteTeamAbbreviation.trim(),
      divisionLabel: inviteDivisionLabel.trim()
    });
    // Reset form
    setInviteOwnerName("");
    setInviteOwnerEmail("");
    setInviteTeamName("");
    setInviteTeamAbbreviation("");
    setInviteDivisionLabel("");
  };

  const modes = [
    {
      id: 'team' as const,
      label: 'Add Team Only',
      description: 'Create a single team without assigning an owner',
      icon: '🏆',
      recommended: 'Best for adding teams you\'ll assign owners to later'
    },
    {
      id: 'invite' as const,
      label: 'Add Team + Invite Owner',
      description: 'Create a team and immediately invite someone to manage it',
      icon: '📧',
      recommended: 'Best when you know who will manage the team'
    },
    {
      id: 'bulk' as const,
      label: 'Import Multiple Teams',
      description: 'Upload a CSV file to create many teams and invites at once',
      icon: '📊',
      recommended: 'Best for setting up entire leagues quickly'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <div>
        <h3 className="text-lg font-medium text-slate-100 mb-4">Add Teams to Your League</h3>
        
        {/* Tab Navigation */}
        <div className="border-b border-slate-700">
          <nav className="flex space-x-8">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeMode === mode.id
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Active Mode Content */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/20 p-6">
        {/* Mode Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{modes.find(m => m.id === activeMode)?.icon}</span>
            <h4 className="text-lg font-medium text-slate-100">
              {modes.find(m => m.id === activeMode)?.label}
            </h4>
          </div>
          <p className="text-sm text-slate-400 mb-1">
            {modes.find(m => m.id === activeMode)?.description}
          </p>
          <p className="text-xs text-sky-400">
            💡 {modes.find(m => m.id === activeMode)?.recommended}
          </p>
        </div>

        {/* Single Team Mode */}
        {activeMode === 'team' && (
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Lightning Bolts"
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  required
                  disabled={Boolean(busyAction)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Abbreviation
                </label>
                <input
                  type="text"
                  value={teamAbbreviation}
                  onChange={(e) => setTeamAbbreviation(e.target.value)}
                  placeholder="e.g., LB"
                  maxLength={4}
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  disabled={Boolean(busyAction)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Division
                </label>
                <input
                  type="text"
                  value={divisionLabel}
                  onChange={(e) => setDivisionLabel(e.target.value)}
                  placeholder="e.g., North"
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  disabled={Boolean(busyAction)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                disabled={Boolean(busyAction) || !teamName.trim()}
              >
                Create Team
              </button>
            </div>
          </form>
        )}

        {/* Team + Invite Mode */}
        {activeMode === 'invite' && (
          <form onSubmit={handleCreateTeamAndInvite} className="space-y-6">
            <div className="space-y-4">
              <h5 className="text-sm font-medium text-slate-200 border-b border-slate-700 pb-2">
                Owner Information
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Owner Name *
                  </label>
                  <input
                    type="text"
                    value={inviteOwnerName}
                    onChange={(e) => setInviteOwnerName(e.target.value)}
                    placeholder="e.g., John Smith"
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    required
                    disabled={Boolean(busyAction)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Owner Email *
                  </label>
                  <input
                    type="email"
                    value={inviteOwnerEmail}
                    onChange={(e) => setInviteOwnerEmail(e.target.value)}
                    placeholder="e.g., john@example.com"
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    required
                    disabled={Boolean(busyAction)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h5 className="text-sm font-medium text-slate-200 border-b border-slate-700 pb-2">
                Team Information
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    value={inviteTeamName}
                    onChange={(e) => setInviteTeamName(e.target.value)}
                    placeholder="e.g., Lightning Bolts"
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    required
                    disabled={Boolean(busyAction)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Abbreviation
                  </label>
                  <input
                    type="text"
                    value={inviteTeamAbbreviation}
                    onChange={(e) => setInviteTeamAbbreviation(e.target.value)}
                    placeholder="e.g., LB"
                    maxLength={4}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    disabled={Boolean(busyAction)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Division
                  </label>
                  <input
                    type="text"
                    value={inviteDivisionLabel}
                    onChange={(e) => setInviteDivisionLabel(e.target.value)}
                    placeholder="e.g., North"
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    disabled={Boolean(busyAction)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                disabled={Boolean(busyAction) || !inviteOwnerName.trim() || !inviteOwnerEmail.trim() || !inviteTeamName.trim()}
              >
                Create Team & Send Invite
              </button>
            </div>
          </form>
        )}

        {/* Bulk Import Mode */}
        {activeMode === 'bulk' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                CSV Data
              </label>
              <p className="text-xs text-slate-400">
                Upload data in format: team_name,owner_name,owner_email,abbreviation,division
              </p>
              <textarea
                value={setupBulkCsvText}
                onChange={(e) => setSetupBulkCsvText(e.target.value)}
                placeholder="team_name,owner_name,owner_email,abbreviation,division&#10;Lightning Bolts,John Smith,john@example.com,LB,North&#10;Thunder Hawks,Jane Doe,jane@example.com,TH,South"
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono"
                rows={8}
                disabled={Boolean(setupBulkBusyAction)}
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={onSetupBulkValidate}
                className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                disabled={Boolean(setupBulkBusyAction) || !setupBulkCsvText.trim()}
              >
                {setupBulkBusyAction === "validate" ? "Validating..." : "Validate CSV"}
              </button>
              
              {setupBulkValidation && (
                <button
                  onClick={onSetupBulkApply}
                  className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500 disabled:opacity-50"
                  disabled={Boolean(setupBulkBusyAction)}
                >
                  {setupBulkBusyAction === "apply" ? "Importing..." : "Import All Teams"}
                </button>
              )}
            </div>

            {setupBulkError && (
              <div className="rounded bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {setupBulkError}
              </div>
            )}
            
            {setupBulkMessage && (
              <div className="rounded bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
                {setupBulkMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamSlotRow({ 
  slot, 
  busyAction, 
  onEditTeam 
}: {
  slot: TeamSlot;
  busyAction: string | null;
  onEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
}) {
  const comprehensiveStatus = getComprehensiveStatus(slot);
  
  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="p-3 text-sm font-medium text-slate-200">
        #{slot.slotNumber}
      </td>
      <td className="p-3">
        {slot.teamName ? (
          <div>
            <div className="text-sm font-medium text-slate-100">{slot.teamName}</div>
            {slot.teamAbbreviation && (
              <div className="text-xs text-slate-400">{slot.teamAbbreviation}</div>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-500 italic">No team created</span>
        )}
      </td>
      <td className="p-3">
        {slot.ownerName ? (
          // Owner has joined
          <div>
            <div className="text-sm font-medium text-slate-100">{slot.ownerName}</div>
            {slot.ownerEmail && (
              <div className="text-xs text-slate-400">{slot.ownerEmail}</div>
            )}
          </div>
        ) : slot.ownerEmail ? (
          // Invited but not yet joined
          <div>
            <div className="text-sm text-slate-300">
              {comprehensiveStatus === "invite_pending" ? "Invited" :
               comprehensiveStatus === "invite_delivery_failed" ? "Invite Failed" :
               comprehensiveStatus === "invite_not_configured" ? "Delivery Issue" :
               comprehensiveStatus === "invite_revoked" ? "Revoked" :
               comprehensiveStatus === "invite_expired" ? "Expired" : "Invited"}
            </div>
            <div className="text-xs text-slate-400">{slot.ownerEmail}</div>
            {comprehensiveStatus === "invite_delivery_failed" && slot.inviteDeliveryDetail && (
              <div className="text-xs text-orange-400 mt-1">{slot.inviteDeliveryDetail}</div>
            )}
            {comprehensiveStatus === "invite_not_configured" && slot.inviteDeliveryDetail && (
              <div className="text-xs text-yellow-400 mt-1">{slot.inviteDeliveryDetail}</div>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-500 italic">
            {comprehensiveStatus === "team_created_no_owner" ? "No owner assigned" : "No owner"}
          </span>
        )}
      </td>
      <td className="p-3">
        {slot.divisionLabel && (
          <span className="text-sm text-slate-300">{slot.divisionLabel}</span>
        )}
      </td>
      <td className="p-3">
        {getStatusBadge(slot)}
      </td>
      <td className="p-3">
        <TeamSlotActions
          slot={slot}
          busyAction={busyAction}
          onEditTeam={onEditTeam}
        />
      </td>
    </tr>
  );
}

function TeamSlotActions({
  slot,
  busyAction,
  onEditTeam
}: {
  slot: TeamSlot;
  busyAction: string | null;
  onEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
}) {
  if (slot.status === "open") {
    return (
      <span className="text-xs text-slate-500 italic">
        Available
      </span>
    );
  }

  if (slot.status === "pending_invite") {
    return (
      <span className="text-xs text-slate-500 italic">
        Pending
      </span>
    );
  }

  if (slot.status === "filled" && slot.teamId) {
    return (
      <button
        onClick={() => onEditTeam(slot.teamId!, { name: slot.teamName || "", abbreviation: slot.teamAbbreviation || "", divisionLabel: slot.divisionLabel || "" })}
        className="rounded bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-500"
        disabled={Boolean(busyAction)}
      >
        Edit Team
      </button>
    );
  }

  return <span className="text-xs text-slate-500">—</span>;
}

export function LeagueMembersWorkspace(props: LeagueMembersWorkspaceProps) {
  const { summary, teamSlots } = props;
  
  // Calculate what the next action should be
  const nextAction = summary.openSlots > 0 
    ? `Add ${summary.openSlots} more team${summary.openSlots === 1 ? '' : 's'}`
    : summary.pendingInvites > 0 
    ? "Follow up on pending invites" 
    : "League setup complete";

  // Build prominent summary text like: "12-team league · 3 teams created · 1 joined owner · 2 pending invites · 9 open slots"
  const prominentSummary = [
    `${summary.totalSlots}-team league`,
    summary.createdTeams > 0 ? `${summary.createdTeams} team${summary.createdTeams === 1 ? '' : 's'} created` : null,
    summary.claimedTeams > 0 ? `${summary.claimedTeams} joined owner${summary.claimedTeams === 1 ? '' : 's'}` : null,
    summary.pendingInvites > 0 ? `${summary.pendingInvites} pending invite${summary.pendingInvites === 1 ? '' : 's'}` : null,
    summary.openSlots > 0 ? `${summary.openSlots} open slot${summary.openSlots === 1 ? '' : 's'}` : null
  ].filter(Boolean).join(' · ');

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

      {/* Prominent League Size Summary */}
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-medium text-slate-100 mb-1">
              {prominentSummary}
            </div>
            <div className="text-sm text-slate-400">
              League configuration and team slot status overview
            </div>
          </div>
          <LeagueSizeControl
            summary={summary}
            onChangeLeagueSize={props.onChangeLeagueSize}
            busyAction={props.setupOpsBusyAction}
          />
        </div>
      </div>

      {/* Team Slots Table */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/20">
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
                  Owner/Manager
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Division
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
                Import multiple teams and invitations at once using CSV format.
              </p>
            </div>
            
            <div className="space-y-3">
              <textarea
                value={props.setupBulkCsvText}
                onChange={(e) => props.setSetupBulkCsvText(e.target.value)}
                placeholder="team_name,owner_name,owner_email,abbreviation,division&#10;Team Alpha,John Doe,john@example.com,ALPH,North&#10;Team Beta,Jane Smith,jane@example.com,BETA,South"
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono"
                rows={6}
                disabled={Boolean(props.setupBulkBusyAction)}
              />
              
              <div className="flex gap-2">
                <button
                  onClick={props.onSetupBulkValidate}
                  className="rounded bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500"
                  disabled={Boolean(props.setupBulkBusyAction) || !props.setupBulkCsvText.trim()}
                >
                  {props.setupBulkBusyAction === "validate" ? "Validating..." : "Validate CSV"}
                </button>
                
                {props.setupBulkValidation && (
                  <button
                    onClick={props.onSetupBulkApply}
                    className="rounded bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-500"
                    disabled={Boolean(props.setupBulkBusyAction)}
                  >
                    {props.setupBulkBusyAction === "apply" ? "Importing..." : "Import Teams"}
                  </button>
                )}
              </div>
            </div>

            {props.setupBulkError && (
              <div className="rounded bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {props.setupBulkError}
              </div>
            )}
            
            {props.setupBulkMessage && (
              <div className="rounded bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
                {props.setupBulkMessage}
              </div>
            )}
          </div>
        </div>

        {/* Existing Invites Management */}
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
  );
}