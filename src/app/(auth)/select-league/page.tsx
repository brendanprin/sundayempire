"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import {
  LOGIN_ERROR_SESSION_EXPIRED,
  buildLoginPath,
} from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import { LeagueSummaryPayload } from "@/types/league";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type AuthenticatedEntryResolution = {
  kind: "no_league_access" | "single_league_entry" | "multiple_league_choice";
  route: string;
  context: any;
};

type EntryResolverResponse = {
  resolution: AuthenticatedEntryResolution;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

type LeagueWorkspace = {
  id: string;
  name: string;
  description: string | null;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  season: {
    id: string;
    year: number;
    phase: LeagueSummaryPayload["season"]["phase"];
  } | null;
  counts: {
    teams: number;
    memberships: number;
  };
  createdAt: string;
};

type LeagueWorkspacesPayload = {
  leagues: LeagueWorkspace[];
};

function formatMembershipContext(league: LeagueWorkspace) {
  if (league.leagueRole === "COMMISSIONER") {
    return league.teamName
      ? `Commissioner · Team: ${league.teamName}`
      : "Commissioner";
  }

  return league.teamName
    ? `Member · Team: ${league.teamName}`
    : "Member";
}

function urgencyForPhase(phase: LeagueSummaryPayload["season"]["phase"] | null | undefined) {
  if (!phase) {
    return {
      label: "Not configured",
      className: "border-slate-700 bg-slate-900 text-slate-200",
    };
  }
  if (phase === "REGULAR_SEASON") {
    return {
      label: "Regular Season",
      className: "border-emerald-700/60 bg-emerald-950/30 text-emerald-100",
    };
  }
  if (phase === "PLAYOFFS") {
    return {
      label: "Playoffs",
      className: "border-amber-700/60 bg-amber-950/30 text-amber-100",
    };
  }
  if (phase === "PRESEASON") {
    return {
      label: "Preseason",
      className: "border-sky-700/60 bg-sky-950/30 text-sky-100",
    };
  }
  return {
    label: "Offseason",
    className: "border-slate-700 bg-slate-900 text-slate-200",
  };
}

export default function LeagueSelectionPage() {
  const router = useRouter();
  
  const [leagues, setLeagues] = useState<LeagueWorkspace[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [activatingLeagueId, setActivatingLeagueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolverChecked, setResolverChecked] = useState(false);
  
  const directoryOpenedAt = useRef(Date.now());
  const directoryViewTracked = useRef(false);
  const autoEntryAttempted = useRef(false);

  // Check entry resolver first to handle auto-entry for single league users
  useEffect(() => {
    if (autoEntryAttempted.current) {
      return;
    }
    
    autoEntryAttempted.current = true;

    async function checkEntryResolver() {
      try {
        const response = await requestJson<EntryResolverResponse>(
          "/api/auth/entry-resolver",
          { method: "GET" },
          "Failed to resolve authenticated entry."
        );

        // Single league users get auto-entered
        if (response.resolution.kind === "single_league_entry") {
          trackUiEvent({
            eventType: PILOT_EVENT_TYPES.UI_LEAGUE_SELECTED,
            pagePath: "/select-league",
            eventStep: "auto_enter_single",
            status: "success",
            entityType: "league",
            entityId: "auto",
            context: {
              resolutionKind: response.resolution.kind,
              autoEntry: true,
            },
          });
          
          router.push(response.resolution.route);
          return;
        }

        // No league access - stay on page to show empty state
        if (response.resolution.kind === "no_league_access") {
          setResolverChecked(true);
          await loadLeagues();
          return;
        }

        // Multiple leagues - stay on page to show selection
        if (response.resolution.kind === "multiple_league_choice") {
          setResolverChecked(true);
          await loadLeagues();
          return;
        }
      } catch (requestError) {
        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          window.location.assign(
            buildLoginPath({
              returnTo: "/select-league",
              error: LOGIN_ERROR_SESSION_EXPIRED,
            }),
          );
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to check authentication context."
        );
        setResolverChecked(true);
        await loadLeagues();
      }
    }

    void checkEntryResolver();
  }, [router]);

  async function loadLeagues() {
    try {
      setLeaguesLoading(true);
      const response = await requestJson<LeagueWorkspacesPayload>(
        "/api/leagues",
        { method: "GET" },
        "Failed to load leagues."
      );
      setLeagues(response.leagues);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        window.location.assign(
          buildLoginPath({
            returnTo: "/select-league",
            error: LOGIN_ERROR_SESSION_EXPIRED,
          }),
        );
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load league memberships."
      );
    } finally {
      setLeaguesLoading(false);
    }
  }

  const orderedLeagues = useMemo(() => {
    return [...leagues].sort((left, right) => {
      // Commissioner leagues first
      if (left.leagueRole === "COMMISSIONER" && right.leagueRole !== "COMMISSIONER") {
        return -1;
      }
      if (right.leagueRole === "COMMISSIONER" && left.leagueRole !== "COMMISSIONER") {
        return 1;
      }
      return left.name.localeCompare(right.name);
    });
  }, [leagues]);

  // Track league directory view
  useEffect(() => {
    if (orderedLeagues.length === 0 || directoryViewTracked.current) {
      return;
    }

    directoryViewTracked.current = true;
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_LEAGUE_DIRECTORY_VIEWED,
      pagePath: "/select-league",
      eventStep: "view",
      status: "success",
      entityType: "league_directory",
      entityId: "root",
      context: {
        leagueCount: orderedLeagues.length,
      },
    });
  }, [orderedLeagues.length]);

  async function selectLeague(league: LeagueWorkspace) {
    setActivatingLeagueId(league.id);
    setError(null);

    try {
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_LEAGUE_SELECTED,
        pagePath: "/select-league",
        eventStep: "select",
        status: "success",
        entityType: "league",
        entityId: league.id,
        context: {
          leagueRole: league.leagueRole,
          hasTeamContext: Boolean(league.teamId),
          elapsedMs: Date.now() - directoryOpenedAt.current,
        },
      });

      // Use the centralized resolver to get the optimal route for this league
      const response = await requestJson<EntryResolverResponse>(
        "/api/auth/entry-resolver", 
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            leagueId: league.id,
          }),
        },
        "Failed to resolve league context."
      );

      // Navigate to the resolved optimal route
      router.push(response.resolution.route);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        window.location.assign(
          buildLoginPath({
            returnTo: "/select-league",
            error: LOGIN_ERROR_SESSION_EXPIRED,
          }),
        );
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to activate selected league.",
      );
      setActivatingLeagueId((current) => (current === league.id ? null : current));
    }
  }

  // Show loading until resolver check is complete
  if (!resolverChecked) {
    return (
      <div className="min-h-screen bg-[var(--brand-midnight-navy)] text-[var(--foreground)]">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="space-y-6">
            <header className="space-y-3">
              <p
                className="text-xs uppercase tracking-[0.2em]"
                style={{ color: "var(--muted-foreground)" }}
              >
                SundayEmpire
              </p>
              <h1
                className="text-3xl font-bold"
                style={{ color: "var(--foreground)" }}
              >
                Loading League Access
              </h1>
              <p
                className="text-lg"
                style={{ color: "var(--muted-foreground)" }}
              >
                Checking your league memberships and context...
              </p>
            </header>

            <div
              className="rounded-lg p-8 text-center"
              style={{
                border: "1px solid var(--brand-structure-muted)",
                backgroundColor: "var(--brand-surface-card)",
              }}
            >
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
              <p className="mt-4 text-sm text-sky-200">
                Determining your role, team assignment, and current phase...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const heading =
    orderedLeagues.length === 0
      ? "No League Access"
      : "Select a League";
  
  const description =
    orderedLeagues.length === 0
      ? "Your account is authenticated but not attached to any leagues yet. Contact a commissioner or create a new league to get started."
      : "Choose a league workspace to continue into the app.";

  return (
    <div className="min-h-screen bg-[var(--brand-midnight-navy)] text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-8" data-testid="league-selection-page">
          <header className="space-y-3">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              SundayEmpire
            </p>
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {heading}
            </h1>
            <p
              className="text-lg"
              style={{ color: "var(--muted-foreground)" }}
            >
              {description}
            </p>
          </header>

          {error ? (
            <div
              className="rounded-lg p-4"
              style={{
                border: "1px solid var(--destructive)",
                backgroundColor: "var(--destructive-background)",
                color: "var(--destructive-foreground)",
              }}
              data-testid="league-selection-error"
            >
              <p className="font-medium">League Loading Error</p>
              <p className="mt-1 text-sm">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  void loadLeagues();
                }}
                className="mt-2 text-sm underline hover:no-underline"
              >
                Try Again
              </button>
            </div>
          ) : null}

          {orderedLeagues.length === 0 ? (
            <div
              className="rounded-lg p-8 text-center"
              style={{
                border: "1px solid var(--brand-structure-muted)",
                backgroundColor: "var(--brand-surface-card)",
              }}
              data-testid="league-selection-empty-state"
            >
              <div className="space-y-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center">
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  No Leagues Found
                </h3>
                <p
                  className="text-sm max-w-md mx-auto"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  You'll need to join an existing league or create a new one to access the app.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                  >
                    Create League
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--brand-surface-elevated)]"
                    style={{ color: "var(--foreground)" }}
                  >
                    Return Home
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="league-selection-grid">
              {orderedLeagues.map((league) => {
                const urgency = urgencyForPhase(league.season?.phase);
                return (
                  <button
                    key={league.id}
                    type="button"
                    onClick={() => selectLeague(league)}
                    disabled={activatingLeagueId === league.id}
                    className={`rounded-lg p-6 text-left transition ${
                      activatingLeagueId === league.id 
                        ? "opacity-75 cursor-not-allowed" 
                        : "hover:border-sky-500"
                    }`}
                    style={{
                      border: "1px solid var(--brand-structure-muted)",
                      backgroundColor: "var(--brand-surface-elevated)",
                    }}
                    onMouseEnter={(event) => {
                      if (activatingLeagueId !== league.id) {
                        event.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.7)";
                        event.currentTarget.style.backgroundColor = "var(--brand-surface-card)";
                      }
                    }}
                    onMouseLeave={(event) => {
                      if (activatingLeagueId !== league.id) {
                        event.currentTarget.style.borderColor = "var(--brand-structure-muted)";
                        event.currentTarget.style.backgroundColor = "var(--brand-surface-elevated)";
                      }
                    }}
                    data-testid="league-selection-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3
                        className="text-lg font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {league.name}
                      </h3>
                      <span className={`rounded-full border px-3 py-1 text-xs ${urgency.className}`}>
                        {urgency.label}
                      </span>
                    </div>
                    <p
                      className="mt-2 text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {formatMembershipContext(league)}
                    </p>
                    {league.description ? (
                      <p
                        className="mt-2 text-sm"
                        style={{ color: "var(--foreground)" }}
                      >
                        {league.description}
                      </p>
                    ) : null}
                    <div
                      className="mt-4 flex flex-wrap gap-3 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      <span>Season {league.season?.year ?? "-"}</span>
                      <span>Phase: {formatLeaguePhaseLabel(league.season?.phase)}</span>
                      <span>{league.counts.teams} teams</span>
                    </div>
                    {activatingLeagueId === league.id ? (
                      <p className="mt-3 text-xs text-sky-200 flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border border-sky-500 border-t-transparent"></div>
                        Opening league workspace...
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-sky-400">
                        Click to open league →
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {leaguesLoading && orderedLeagues.length === 0 && resolverChecked ? (
            <div className="text-center py-8">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
              <p className="mt-2 text-sm text-sky-200">Loading your leagues...</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}