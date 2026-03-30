"use client";

import Link from "next/link";
import { FormEvent } from "react";
import {
  InviteManagementPanel,
  type CommissionerInviteRow,
} from "@/components/commissioner/invite-management-panel";
import { GlobalAlertStrip } from "@/components/layout/global-alert-strip";
import { MirrorOnlyBanner } from "@/components/layout/mirror-only-banner";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";

type FounderSetupStatus = "COMPLETE" | "INCOMPLETE_REQUIRED" | "INCOMPLETE_POSTPONED";
type FounderSetupAction = "create" | "claim" | "skip";

type FounderSetupPayload = {
  leagueId: string;
  isComplete: boolean;
  status: FounderSetupStatus;
  hasPostponed: boolean;
  currentTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  claimableTeams: {
    id: string;
    name: string;
    abbreviation: string | null;
    ownerName: string | null;
  }[];
};

interface BootstrapDashboardProps {
  dashboard: LeagueLandingDashboardProjection;
  founderSetup: FounderSetupPayload | null;
  founderSetupLoading: boolean;
  founderSetupError: string | null;
  founderSetupPendingAction: FounderSetupAction | null;
  founderCreateTeamName: string;
  founderCreateTeamAbbreviation: string;
  founderCreateTeamDivisionLabel: string;
  founderClaimTeamId: string;
  setupTeamName: string;
  setupTeamAbbreviation: string;
  setupTeamDivisionLabel: string;
  setupInviteOwnerName: string;
  setupInviteOwnerEmail: string;
  setupInviteTeamName: string;
  setupInviteTeamAbbreviation: string;
  setupInviteDivisionLabel: string;
  setupInvites: CommissionerInviteRow[];
  setupInviteCopyFreshLinkEnabled: boolean;
  setupOpsLoading: boolean;
  setupOpsBusyAction: string | null;
  setupOpsError: string | null;
  setupOpsMessage: string | null;
  setupBulkCsvText: string;
  setupBulkBusyAction: "validate" | "apply" | null;
  setupBulkValidation: any;
  setupBulkError: string | null;
  setupBulkMessage: string | null;
  setFounderCreateTeamName: (value: string) => void;
  setFounderCreateTeamAbbreviation: (value: string) => void;
  setFounderCreateTeamDivisionLabel: (value: string) => void;
  setFounderClaimTeamId: (value: string) => void;
  setSetupTeamName: (value: string) => void;
  setSetupTeamAbbreviation: (value: string) => void;
  setSetupTeamDivisionLabel: (value: string) => void;
  setSetupInviteOwnerName: (value: string) => void;
  setSetupInviteOwnerEmail: (value: string) => void;
  setSetupInviteTeamName: (value: string) => void;
  setSetupInviteTeamAbbreviation: (value: string) => void;
  setSetupInviteDivisionLabel: (value: string) => void;
  setSetupBulkCsvText: (value: string) => void;
  onFounderCreateSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onFounderClaimSubmit: () => Promise<void>;
  onFounderSkip: () => Promise<void>;
  onSetupCreateTeamSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSetupInviteSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSetupBulkValidate: () => Promise<void>;
  onSetupBulkApply: () => Promise<void>;
  onSetupInviteResend: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupInviteRevoke: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupCopyFreshInviteLink: (invite: CommissionerInviteRow) => Promise<void>;
}

