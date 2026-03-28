"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { DashboardActionCenter } from "@/components/dashboard/dashboard-action-center";
import { DashboardHealthSummaryRow } from "@/components/dashboard/dashboard-health-summary-row";
import { PhaseBadge } from "@/components/dashboard/phase-badge";
import {
  buildDashboardActionItems,
  buildDashboardChangeItems,
  buildDashboardDeadlineCards,
  buildDashboardHealthItems,
  dashboardScopeLabel,
} from "@/components/dashboard/dashboard-view-model";
import { GlobalAlertStrip } from "@/components/layout/global-alert-strip";
import { MirrorOnlyBanner } from "@/components/layout/mirror-only-banner";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { LOGIN_ERROR_SESSION_EXPIRED, buildLoginPath } from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";
import type { DraftHomeProjection } from "@/lib/read-models/draft/types";
import type { TradeHomeResponse } from "@/types/trade-workflow";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

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

export default function LeagueLandingDashboardPage() {
  const params = useParams<{ leagueId: string }>();
  const leagueId = params.leagueId;
  const [entryState, setEntryState] = useState<"access_denied" | "session_expired" | "generic" | null>(
    null,
  );
  const [dashboard, setDashboard] = useState<LeagueLandingDashboardProjection | null>(null);
  const [draftsHome, setDraftsHome] = useState<DraftHomeProjection | null>(null);
  const [tradesHome, setTradesHome] = useState<TradeHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leagueContextReady, setLeagueContextReady] = useState(false);
  const [founderSetup, setFounderSetup] = useState<FounderSetupPayload | null>(null);
  const [founderSetupLoading, setFounderSetupLoading] = useState(false);
  const [founderSetupError, setFounderSetupError] = useState<string | null>(null);
  const [founderSetupPendingAction, setFounderSetupPendingAction] = useState<FounderSetupAction | null>(
    null,
  );
  const [founderCreateTeamName, setFounderCreateTeamName] = useState("");
  const [founderCreateTeamAbbreviation, setFounderCreateTeamAbbreviation] = useState("");
  const [founderCreateTeamDivisionLabel, setFounderCreateTeamDivisionLabel] = useState("");
  const [founderClaimTeamId, setFounderClaimTeamId] = useState("");
  const dashboardViewTracked = useRef(false);
  const firstActionTracked = useRef(false);

  useEffect(() => {
    if (!leagueId) {
      return;
    }

    let mounted = true;
    setLeagueContextReady(false);
    setLoading(true);
    setError(null);
    setEntryState(null);
    setDashboard(null);
    setDraftsHome(null);
    setTradesHome(null);
    setFounderSetup(null);
    setFounderSetupLoading(false);
    setFounderSetupError(null);
    setFounderSetupPendingAction(null);
    setFounderCreateTeamName("");
    setFounderCreateTeamAbbreviation("");
    setFounderCreateTeamDivisionLabel("");
    setFounderClaimTeamId("");
    dashboardViewTracked.current = false;
    firstActionTracked.current = false;

    requestJson(
      "/api/league/context",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          leagueId,
        }),
      },
      "Failed to activate league context.",
    )
      .then(() => {
        if (!mounted) return;
        setLeagueContextReady(true);
      })
      .catch((requestError) => {
        if (!mounted) return;
        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          setEntryState("session_expired");
        } else if (
          requestError instanceof ApiRequestError &&
          requestError.code === "FORBIDDEN"
        ) {
          setEntryState("access_denied");
        } else {
          setEntryState("generic");
        }
        setError(requestError instanceof Error ? requestError.message : "Failed to activate league context.");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueContextReady) {
      return;
    }

    let mounted = true;
    setLoading(true);

    Promise.all([
      requestJson<LeagueLandingDashboardProjection>(
        "/api/league/dashboard",
        undefined,
        "Failed to load the league landing dashboard.",
      ),
      requestJson<TradeHomeResponse>("/api/trades/home").catch(() => null),
      requestJson<DraftHomeProjection>("/api/drafts/home").catch(() => null),
    ])
      .then(([dashboardPayload, tradesHomePayload, draftsHomePayload]) => {
        if (!mounted) return;
        setDashboard(dashboardPayload);
        setTradesHome(tradesHomePayload);
        setDraftsHome(draftsHomePayload);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!mounted) return;
        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          setEntryState("session_expired");
        } else {
          setEntryState("generic");
        }
        setError(
          requestError instanceof Error ? requestError.message : "Failed to load the league landing dashboard.",
        );
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [leagueContextReady]);

  useEffect(() => {
    if (!dashboard || dashboardViewTracked.current) {
      return;
    }

    dashboardViewTracked.current = true;
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_DASHBOARD_VIEWED,
      pagePath: `/league/${leagueId}`,
      eventStep: "view",
      status: "success",
      entityType: "dashboard",
      entityId: dashboard.viewer.leagueRole,
      context: {
        leagueRole: dashboard.viewer.leagueRole,
        hasTeamAccess: dashboard.viewer.hasTeamAccess,
        seasonPhase: dashboard.leagueDashboard.season?.currentPhase ?? null,
      },
    });
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_LEAGUE_HOME_VIEWED,
      pagePath: `/league/${leagueId}`,
      eventStep: "view",
      status: "success",
      entityType: "league_home",
      entityId: dashboard.leagueDashboard.league.id,
      context: {
        leagueRole: dashboard.viewer.leagueRole,
        hasTeamAccess: dashboard.viewer.hasTeamAccess,
        seasonPhase: dashboard.leagueDashboard.season?.currentPhase ?? null,
      },
    });
  }, [dashboard, leagueId]);

  useEffect(() => {
    if (!leagueContextReady || !dashboard || dashboard.viewer.leagueRole !== "COMMISSIONER") {
      setFounderSetup(null);
      setFounderSetupError(null);
      setFounderSetupLoading(false);
      return;
    }

    let mounted = true;
    setFounderSetupLoading(true);
    setFounderSetupError(null);

    requestJson<{ founderSetup: FounderSetupPayload }>(
      "/api/league/founder-team",
      { cache: "no-store" },
      "Failed to load founder team setup status.",
    )
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setFounderSetup(payload.founderSetup);
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }

        if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
          setFounderSetup(null);
          setFounderSetupError(null);
          return;
        }

        setFounderSetupError(
          requestError instanceof Error ? requestError.message : "Failed to load founder team setup status.",
        );
      })
      .finally(() => {
        if (mounted) {
          setFounderSetupLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [dashboard, leagueContextReady]);

  useEffect(() => {
    if (!founderSetup || founderSetup.claimableTeams.length === 0) {
      setFounderClaimTeamId("");
      return;
    }

    setFounderClaimTeamId((current) => {
      if (current && founderSetup.claimableTeams.some((team) => team.id === current)) {
        return current;
      }
      return founderSetup.claimableTeams[0]?.id ?? "";
    });
  }, [founderSetup]);

  async function refreshDashboardSurfaces() {
    const [dashboardPayload, tradesHomePayload, draftsHomePayload] = await Promise.all([
      requestJson<LeagueLandingDashboardProjection>(
        "/api/league/dashboard",
        undefined,
        "Failed to reload the league landing dashboard.",
      ),
      requestJson<TradeHomeResponse>("/api/trades/home").catch(() => null),
      requestJson<DraftHomeProjection>("/api/drafts/home").catch(() => null),
    ]);

    setDashboard(dashboardPayload);
    setTradesHome(tradesHomePayload);
    setDraftsHome(draftsHomePayload);
  }

  async function submitFounderSetupAction(
    action: FounderSetupAction,
    payload: Record<string, unknown> = {},
  ) {
    setFounderSetupPendingAction(action);
    setFounderSetupError(null);

    try {
      const founderResponse = await requestJson<{ founderSetup: FounderSetupPayload }>(
        "/api/league/founder-team",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action,
            ...payload,
          }),
        },
        "Founder team setup update failed.",
      );

      setFounderSetup(founderResponse.founderSetup);
      await refreshDashboardSurfaces();
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        setEntryState("session_expired");
      } else if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
        setEntryState("access_denied");
      }

      setFounderSetupError(
        requestError instanceof Error ? requestError.message : "Founder team setup update failed.",
      );
      return false;
    } finally {
      setFounderSetupPendingAction(null);
    }
  }

  async function handleFounderCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const teamName = founderCreateTeamName.trim();
    if (teamName.length < 2) {
      setFounderSetupError("Team name must be at least 2 characters.");
      return;
    }

    const teamAbbreviation = founderCreateTeamAbbreviation.trim().toUpperCase();
    if (teamAbbreviation.length > 8) {
      setFounderSetupError("Team abbreviation must be 8 characters or fewer.");
      return;
    }

    const success = await submitFounderSetupAction("create", {
      teamName,
      teamAbbreviation: teamAbbreviation || null,
      divisionLabel: founderCreateTeamDivisionLabel.trim() || null,
    });

    if (success) {
      setFounderCreateTeamName("");
      setFounderCreateTeamAbbreviation("");
      setFounderCreateTeamDivisionLabel("");
    }
  }

  async function handleFounderClaimSubmit() {
    if (!founderClaimTeamId) {
      setFounderSetupError("Select a team to claim.");
      return;
    }

    await submitFounderSetupAction("claim", {
      teamId: founderClaimTeamId,
    });
  }

  async function handleFounderSkip() {
    await submitFounderSetupAction("skip");
  }

  const mirrorOnly = dashboard?.leagueDashboard.status.mirrorOnly ?? false;
  const phaseTone =
    dashboard?.leagueDashboard.status.alertLevel === "critical"
      ? "critical"
      : dashboard?.leagueDashboard.status.alertLevel === "warning" ||
          dashboard?.leagueDashboard.status.alertLevel === "setup_required"
        ? "warning"
        : "neutral";
  const visibleAlerts =
    dashboard?.alerts.filter((alert) => !(mirrorOnly && alert.id === "league-status")) ?? [];

  function recordDashboardAction(
    actionId: string,
    source: "action-center" | "mobile-rail" | "secondary-zone",
  ) {
    const context = {
      source,
      leagueRole: dashboard?.viewer.leagueRole ?? null,
      hasTeamAccess: dashboard?.viewer.hasTeamAccess ?? null,
    };

    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_DASHBOARD_ACTION_SELECTED,
      pagePath: `/league/${leagueId}`,
      eventStep: "select",
      status: "success",
      entityType: "dashboard_action",
      entityId: actionId,
      context,
    });

    if (!firstActionTracked.current) {
      firstActionTracked.current = true;

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_DASHBOARD_FIRST_ACTION,
        pagePath: `/league/${leagueId}`,
        eventStep: "select",
        status: "success",
        entityType: "dashboard_action",
        entityId: actionId,
        context,
      });
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_LEAGUE_HOME_FIRST_ACTION,
        pagePath: `/league/${leagueId}`,
        eventStep: "select",
        status: "success",
        entityType: "dashboard_action",
        entityId: actionId,
        context,
      });
    }
  }

  return (
    <div className="space-y-6" data-testid="league-landing-dashboard">
      <PageHeaderBand
        eyebrow="Dashboard"
        eyebrowTestId="dashboard-page-eyebrow"
        title={dashboard?.leagueDashboard.league.name ?? "Loading league workspace..."}
        titleTestId="dashboard-active-league-name"
        description={
          dashboard
            ? dashboard.viewer.teamName
              ? `${dashboard.viewer.teamName} is in Season ${dashboard.leagueDashboard.season?.year ?? "?"}. Start with the highest-pressure action, then scan what changed and the next deadline.`
              : dashboard.setupChecklist.available && !dashboard.setupChecklist.isComplete
                ? `League-wide command center for Season ${dashboard.leagueDashboard.season?.year ?? "?"}. Setup progress is ${dashboard.setupChecklist.completedItemCount}/${dashboard.setupChecklist.totalItemCount}; complete the next checklist action first.`
                : `League-wide command center for Season ${dashboard.leagueDashboard.season?.year ?? "?"}. Start with urgent work before diving into neutral status.`
            : "Resolving current season, urgent work, deadlines, and recent change across the active league workspace."
        }
        supportingContent={
          <div className="flex flex-wrap items-center gap-3">
            <PhaseBadge
              label={formatLeaguePhaseLabel(dashboard?.leagueDashboard.season?.currentPhase ?? null)}
              tone={phaseTone}
              testId="league-landing-phase-badge"
            />
            <span className="shell-chip shell-chip--neutral">
              {dashboard ? dashboardScopeLabel(dashboard.viewer) : "Resolving workspace scope"}
            </span>
            <span className="shell-chip shell-chip--neutral">
              {dashboard
                ? `${dashboard.notificationSummary.unreadCount} unread update${dashboard.notificationSummary.unreadCount === 1 ? "" : "s"}`
                : "Unread updates pending"}
            </span>
            <span className={mirrorOnly ? "shell-chip shell-chip--warning" : "shell-chip shell-chip--neutral"}>
              {mirrorOnly ? "Regular-season mirror-only sync" : "Canonical offseason tools available"}
            </span>
          </div>
        }
      />

      {entryState === "access_denied" && error ? (
        <div
          className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-4 text-sm text-amber-100"
          data-testid="league-access-denied-panel"
        >
          <p className="font-medium">You do not have access to this league.</p>
          <p className="mt-2 text-amber-50/90">
            If you expected to see this workspace, ask the commissioner to confirm your membership or choose another league.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-50 transition hover:border-amber-400"
            >
              Choose Another League
            </Link>
            <Link
              href={buildLoginPath({
                returnTo: "/",
                switchSession: true,
              })}
              className="rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-50 transition hover:border-amber-400"
            >
              Use Another Account
            </Link>
          </div>
        </div>
      ) : null}

      {entryState === "session_expired" && error ? (
        <div
          className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-4 text-sm text-red-100"
          data-testid="league-session-expired-panel"
        >
          <p className="font-medium">Your session expired before this league could load.</p>
          <p className="mt-2 text-red-50/90">{error}</p>
          <div className="mt-3">
            <Link
              href={buildLoginPath({
                returnTo: `/league/${leagueId}`,
                error: LOGIN_ERROR_SESSION_EXPIRED,
              })}
              className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-medium text-red-50 transition hover:border-red-400"
            >
              Sign In Again
            </Link>
          </div>
        </div>
      ) : null}

      {entryState === "generic" && error ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          Dashboard data could not load. Existing league records are unchanged. {error}
        </div>
      ) : null}

      {mirrorOnly ? (
        <MirrorOnlyBanner
          message="Regular season mirror-only mode is active"
          detail="Roster changes are blocked until post-season. Use the dashboard for cap, contract, and compliance visibility."
        />
      ) : null}

      {loading && !dashboard ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Loading the action center, deadline stack, change feed, and dashboard posture.
          </p>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.95fr)]">
            <div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
            <div className="space-y-4">
              <div className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
              <div className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
            ))}
          </div>
        </div>
      ) : null}

      {dashboard ? (
        <div className="space-y-6">
          {dashboard.viewer.leagueRole === "COMMISSIONER" &&
          (founderSetupLoading || founderSetupError || !founderSetup || !founderSetup.isComplete) ? (
            <section
              className="space-y-4 rounded-2xl border border-amber-700/40 bg-amber-950/10 p-5"
              data-testid="founder-team-setup-panel"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/80">Founder Setup</p>
                  <h2 className="mt-1 text-base font-medium text-amber-100">
                    Complete commissioner + team-owner setup
                  </h2>
                  <p className="mt-1 text-sm text-amber-50/80">
                    You still have full commissioner authority. Choose your franchise now or postpone and return later.
                  </p>
                </div>
                <span
                  className="rounded-full border border-amber-500/50 bg-amber-950/40 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100"
                  data-testid="founder-team-setup-status"
                >
                  {founderSetupLoading
                    ? "Checking"
                    : founderSetup?.status === "INCOMPLETE_POSTPONED"
                      ? "Postponed"
                      : "Required"}
                </span>
              </div>

              {founderSetup?.status === "INCOMPLETE_POSTPONED" ? (
                <div
                  className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100"
                  data-testid="founder-team-postponed-note"
                >
                  Team setup is postponed and still incomplete.
                </div>
              ) : null}

              {founderSetupError ? (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100">
                  {founderSetupError}
                </div>
              ) : null}

              {founderSetupLoading ? (
                <p className="text-sm text-amber-100/80">Loading founder team options...</p>
              ) : founderSetup ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <form
                      className="space-y-3 rounded-xl border border-amber-800/40 bg-black/20 p-4"
                      onSubmit={handleFounderCreateSubmit}
                      data-testid="founder-team-create-form"
                    >
                      <h3 className="text-sm font-medium text-amber-100">Create Team</h3>
                      <label className="block text-xs text-amber-100/90">
                        Team name
                        <input
                          value={founderCreateTeamName}
                          onChange={(event) => setFounderCreateTeamName(event.target.value)}
                          className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                          placeholder="Empire Originals"
                          data-testid="founder-team-create-name-input"
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs text-amber-100/90">
                          Abbreviation
                          <input
                            value={founderCreateTeamAbbreviation}
                            onChange={(event) => setFounderCreateTeamAbbreviation(event.target.value)}
                            className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                            placeholder="EOR"
                            data-testid="founder-team-create-abbreviation-input"
                          />
                        </label>
                        <label className="block text-xs text-amber-100/90">
                          Division
                          <input
                            value={founderCreateTeamDivisionLabel}
                            onChange={(event) => setFounderCreateTeamDivisionLabel(event.target.value)}
                            className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                            placeholder="East"
                            data-testid="founder-team-create-division-input"
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        className="rounded-md border border-amber-500/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(founderSetupPendingAction)}
                        data-testid="founder-team-create-submit"
                      >
                        {founderSetupPendingAction === "create" ? "Creating..." : "Create Team"}
                      </button>
                    </form>

                    <div className="space-y-3 rounded-xl border border-amber-800/40 bg-black/20 p-4">
                      <h3 className="text-sm font-medium text-amber-100">Claim Existing Team</h3>
                      {founderSetup.claimableTeams.length > 0 ? (
                        <>
                          <label className="block text-xs text-amber-100/90">
                            Available teams
                            <select
                              value={founderClaimTeamId}
                              onChange={(event) => setFounderClaimTeamId(event.target.value)}
                              className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                              data-testid="founder-team-claim-select"
                            >
                              {founderSetup.claimableTeams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                  {team.abbreviation ? ` (${team.abbreviation})` : ""}
                                  {team.ownerName ? ` · Owner: ${team.ownerName}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="rounded-md border border-amber-500/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void handleFounderClaimSubmit()}
                            disabled={Boolean(founderSetupPendingAction) || !founderClaimTeamId}
                            data-testid="founder-team-claim-submit"
                          >
                            {founderSetupPendingAction === "claim" ? "Claiming..." : "Claim Team"}
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-amber-100/80">
                          No claimable team is available yet. Create one now, or return after you add more teams.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/40 bg-black/20 p-4">
                    <p className="text-xs text-amber-100/80">
                      Skip for now keeps your commissioner role active and marks this setup as incomplete.
                    </p>
                    <button
                      type="button"
                      className="rounded-md border border-amber-500/60 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleFounderSkip()}
                      disabled={Boolean(founderSetupPendingAction)}
                      data-testid="founder-team-skip"
                    >
                      {founderSetupPendingAction === "skip" ? "Saving..." : "Skip For Now"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <DashboardActionCenter
            actions={buildDashboardActionItems({ dashboard, draftsHome, tradesHome })}
            deadlines={buildDashboardDeadlineCards(dashboard)}
            changeItems={buildDashboardChangeItems(dashboard)}
            setupChecklist={dashboard.setupChecklist}
            actionQueueTestId={
              dashboard.viewer.leagueRole === "MEMBER" && dashboard.viewer.hasTeamAccess
                ? "owner-action-queue"
                : dashboard.viewer.leagueRole === "COMMISSIONER"
                  ? "commissioner-action-queue"
                  : undefined
            }
            onActionSelect={(actionId, source) => recordDashboardAction(actionId, source)}
          />

          <GlobalAlertStrip
            alerts={visibleAlerts}
            testId="league-landing-alert-strip"
            itemTestIdPrefix="league-landing-alert"
          />

          <DashboardHealthSummaryRow
            items={buildDashboardHealthItems({ dashboard, draftsHome, tradesHome })}
            testId="dashboard-health-summary-row"
          />

          <section className="space-y-4" data-testid="dashboard-secondary-zone">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-600">Keep In View</p>
              <h2 className="mt-1 text-lg font-medium text-slate-200">Additional information</h2>
            </div>

            <div 
              className="rounded-xl border border-slate-800/40 bg-slate-900/20 p-6 space-y-6" 
              data-testid="dashboard-secondary-cards"
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Picks & Draft</p>
                      <h3 className="mt-1 text-base font-medium text-slate-100">Rookie Picks Owned</h3>
                      <p className="mt-1 text-sm text-slate-400">Owned future rookie picks for the active window.</p>
                    </div>
                    <Link
                      href="/draft"
                      className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600"
                      onClick={() => recordDashboardAction("draft-home", "secondary-zone")}
                    >
                      Open Picks & Draft
                    </Link>
                  </div>
                  <div className="mt-4">
                    {dashboard.rookiePicksOwned && dashboard.rookiePicksOwned.seasons.length > 0 ? (
                      <div className="space-y-3">
                        {dashboard.rookiePicksOwned.seasons.map((seasonBucket) => (
                          <div key={seasonBucket.seasonYear} className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-100">{seasonBucket.seasonYear}</p>
                              <span className="text-xs text-slate-400">{seasonBucket.totalCount} pick(s)</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {seasonBucket.rounds.map((roundBucket) => (
                                <div
                                  key={`${seasonBucket.seasonYear}-${roundBucket.round}`}
                                  className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2"
                                >
                                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Round {roundBucket.round}</p>
                                  <p className="mt-1 text-sm text-slate-200">
                                    {roundBucket.picks
                                      .map((pick) => pick.originalTeam.abbreviation ?? pick.originalTeam.name)
                                      .join(", ")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : dashboard.rookiePicksOwned ? (
                      <p className="text-sm text-slate-400">
                        No unused rookie picks are owned in the current dashboard window.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Rookie pick ownership appears once the viewer resolves to an active franchise.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">League Activity</p>
                      <h3 className="mt-1 text-base font-medium text-slate-100">League Activity / Commissioner Notes</h3>
                      <p className="mt-1 text-sm text-slate-400">Recent transactions plus the latest commissioner note for your current scope.</p>
                    </div>
                    <Link
                      href="/activity"
                      className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600"
                      onClick={() => recordDashboardAction("league-activity", "secondary-zone")}
                    >
                      Open League Activity
                    </Link>
                  </div>
                  <div className="mt-4">
                    <div className="space-y-4">
                      {dashboard.activitySummary.commissionerNote ? (
                        <div className="rounded-lg border border-sky-800/30 bg-sky-950/10 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-sky-400">Commissioner Note</p>
                          <p className="mt-2 text-sm text-slate-100">{dashboard.activitySummary.commissionerNote.reason}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatDateTime(dashboard.activitySummary.commissionerNote.createdAt)}
                            {dashboard.activitySummary.commissionerNote.actorName
                              ? ` · ${dashboard.activitySummary.commissionerNote.actorName}`
                              : ""}
                          </p>
                        </div>
                      ) : null}

                      {dashboard.activitySummary.recentActivity.length > 0 ? (
                        <div className="space-y-2">
                          {dashboard.activitySummary.recentActivity.map((activity) => (
                            <div key={activity.id} className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-3">
                              <p className="text-sm font-medium text-slate-100">{activity.summary}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDateTime(activity.createdAt)}
                                {activity.team ? ` · ${activity.team.name}` : ""}
                                {activity.player ? ` · ${activity.player.name}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">
                          {dashboard.activitySummary.emptyStateReason ?? "No recent activity is available."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
