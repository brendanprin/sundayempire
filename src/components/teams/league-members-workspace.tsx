"use client";

import { InviteManagementPanel, type CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { LeagueSizeControl } from "@/components/teams/league-size-control";
import { TeamSlotRow } from "@/components/teams/team-slot-row";

// ── Types ──────────────────────────────────────────────────────────────────

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
  inviteDeliveryState?: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown" | null;
  inviteDeliveryDetail?: string | null;
};

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
  onSlotRemoveTeam?: (teamId: string) => Promise<void>;
  onSlotViewTeam?: (teamId: string) => void;
  onSetupBulkValidate: () => Promise<void>;
  onSetupBulkApply: () => Promise<void>;
  onSetupInviteResend: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupInviteRevoke: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupCopyFreshInviteLink: (invite: CommissionerInviteRow) => Promise<void>;
  onChangeLeagueSize?: (newSize: number) => Promise<void>;
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function buildInviteSuccessMessage(
  ownerName: string,
  teamName: string,
  deliveryInfo: { label: string; detail: string },
): string {
  const inviteSuccess = `Invite created for ${ownerName} and team ${teamName}.`;

  if (
    deliveryInfo.label.toLowerCase().includes("not configured") ||
    deliveryInfo.label.toLowerCase().includes("disabled")
  ) {
    return `${inviteSuccess} Email delivery is disabled in this environment. The invite is still valid and can be copied or resent later.`;
  }

  if (deliveryInfo.label.toLowerCase().includes("failed")) {
    return `${inviteSuccess} Email delivery failed, but the invite is still valid and can be resent. ${deliveryInfo.detail}`;
  }

  if (deliveryInfo.label.toLowerCase().includes("sent")) {
    return `${inviteSuccess} ${deliveryInfo.label}: ${deliveryInfo.detail}`;
  }

  return `${inviteSuccess} ${deliveryInfo.label}: ${deliveryInfo.detail}`;
}

// ── Main workspace ─────────────────────────────────────────────────────────

export function LeagueMembersWorkspace(props: LeagueMembersWorkspaceProps) {
  const { summary, teamSlots } = props;

  const nextAction =
    summary.openSlots > 0
      ? `Add ${summary.openSlots} more team${summary.openSlots === 1 ? "" : "s"}`
      : summary.pendingInvites > 0
        ? "Follow up on pending invites"
        : "League setup complete";

  const prominentSummary = [
    `${summary.totalSlots}-team league`,
    summary.createdTeams > 0 ? `${summary.createdTeams} team${summary.createdTeams === 1 ? "" : "s"} created` : null,
    summary.claimedTeams > 0 ? `${summary.claimedTeams} joined owner${summary.claimedTeams === 1 ? "" : "s"}` : null,
    summary.pendingInvites > 0 ? `${summary.pendingInvites} pending invite${summary.pendingInvites === 1 ? "" : "s"}` : null,
    summary.openSlots > 0 ? `${summary.openSlots} open slot${summary.openSlots === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
                {summary.pendingInvites} pending invite{summary.pendingInvites === 1 ? "" : "s"}
              </span>
            )}
            {summary.openSlots > 0 && (
              <span className="shell-chip shell-chip--neutral">
                {summary.openSlots} open slot{summary.openSlots === 1 ? "" : "s"}
              </span>
            )}
          </div>
        }
      />

      {/* League Size Summary */}
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-medium text-slate-100 mb-1">{prominentSummary}</div>
            <div className="text-sm text-slate-400">League configuration and team slot status overview</div>
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
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Slot</th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Team</th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Owner/Manager</th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Division</th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
                <th className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {teamSlots.map((slot) => (
                <TeamSlotRow
                  key={slot.id}
                  slot={slot}
                  busyAction={props.setupOpsBusyAction}
                  onEditTeam={props.onSlotEditTeam}
                  onCreateTeam={props.onSlotCreateTeam}
                  onInviteMember={props.onSlotInviteMember}
                  onResendInvite={props.onSetupInviteResend}
                  onRevokeInvite={props.onSetupInviteRevoke}
                  onCopyInviteLink={props.onSetupCopyFreshInviteLink}
                  onRemoveTeam={props.onSlotRemoveTeam}
                  onViewTeam={props.onSlotViewTeam}
                  invites={props.invites}
                  copyFreshLinkEnabled={props.setupInviteCopyFreshLinkEnabled}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Tools & Utilities */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-slate-100">Bulk Tools & Utilities</h3>

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
                placeholder={`team_name,owner_name,owner_email,abbreviation,division\nTeam Alpha,John Doe,john@example.com,ALPH,North\nTeam Beta,Jane Smith,jane@example.com,BETA,South`}
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