export function BootstrapDashboard(props: BootstrapDashboardProps) {
  const { dashboard, founderSetup, setupInvites } = props;
  
  const mirrorOnly = dashboard.leagueDashboard.status.mirrorOnly;
  const visibleAlerts = dashboard.alerts.filter((alert) => !(mirrorOnly && alert.id === "league-status"));
  
  const completedSteps = [
    founderSetup?.isComplete,
    dashboard.leagueDashboard.summary.teamCount >= 2,
    dashboard.leagueDashboard.summary.membershipCount >= 2 || setupInvites.some(invite => invite.status === "pending"),
  ].filter(Boolean).length;
  
  const totalSteps = 3;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const nextStepTitle = !founderSetup?.isComplete
    ? "Set up your founder team" 
    : dashboard.leagueDashboard.summary.teamCount < 2
    ? "Add additional teams"
    : "Invite league members";

  const nextStepDescription = !founderSetup?.isComplete
    ? "Complete commissioner + team-owner setup to establish your dual role."
    : dashboard.leagueDashboard.summary.teamCount < 2  
    ? "Create teams for other league members to join."
    : "Send invites so members can join and claim their teams.";

  return (
    <div className="space-y-6" data-testid="league-bootstrap-dashboard">
      <PageHeaderBand
        eyebrow="New League Setup"
        eyebrowTestId="bootstrap-dashboard-eyebrow"
        title={`Welcome to ${dashboard.leagueDashboard.league.name}`}
        titleTestId="bootstrap-dashboard-league-name"
        description="Let's get your dynasty football league operational. Complete these essential steps to prepare for your first season."
        supportingContent={
          <div className="flex flex-wrap items-center gap-3">
            <span className="shell-chip shell-chip--accent">
              {completedSteps}/{totalSteps} bootstrap steps complete
            </span>
            <span className="shell-chip shell-chip--neutral">
              Season {dashboard.leagueDashboard.season?.year ?? "Setup"}
            </span>
            <span className="shell-chip shell-chip--neutral">
              Commissioner Mode
            </span>
          </div>
        }
      />

      {mirrorOnly ? (
        <MirrorOnlyBanner
          message="Regular season mirror-only mode is active"
          detail="Roster changes are blocked until post-season. Use the dashboard for cap, contract, and compliance visibility."
        />
      ) : null}

      <GlobalAlertStrip
        alerts={visibleAlerts}
        testId="bootstrap-dashboard-alert-strip"
        itemTestIdPrefix="bootstrap-dashboard-alert"
      />

      {/* Simplified Progress Indicator */}
      <div
        className="rounded-xl border border-slate-600/40 bg-slate-950/40 p-4"
        data-testid="bootstrap-progress-overview"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-medium text-slate-200">League Setup Progress</h2>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className={founderSetup?.isComplete ? "text-emerald-400" : "text-amber-400"}>
                {founderSetup?.isComplete ? "✓" : "1"} Founder
              </span>
              <span className="text-slate-600">·</span>
              <span className={dashboard.leagueDashboard.summary.teamCount >= 2 ? "text-emerald-400" : "text-slate-400"}>
                {dashboard.leagueDashboard.summary.teamCount >= 2 ? "✓" : "2"} Teams
              </span>
              <span className="text-slate-600">·</span>
              <span className={dashboard.leagueDashboard.summary.membershipCount >= 2 ? "text-emerald-400" : "text-slate-400"}>
                {dashboard.leagueDashboard.summary.membershipCount >= 2 ? "✓" : "3"} Members
              </span>
            </div>
          </div>
          <div className="rounded-full border border-slate-500/60 bg-slate-900/60 px-3 py-1 text-sm text-slate-300">
            {progressPercent}% Complete
          </div>
        </div>
        
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Primary Action: Founder Team Setup */}
      {!founderSetup?.isComplete && (
        <section
          id="founder-team-setup"
          className="space-y-4 rounded-2xl border-2 border-amber-500/60 bg-[linear-gradient(160deg,rgba(245,158,11,0.15),rgba(15,23,42,0.94)_40%,rgba(2,6,23,0.96))] p-6 shadow-[0_24px_64px_rgba(245,158,11,0.25)]"
          data-testid="bootstrap-founder-team-setup"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                  Primary Action
                </span>
              </div>
              <h2 className="mt-2 text-xl font-bold text-amber-100">Set Up Your Founder Team</h2>
              <p className="mt-2 text-amber-50/90">
                As league commissioner, you can also own a team. Choose your franchise now or postpone for later.
              </p>
            </div>
            <span
              className="rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-100"
              data-testid="bootstrap-founder-status"
            >
              {props.founderSetupLoading ? "Checking" : founderSetup?.status === "INCOMPLETE_POSTPONED" ? "Postponed" : "Required"}
            </span>
          </div>

          {founderSetup?.status === "INCOMPLETE_POSTPONED" && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
              Team setup is postponed and still incomplete.
            </div>
          )}

          {props.founderSetupError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100">
              {props.founderSetupError}
            </div>
          )}

          {props.founderSetupLoading ? (
            <p className="text-sm text-amber-100/80">Loading founder team options...</p>
          ) : founderSetup ? (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <form
                  className="space-y-3 rounded-xl border border-amber-800/40 bg-black/20 p-4"
                  onSubmit={props.onFounderCreateSubmit}
                  data-testid="bootstrap-founder-create-form"
                >
                  <h3 className="text-sm font-medium text-amber-100">Create New Team</h3>
                  <label className="block text-xs text-amber-100/90">
                    Team name
                    <input
                      value={props.founderCreateTeamName}
                      onChange={(event) => props.setFounderCreateTeamName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      placeholder="Empire Originals"
                      data-testid="bootstrap-founder-name-input"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-amber-100/90">
                      Abbreviation
                      <input
                        value={props.founderCreateTeamAbbreviation}
                        onChange={(event) => props.setFounderCreateTeamAbbreviation(event.target.value)}
                        className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                        placeholder="EOR"
                        data-testid="bootstrap-founder-abbr-input"
                      />
                    </label>
                    <label className="block text-xs text-amber-100/90">
                      Division
                      <input
                        value={props.founderCreateTeamDivisionLabel}
                        onChange={(event) => props.setFounderCreateTeamDivisionLabel(event.target.value)}
                        className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="East"
                        data-testid="bootstrap-founder-division-input"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-md border border-amber-500/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(props.founderSetupPendingAction)}
                    data-testid="bootstrap-founder-create-submit"
                  >
                    {props.founderSetupPendingAction === "create" ? "Creating..." : "Create My Team"}
                  </button>
                </form>

                <div className="space-y-3 rounded-xl border border-amber-800/40 bg-black/20 p-4">
                  <h3 className="text-sm font-medium text-amber-100">Claim Existing Team</h3>
                  {founderSetup.claimableTeams.length > 0 ? (
                    <>
                      <label className="block text-xs text-amber-100/90">
                        Available teams
                        <select
                          value={props.founderClaimTeamId}
                          onChange={(event) => props.setFounderClaimTeamId(event.target.value)}
                          className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                          data-testid="bootstrap-founder-claim-select"
                        >
                          {founderSetup.claimableTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                              {team.abbreviation ? ` (${team.abbreviation})` : ""}
                              {team.ownerName ? ` · ${team.ownerName}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="w-full rounded-md border border-amber-500/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={props.onFounderClaimSubmit}
                        disabled={Boolean(props.founderSetupPendingAction) || !props.founderClaimTeamId}
                        data-testid="bootstrap-founder-claim-submit"
                      >
                        {props.founderSetupPendingAction === "claim" ? "Claiming..." : "Claim This Team"}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-amber-100/80">
                      No teams available to claim yet. Create a new team or add teams first.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/40 bg-black/20 p-4">
                <p className="text-xs text-amber-100/80">
                  Skip for now keeps your commissioner role and marks founder setup as incomplete.
                </p>
                <button
                  type="button"
                  className="rounded-md border border-amber-500/60 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={props.onFounderSkip}
                  disabled={Boolean(props.founderSetupPendingAction)}
                  data-testid="bootstrap-founder-skip"
                >
                  {props.founderSetupPendingAction === "skip" ? "Saving..." : "Skip For Now"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* League Bootstrap Section */}
      <section
        id="league-bootstrap"
        className="space-y-4 rounded-2xl border border-sky-700/35 bg-sky-950/10 p-6"
        data-testid="bootstrap-league-setup"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300/80">
            Step {founderSetup?.isComplete ? "2 & 3" : "2 (after founder team)"}
          </p>
          <h2 className="mt-1 text-xl font-bold text-sky-100">Build Your League</h2>
          <p className="mt-2 text-sky-50/80">
            Add teams for other members and send invites so they can join your league.
          </p>
        </div>

        {props.setupOpsError && (
          <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100">
            {props.setupOpsError}
          </div>
        )}
        {props.setupOpsMessage && (
          <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
            {props.setupOpsMessage}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="space-y-3 rounded-xl border border-sky-800/40 bg-black/20 p-4"
            onSubmit={props.onSetupCreateTeamSubmit}
            data-testid="bootstrap-create-team-form"
          >
            <h3 className="text-sm font-medium text-sky-100">Create Team</h3>
            <p className="text-xs text-sky-100/70">Add teams for league members to claim when they join.</p>
            <label className="block text-xs text-sky-100/90">
              Team name
              <input
                value={props.setupTeamName}
                onChange={(event) => props.setSetupTeamName(event.target.value)}
                className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                placeholder="Empire Expansion"
                data-testid="bootstrap-team-name"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-sky-100/90">
                Abbreviation
                <input
                  value={props.setupTeamAbbreviation}
                  onChange={(event) => props.setSetupTeamAbbreviation(event.target.value)}
                  className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                  placeholder="EXP"
                  data-testid="bootstrap-team-abbr"
                />
              </label>
              <label className="block text-xs text-sky-100/90">
                Division
                <input
                  value={props.setupTeamDivisionLabel}
                  onChange={(event) => props.setSetupTeamDivisionLabel(event.target.value)}
                  className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="North"
                  data-testid="bootstrap-team-division"
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-md border border-sky-500/70 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(props.setupOpsBusyAction)}
              data-testid="bootstrap-team-submit"
            >
              {props.setupOpsBusyAction === "setup:team:create" ? "Creating..." : "Create Team"}
            </button>
          </form>

          <form
            className="space-y-3 rounded-xl border border-sky-800/40 bg-black/20 p-4"
            onSubmit={props.onSetupInviteSubmit}
            data-testid="bootstrap-invite-form"
          >
            <h3 className="text-sm font-medium text-sky-100">Invite Member + Team</h3>
            <p className="text-xs text-sky-100/70">Send an invite and create their team at the same time.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-sky-100/90">
                Owner name
                <input
                  value={props.setupInviteOwnerName}
                  onChange={(event) => props.setSetupInviteOwnerName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="Alex Owner"
                  data-testid="bootstrap-invite-name"
                />
              </label>
              <label className="block text-xs text-sky-100/90">
                Owner email
                <input
                  value={props.setupInviteOwnerEmail}
                  onChange={(event) => props.setSetupInviteOwnerEmail(event.target.value)}
                  className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="alex@example.com"
                  data-testid="bootstrap-invite-email"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-sky-100/90">
                Team name
                <input
                  value={props.setupInviteTeamName}
                  onChange={(event) => props.setSetupInviteTeamName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="Gridiron Ghosts"
                  data-testid="bootstrap-invite-team"
                />
              </label>
              <label className="block text-xs text-sky-100/90">
                Team abbr
                <input
                  value={props.setupInviteTeamAbbreviation}
                  onChange={(event) => props.setSetupInviteTeamAbbreviation(event.target.value)}
                  className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                  placeholder="GGH"
                  data-testid="bootstrap-invite-team-abbr"
                />
              </label>
            </div>
            <label className="block text-xs text-sky-100/90">
              Division
              <input
                value={props.setupInviteDivisionLabel}
                onChange={(event) => props.setSetupInviteDivisionLabel(event.target.value)}
                className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                placeholder="South"
                data-testid="bootstrap-invite-division"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-md border border-sky-500/70 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(props.setupOpsBusyAction)}
              data-testid="bootstrap-invite-submit"
            >
              {props.setupOpsBusyAction === "setup:invite:create" ? "Inviting..." : "Create Team + Send Invite"}
            </button>
          </form>
        </div>

        {/* Bulk Import Section */}
        <div className="space-y-3 rounded-xl border border-sky-800/35 bg-slate-950/40 p-4">
          <div>
            <h3 className="text-sm font-medium text-sky-100">Bulk Team Import (CSV)</h3>
            <p className="mt-1 text-xs text-slate-300">
              Import multiple teams and invites at once. Validate first, then apply.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Headers: ownerName, ownerEmail, teamName, teamAbbreviation, divisionLabel
            </p>
          </div>

          <textarea
            value={props.setupBulkCsvText}
            onChange={(event) => props.setSetupBulkCsvText(event.target.value)}
            className="min-h-[7rem] w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-xs text-slate-100"
            placeholder="ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel&#10;Alex Owner,alex@example.com,Empire East,EME,East"
            data-testid="bootstrap-bulk-csv"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.onSetupBulkValidate}
              className="rounded-md border border-sky-500/70 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(props.setupBulkBusyAction)}
              data-testid="bootstrap-bulk-validate"
            >
              {props.setupBulkBusyAction === "validate" ? "Validating..." : "Validate CSV"}
            </button>
            <button
              type="button"
              onClick={props.onSetupBulkApply}
              className="rounded-md border border-emerald-500/70 bg-emerald-950/50 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(props.setupBulkBusyAction) || !props.setupBulkValidation || props.setupBulkValidation.summary.validRows === 0}
              data-testid="bootstrap-bulk-apply"
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

        {/* Pending Invites */}
        <div className="rounded-xl border border-sky-800/35 bg-slate-950/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-sky-100">Pending Invites</h3>
            <span className="rounded-full border border-sky-700/50 px-2 py-0.5 text-[11px] text-sky-200">
              {setupInvites.filter((invite) => invite.status === "pending").length} pending
            </span>
          </div>
          {props.setupOpsLoading ? (
            <p className="text-xs text-slate-300">Loading invite status...</p>
          ) : (
            <InviteManagementPanel
              invites={setupInvites}
              copyFreshLinkEnabled={props.setupInviteCopyFreshLinkEnabled}
              busyAction={props.setupOpsBusyAction}
              onResend={props.onSetupInviteResend}
              onRevoke={props.onSetupInviteRevoke}
              onCopyFreshLink={props.onSetupCopyFreshInviteLink}
            />
          )}
        </div>
      </section>

      {/* Quick Actions for Moving Forward */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-slate-100">Ready for the next phase?</h3>
            <p className="mt-1 text-sm text-slate-400">
              Once you have teams and members, review rules and prepare for draft setup.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/rules"
              className="rounded-md border border-slate-600/60 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              Review Rules
            </Link>
            <Link
              href="/commissioner"
              className="rounded-md border border-sky-500/60 bg-sky-950/50 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-400"
            >
              Full Commissioner Tools
            </Link>
          </div>
        </div>
      </div>

      {progressPercent >= 100 && (
        <div className="rounded-xl border border-emerald-600/50 bg-emerald-950/30 p-6 text-center">
          <h3 className="text-lg font-bold text-emerald-100">🎉 Bootstrap Complete!</h3>
          <p className="mt-2 text-emerald-50/80">
            Your league foundation is ready. You'll now see the full commissioner dashboard with advanced features.
          </p>
          <Link
            href={`/league/${dashboard.leagueDashboard.league.id}`}
            className="mt-4 inline-flex rounded-md border border-emerald-500/60 bg-emerald-950/50 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-400"
          >
            View Full Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}