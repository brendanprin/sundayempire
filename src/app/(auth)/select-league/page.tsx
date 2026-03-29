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

type UserProfileSummary = {
  id: string;
  email: string;
  name: string | null;
  accountRole: string;
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

export default function MyLeaguesDirectoryPage() {
  const router = useRouter();
  
  const [leagues, setLeagues] = useState<LeagueWorkspace[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfileSummary | null>(null);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [activatingLeagueId, setActivatingLeagueId] = useState<string | null>(null);
  const [creatingLeague, setCreatingLeague] = useState(false);
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

        // Store user profile for directory display
        setUserProfile({
          id: response.user.id,
          email: response.user.email,
          name: response.user.name,
          accountRole: "USER", // Could be enhanced with actual account role
        });

        // No league access - stay on page to show empty state
        if (response.resolution.kind === "no_league_access") {
          setResolverChecked(true);
          await loadLeagues();
          return;
        }

        // Multiple leagues - stay on page to show directory
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

  async function createNewLeague() {
    setCreatingLeague(true);
    setError(null);
    
    try {
      // Route to dashboard for league creation wizard
      router.push("/my-leagues");
    } catch (requestError) {
      setError("Failed to navigate to league creation.");
      setCreatingLeague(false);
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
        <div className="mx-auto max-w-5xl px-6 py-12">
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
                Loading Your Leagues
              </h1>
              <p
                className="text-lg"
                style={{ color: "var(--muted-foreground)" }}
              >
                Checking your league memberships and access...
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
                Determining your league access and context...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const heading =
    orderedLeagues.length === 0
      ? "My Leagues"
      : "My Leagues";
  
  const description =
    orderedLeagues.length === 0
      ? "You're signed in but don't have access to any leagues yet. Create a new league or contact a commissioner to get started."
      : `Manage your ${orderedLeagues.length} league${orderedLeagues.length === 1 ? "" : "s"} and open the workspace you want to use.`;

  return (
    <div className="min-h-screen bg-[var(--brand-midnight-navy)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="space-y-8" data-testid="league-directory-page">
          <header className="space-y-4">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              SundayEmpire
            </p>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1
                  className="text-3xl font-bold"
                  style={{ color: "var(--foreground)" }}
                >
                  {heading}
                </h1>
                <p
                  className="mt-2 text-lg"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {description}
                </p>
              </div>
              {orderedLeagues.length > 0 && (
                <button
                  type="button"
                  onClick={createNewLeague}
                  disabled={creatingLeague}
                  className="ml-6 rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50"
                  data-testid="create-league-button"
                >
                  {creatingLeague ? "Creating..." : "Create League"}
                </button>
              )}
            </div>
            
            {/* Signed-in Identity Summary */}
            {userProfile && (
              <div
                className="rounded-lg p-4 text-sm"
                style={{
                  border: "1px solid var(--brand-structure-muted)",
                  backgroundColor: "var(--brand-surface-elevated)",
                }}
                data-testid="user-identity-summary"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      Signed in as {userProfile.name || userProfile.email}
                    </p>
                    <p
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {userProfile.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.location.assign("/api/auth/session?action=sign-out")}
                    className="text-xs text-sky-400 hover:text-sky-300 transition"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </header>

          {error ? (
            <div
              className="rounded-lg p-4"
              style={{
                border: "1px solid var(--destructive)",
                backgroundColor: "var(--destructive-background)",
                color: "var(--destructive-foreground)",
              }}
              data-testid="league-directory-error"
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
              data-testid="league-directory-empty-state"
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
                    onClick={createNewLeague}
                    disabled={creatingLeague}
                    className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50"
                  >
                    {creatingLeague ? "Creating..." : "Create League"}
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
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="league-directory-grid">
              {orderedLeagues.map((league) => {
                const urgency = urgencyForPhase(league.season?.phase);
                return (
                  <div
                    key={league.id}
                    className="rounded-lg p-6 transition"
                    style={{
                      border: "1px solid var(--brand-structure-muted)",
                      backgroundColor: "var(--brand-surface-elevated)",
                    }}
                    data-testid="league-card"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3
                            className="text-lg font-semibold truncate"
                            style={{ color: "var(--foreground)" }}
                          >
                            {league.name}
                          </h3>
                          <p
                            className="mt-1 text-sm"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {formatMembershipContext(league)}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs ${urgency.className}`}>
                          {urgency.label}
                        </span>
                      </div>

                      {league.description && (
                        <p
                          className="text-sm"
                          style={{ color: "var(--foreground)" }}
                        >
                          {league.description}
                        </p>
                      )}

                      <div
                        className="flex flex-wrap gap-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        <span>Season {league.season?.year ?? "-"}</span>
                        <span>Phase: {formatLeaguePhaseLabel(league.season?.phase)}</span>
                        <span>{league.counts.teams} teams</span>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => selectLeague(league)}
                          disabled={activatingLeagueId === league.id}
                          className={`w-full rounded-md px-4 py-2 text-sm font-medium transition ${
                            activatingLeagueId === league.id
                              ? "opacity-75 cursor-not-allowed bg-gray-600 text-gray-300"
                              : "bg-[var(--brand-accent-primary)] text-[var(--brand-midnight-navy)] hover:bg-[var(--brand-accent-hover)]"
                          }`}
                          data-testid="open-league-button"
                        >
                          {activatingLeagueId === league.id ? (
                            <span className="flex items-center justify-center gap-2">
                              <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"></div>
                              Opening...
                            </span>
                          ) : (
                            "Open League"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
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