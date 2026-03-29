"use client";

import Link from "next/link";
import type { ChangeEvent } from "react";
import { BrandBadge } from "../brand";

type LeagueRole = "COMMISSIONER" | "MEMBER";

export type TopBarLeagueWorkspace = {
  id: string;
  name: string;
  leagueRole: LeagueRole;
  teamName: string | null;
};

function formatLeagueRole(role: LeagueRole) {
  if (role === "COMMISSIONER") {
    return "Commissioner";
  }
  return "Member";
}

function formatLeagueWorkspaceLabel(workspace: TopBarLeagueWorkspace) {
  const roleLabel = formatLeagueRole(workspace.leagueRole);
  if (workspace.teamName) {
    return `${workspace.name} (${roleLabel} · ${workspace.teamName})`;
  }
  return `${workspace.name} (${roleLabel})`;
}

export function TopBar(props: {
  consoleTitle: string;
  activeLeagueName: string | null;
  subtitle: string;
  actorName: string | null;
  actorEmail: string | null;
  roleLabel: string | null;
  seasonPhaseLabel: string | null;
  notificationUnreadCount: number | null;
  availableLeagues: TopBarLeagueWorkspace[];
  selectedLeagueId: string;
  currentLeagueId: string | null;
  switchingLeague: boolean;
  signingOut: boolean;
  demoSwitchAccountHref?: string | null;
  onSelectedLeagueIdChange: (leagueId: string) => void;
  onSwitchLeague: () => void;
  onSignOut: () => void;
}) {
  const switchDisabled =
    props.switchingLeague ||
    !props.selectedLeagueId ||
    props.selectedLeagueId === props.currentLeagueId;
  const hasActiveLeague = Boolean(props.currentLeagueId);
  const multipleLeagues = props.availableLeagues.length > 1;
  const currentLeagueLabel = props.activeLeagueName ?? "No league selected";
  const currentLeagueWorkspace = props.currentLeagueId
    ? props.availableLeagues.find((league) => league.id === props.currentLeagueId) ?? null
    : null;

  return (
    <header
      className="shell-panel shell-top-bar px-5 py-5 md:px-6"
      style={{
        backgroundColor: "var(--brand-surface-elevated)",
        borderColor: "var(--brand-structure-muted)",
      }}
      data-testid="shell-top-bar"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BrandBadge variant="default" size="sm" />
            <p className="shell-kicker">Dynasty League App</p>
          </div>
          <div className="mt-3">
            <h1
              className="text-2xl font-semibold md:text-3xl"
              style={{ color: "var(--foreground)" }}
            >
              {props.consoleTitle}
            </h1>
            <p
              className="mt-2 text-sm font-medium"
              style={{ color: "var(--muted-foreground)" }}
              data-testid="role-context-league-name"
            >
              {currentLeagueLabel}
            </p>
            <p
              className="mt-1 text-sm"
              style={{ color: "rgba(148, 163, 184, 0.8)" }}
              data-testid="role-context-team"
            >
              {props.subtitle}
            </p>
          </div>

          {hasActiveLeague ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {props.roleLabel ? (
                <span className="shell-chip shell-chip--accent" data-testid="role-context-role">
                  {props.roleLabel}
                </span>
              ) : null}
              {props.seasonPhaseLabel ? (
                <span className="shell-chip shell-chip--neutral" data-testid="role-context-phase">
                  Current phase: {props.seasonPhaseLabel}
                </span>
              ) : null}
              {props.notificationUnreadCount !== null ? (
                <div
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                  style={{
                    border: "1px solid var(--brand-structure-muted)",
                    backgroundColor: "var(--brand-surface-card)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <span>Unread alerts</span>
                  <span
                    className={
                      props.notificationUnreadCount > 0
                        ? "shell-chip shell-chip--warning !px-2 !py-0.5"
                        : "shell-chip shell-chip--neutral !px-2 !py-0.5"
                    }
                    data-testid="header-notification-unread"
                  >
                    {props.notificationUnreadCount}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 xl:w-80">
          <div
            className="rounded-[calc(var(--radius-shell-card)+2px)] p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
            style={{
              border: "1px solid var(--brand-structure-muted)",
              backgroundColor: "var(--brand-surface-card)",
            }}
            data-testid="account-summary-panel"
          >
            <div className="space-y-4">
              <div className="min-w-0">
                <p className="shell-kicker">Signed in as</p>
                <p
                  className="mt-1 truncate text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                  data-testid="account-email"
                >
                  {props.actorEmail ?? "Loading session..."}
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {props.actorName && props.actorName !== props.actorEmail
                    ? props.actorName
                    : hasActiveLeague && currentLeagueWorkspace
                      ? `${formatLeagueRole(currentLeagueWorkspace.leagueRole)} access in ${currentLeagueLabel}`
                      : "Authentication is separate from league selection."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={props.onSignOut}
                  disabled={props.signingOut}
                  className="rounded-xl px-3 py-1.5 text-xs transition hover:bg-opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    border: "1px solid var(--brand-structure-muted)",
                    color: "var(--foreground)",
                    backgroundColor: "var(--brand-surface-muted)",
                  }}
                  data-testid="account-sign-out"
                >
                  {props.signingOut ? "Signing Out..." : "Sign Out"}
                </button>
                {props.demoSwitchAccountHref ? (
                  <Link
                    href={props.demoSwitchAccountHref}
                    className="rounded-xl px-3 py-1.5 text-xs transition hover:bg-opacity-80"
                    style={{
                      border: "1px solid var(--brand-structure-muted)",
                      color: "var(--foreground)",
                      backgroundColor: "var(--brand-surface-muted)",
                    }}
                    data-testid="open-login-link"
                  >
                    Demo Switch Account
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="rounded-[calc(var(--radius-shell-card)+2px)] p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
            style={{
              border: "1px solid var(--brand-structure-muted)",
              backgroundColor: "var(--brand-surface-card)",
            }}
            data-testid="league-summary-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="shell-kicker">Current League</p>
                <p
                  className="mt-1 truncate text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                  data-testid="account-current-league"
                >
                  {currentLeagueLabel}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {hasActiveLeague
                    ? multipleLeagues
                      ? "Switch leagues here or open the full picker."
                      : "This account has one accessible league."
                    : props.availableLeagues.length > 0
                      ? "Choose a league to continue."
                      : "You do not have access to a league yet."}
                </p>
              </div>
              <Link
                href="/dashboard"
                className="rounded-xl px-3 py-1.5 text-xs transition hover:bg-opacity-80"
                style={{
                  border: "1px solid var(--brand-structure-muted)",
                  color: "var(--foreground)",
                  backgroundColor: "var(--brand-surface-muted)",
                }}
                data-testid="header-league-picker-link"
              >
                {multipleLeagues ? "All Leagues" : hasActiveLeague ? "League Home" : "Choose League"}
              </Link>
            </div>

            <label
              className="shell-field mt-3 block text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <span className="mb-1.5 block">League Workspace</span>
              <select
                value={props.selectedLeagueId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  props.onSelectedLeagueIdChange(event.target.value)
                }
                disabled={props.availableLeagues.length === 0}
                data-testid="header-league-switcher-select"
              >
                {props.availableLeagues.length > 0 ? (
                  props.availableLeagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {formatLeagueWorkspaceLabel(league)}
                    </option>
                  ))
                ) : (
                  <option value="">No leagues available</option>
                )}
              </select>
            </label>

            <button
              type="button"
              onClick={props.onSwitchLeague}
              disabled={switchDisabled}
              className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                border: "1px solid var(--brand-structure-muted)",
                backgroundColor: "var(--brand-surface-muted)",
                color: "var(--foreground)",
              }}
              data-testid="header-league-switcher-apply"
            >
              {props.switchingLeague
                ? "Opening..."
                : hasActiveLeague
                  ? "Switch League"
                  : "Open League"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
