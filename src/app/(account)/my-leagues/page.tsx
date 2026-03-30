"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function parseInviteToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmed);
    const token = parsedUrl.searchParams.get("token")?.trim() ?? "";
    if (token.length > 0) {
      return token;
    }
  } catch {
    // Treat non-URL input as a direct token value.
  }

  return trimmed;
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

export default function MyLeaguesPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueWorkspace[]>([]);
  const [userProfile, setUserProfile] = useState<{ name: string | null; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolverChecked, setResolverChecked] = useState(false);
  const [shouldShowDirectory, setShouldShowDirectory] = useState(false);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [activatingLeagueId, setActivatingLeagueId] = useState<string | null>(null);
  const [joinInviteValue, setJoinInviteValue] = useState("");
  const directoryOpenedAt = useRef(0);
  const directoryViewTracked = useRef(false);
  const noLeagueWizardAutoOpened = useRef(false);

  useEffect(() => {
    directoryOpenedAt.current = Date.now();
  }, []);

  // First, check the centralized resolver to see if we should show directory
  useEffect(() => {
    if (resolverChecked) return;

    let mounted = true;

    requestJson<EntryResolverResponse>(
      "/api/auth/entry-resolver",
      { cache: "no-store" },
      "Failed to resolve user context."
    )
      .then((payload) => {
        if (!mounted) return;

        const { resolution, user } = payload;
        setUserProfile(user);

        if (resolution.kind === "single_league_entry") {
          // User should be routed directly - redirect them now
          router.push(resolution.route);
          return;
        }

        if (resolution.kind === "no_league_access") {
          // No leagues - show the directory for league creation
          setShouldShowDirectory(true);
          setResolverChecked(true);
          return;
        }

        if (resolution.kind === "multiple_league_choice") {
          // Multiple leagues - show directory for selection
          setShouldShowDirectory(true);
          setResolverChecked(true);
          return;
        }
      })
      .catch((requestError) => {
        if (!mounted) return;

        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          window.location.assign(
            buildLoginPath({
              returnTo: "/my-leagues",
              error: LOGIN_ERROR_SESSION_EXPIRED,
            }),
          );
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Failed to resolve user context.");
        setResolverChecked(true);
      });

    return () => {
      mounted = false;
    };
  }, [router, resolverChecked]);

  // Only load leagues if we determined we should show the directory
  useEffect(() => {
    if (!shouldShowDirectory) return;

    let mounted = true;
    setLeaguesLoading(true);

    requestJson<LeagueWorkspacesPayload>("/api/leagues", { cache: "no-store" }, "Failed to load leagues.")
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setLeagues(payload.leagues);
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }

        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          window.location.assign(
            buildLoginPath({
              returnTo: "/my-leagues",
              error: LOGIN_ERROR_SESSION_EXPIRED,
            }),
          );
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Failed to load leagues.");
      })
      .finally(() => {
        if (mounted) {
          setLeaguesLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [shouldShowDirectory]);

  const orderedLeagues = useMemo(() => {
    return [...leagues].sort((left, right) => {
      const leftSeason = left.season?.year ?? 0;
      const rightSeason = right.season?.year ?? 0;
      if (leftSeason !== rightSeason) {
        return rightSeason - leftSeason;
      }
      return left.name.localeCompare(right.name);
    });
  }, [leagues]);

  useEffect(() => {
    if (leaguesLoading || orderedLeagues.length !== 0 || noLeagueWizardAutoOpened.current) {
      return;
    }

    noLeagueWizardAutoOpened.current = true;
    router.push("/my-leagues/new");
  }, [leaguesLoading, orderedLeagues.length]);

  useEffect(() => {
    if (orderedLeagues.length === 0 || directoryViewTracked.current) {
      return;
    }

    directoryViewTracked.current = true;
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_LEAGUE_DIRECTORY_VIEWED,
      pagePath: "/my-leagues",
      eventStep: "view",
      status: "success",
      entityType: "league_directory",
      entityId: "root",
      context: {
        leagueCount: orderedLeagues.length,
      },
    });
  }, [orderedLeagues.length]);

  async function activateLeague(league: LeagueWorkspace, source: "directory" | "auto_single") {
    setActivatingLeagueId(league.id);
    setError(null);

    try {
      if (source === "directory") {
        trackUiEvent({
          eventType: PILOT_EVENT_TYPES.UI_LEAGUE_SELECTED,
          pagePath: "/my-leagues",
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
      }

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
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        window.location.assign(
          buildLoginPath({
            returnTo: "/my-leagues",
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

  function createNewLeague() {
    router.push("/my-leagues/new");
  }



  function handleJoinLeague() {
    const token = parseInviteToken(joinInviteValue);
    if (!token) {
      setError("Enter a valid invite link or token.");
      return;
    }

    setError(null);
    router.push(`/invite?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent("/my-leagues")}`);
  }

  const heading =
    orderedLeagues.length === 0
      ? "Dynasty Football Hub"
      : "Dynasty Football Hub";
  
  const description =
    orderedLeagues.length === 0
      ? "Welcome to your dynasty football account. Create a new league or join an existing one to get started."
      : `Welcome back! Choose from your ${orderedLeagues.length} league${orderedLeagues.length === 1 ? "" : "s"} below to continue playing dynasty football.`;

  // Show loading until resolver check is complete
  if (!resolverChecked) {
    return (
      <div className="min-h-screen bg-[var(--brand-midnight-navy)] text-[var(--foreground)]">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="space-y-8" data-testid="my-leagues-page">
            <header className="space-y-4">
              <p
                className="text-xs uppercase tracking-[0.2em]"
                style={{ color: "var(--muted-foreground)" }}
              >
                SundayEmpire
              </p>
              <h1 className="text-3xl font-bold" style={{ color: "var(--foreground)" }}>
                Account Overview
              </h1>
              <p className="mt-2 text-lg" style={{ color: "var(--muted-foreground)" }}>
                Loading your dynasty football account and leagues...
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
                Resolving your account access and league memberships...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Only show the league directory if resolver determined we should
  if (!shouldShowDirectory) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--brand-midnight-navy)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="space-y-8" data-testid="my-leagues-page">
          <header className="space-y-4">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              SundayEmpire
            </p>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold" style={{ color: "var(--foreground)" }}>
                  {heading}
                </h1>
                <p className="mt-2 text-lg" style={{ color: "var(--muted-foreground)" }}>
                  {description}
                </p>
              </div>
              {orderedLeagues.length > 0 && (
                <button
                  type="button"
                  onClick={createNewLeague}
                  className="ml-6 rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                  data-testid="create-league-button"
                >
                  Create New League
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
                    <p className="font-medium" style={{ color: "var(--foreground)" }}>
                      Signed in as {userProfile.name || userProfile.email}
                    </p>
                    <p style={{ color: "var(--muted-foreground)" }}>
                      {userProfile.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/"
                      className="text-xs text-sky-400 hover:text-sky-300 transition"
                    >
                      Return Home
                    </Link>
                    <button
                      type="button"
                      onClick={() => window.location.assign("/api/auth/session?action=sign-out")}
                      className="text-xs text-sky-400 hover:text-sky-300 transition"
                    >
                      Sign out
                    </button>
                  </div>
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
              data-testid="my-leagues-error"
            >
              <p className="font-medium">League Loading Error</p>
              <p className="mt-1 text-sm">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  window.location.reload();
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
              data-testid="my-leagues-empty-state"
            >
              <div className="space-y-6">
                <div className="mx-auto h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center">
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Ready to Start Playing?
                  </h3>
                  <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: "var(--muted-foreground)" }}>
                    Start your dynasty football journey by creating a new league or joining an existing one with friends.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      type="button"
                      onClick={createNewLeague}
                      className="rounded-md bg-[var(--brand-accent-primary)] px-6 py-3 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                    >
                      Create New League
                    </button>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={joinInviteValue}
                        onChange={(event) => setJoinInviteValue(event.target.value)}
                        className="rounded-md border bg-transparent px-3 py-2 text-sm"
                        style={{
                          borderColor: "var(--brand-structure-muted)",
                          color: "var(--foreground)",
                        }}
                        placeholder="Paste invite link"
                      />
                      <button
                        type="button"
                        onClick={handleJoinLeague}
                        className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--brand-surface-elevated)]"
                        style={{ color: "var(--foreground)" }}
                      >
                        Join League
                      </button>
                    </div>
                  </div>


                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="my-leagues-grid">
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
                          <h3 className="text-lg font-semibold truncate" style={{ color: "var(--foreground)" }}>
                            {league.name}
                          </h3>
                          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                            {formatMembershipContext(league)}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs ${urgency.className}`}>
                          {urgency.label}
                        </span>
                      </div>

                      {league.description && (
                        <p className="text-sm" style={{ color: "var(--foreground)" }}>
                          {league.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <span>Season {league.season?.year ?? "-"}</span>
                        <span>Phase: {formatLeaguePhaseLabel(league.season?.phase)}</span>
                        <span>{league.counts.teams} teams</span>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => activateLeague(league, "directory")}
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
                            "Enter League"
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