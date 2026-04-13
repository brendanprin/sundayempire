"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  InviteManagementPanel,
  type CommissionerInviteRow,
} from "@/components/commissioner/invite-management-panel";
import { GlobalAlertStrip } from "@/components/layout/global-alert-strip";
import { MirrorOnlyBanner } from "@/components/layout/mirror-only-banner";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { NewLeagueChecklist } from "@/components/dashboard/new-league-checklist";
import { LeagueMembersWorkspace } from "@/components/teams/league-members-workspace";
import { buildTeamSlotsFromDashboard, buildLeagueMembersSummary } from "@/lib/teams/team-slot-helpers";
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
  founderSetupSuccessMessage: string | null;
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
  onFounderCreateSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onFounderClaimSubmit: () => Promise<void>;
  onFounderSkip: () => Promise<void>;
  onSetupCreateTeamSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSetupInviteSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSetupInviteResend: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupInviteRevoke: (invite: CommissionerInviteRow) => Promise<void>;
  onSetupCopyFreshInviteLink: (invite: CommissionerInviteRow) => Promise<void>;
  // New handlers for table-first interface
  onSlotInviteMember: (slotNumber: number, memberData: { ownerName: string; ownerEmail: string; teamName: string; teamAbbreviation: string; divisionLabel: string }) => Promise<void>;
  onSlotEditTeam: (teamId: string, teamData: { name: string; abbreviation: string; divisionLabel: string }) => Promise<void>;
  onChangeLeagueSize?: (newSize: number) => Promise<void>;
}

export function BootstrapDashboard(props: BootstrapDashboardProps) {
  const { dashboard, founderSetup, setupInvites } = props;

  const leagueId = dashboard.leagueDashboard.league.id;
  const seenKey = `bootstrap-checklist-seen-${leagueId}`;
  const [checklistExpanded, setChecklistExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(seenKey)) {
      setChecklistExpanded(false);
    } else {
      localStorage.setItem(seenKey, "1");
    }
  }, [seenKey]);

  const mirrorOnly = dashboard.leagueDashboard.status.mirrorOnly;
  const visibleAlerts = dashboard.alerts.filter((alert) => !(mirrorOnly && alert.id === "league-status"));

  // Build team slots and summary for the new table-first interface
  const teamSlots = buildTeamSlotsFromDashboard(dashboard, setupInvites);
  const membersSummary = buildLeagueMembersSummary(dashboard, teamSlots);

  return (
    <div className="space-y-4" data-testid="league-bootstrap-dashboard">
      <PageHeaderBand
        eyebrow="New League Setup"
        eyebrowTestId="bootstrap-dashboard-eyebrow"
        title={`Welcome to ${dashboard.leagueDashboard.league.name}`}
        titleTestId="bootstrap-dashboard-league-name"
        description="Let's get your dynasty football league operational. Complete these essential steps to prepare for your first season."
        supportingContent={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="shell-chip shell-chip--accent">
                {dashboard.setupChecklist.completedItemCount}/{dashboard.setupChecklist.totalItemCount} setup tasks complete
              </span>
              <span className="shell-chip shell-chip--neutral">
                Season {dashboard.leagueDashboard.season?.year ?? "Setup"}
              </span>
              <span className="shell-chip shell-chip--neutral">
                Commissioner Mode
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/rules"
                className="rounded-md border border-slate-600/60 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-slate-500"
              >
                Review Rules
              </Link>
              <Link
                href="/commissioner"
                className="rounded-md border border-sky-500/60 bg-sky-950/50 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:border-sky-400"
              >
                Commissioner Tools
              </Link>
            </div>
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

      {/* Canonical Setup Progress */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/20" data-testid="bootstrap-checklist-collapse">
        <button
          type="button"
          onClick={() => setChecklistExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm"
          aria-expanded={checklistExpanded}
        >
          <span className="font-medium text-slate-200">Setup Checklist</span>
          <span className="text-xs text-slate-400">{checklistExpanded ? "Collapse ›" : "Expand ›"}</span>
        </button>
        {checklistExpanded && (
          <div className="border-t border-slate-700/60 p-4">
            <NewLeagueChecklist
              checklist={dashboard.setupChecklist}
              prominence="primary"
              testId="bootstrap-progress-overview"
            />
          </div>
        )}
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

          {props.founderSetupSuccessMessage && (
            <div 
              className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100"
              data-testid="bootstrap-founder-success-message"
            >
              {props.founderSetupSuccessMessage}
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

      {/* League Members & Teams Management - Table-First Interface */}
      <LeagueMembersWorkspace
        summary={membersSummary}
        teamSlots={teamSlots}
        invites={setupInvites}
        setupInviteCopyFreshLinkEnabled={props.setupInviteCopyFreshLinkEnabled}
        setupOpsBusyAction={props.setupOpsBusyAction}
        setupOpsError={props.setupOpsError}
        setupOpsMessage={props.setupOpsMessage}
        onSlotInviteMember={props.onSlotInviteMember}
        onSlotEditTeam={props.onSlotEditTeam}
        onSetupInviteResend={props.onSetupInviteResend}
        onSetupInviteRevoke={props.onSetupInviteRevoke}
        onSetupCopyFreshInviteLink={props.onSetupCopyFreshInviteLink}
        onChangeLeagueSize={props.onChangeLeagueSize}
      />

      {dashboard.setupChecklist.isComplete && (
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