"use client";

// Top scenario shortcuts for quick launch.
// No route overrides — each persona uses the entry-resolver destination so the
// quick-launch buttons exercise the same routing logic as production sign-in.
const QUICK_LAUNCH_SCENARIOS: Array<{
  label: string;
  role: "COMMISSIONER" | "MEMBER_WITH_TEAM" | "MEMBER_NO_TEAM";
}> = [
  {
    label: "Commissioner: League Shell",
    role: "COMMISSIONER",
  },
  {
    label: "Member: Team Dashboard",
    role: "MEMBER_WITH_TEAM",
  },
  {
    label: "Member: No Team",
    role: "MEMBER_NO_TEAM",
  },
];

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "@/lib/client-request";
import {
  RETURN_TO_PARAM,
  normalizeReturnTo,
  parseLeagueIdFromReturnTo,
} from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type LeagueRole = "COMMISSIONER" | "MEMBER";
type IdentityOption = "COMMISSIONER" | "MEMBER_WITH_TEAM" | "MEMBER_NO_TEAM";

type Identity = {
  email: string;
  name: string | null;
  leagueRole: LeagueRole;
  teamId: string | null;
  teamName: string | null;
};

type IdentityPayload = {
  activeEmail: string | null;
  demoAuthEnabled: boolean;
  identities: Identity[];
};

const LOGIN_ROLE_OPTIONS: Array<{
  option: IdentityOption;
  label: string;
  description: string;
  testId: string;
}> = [
  {
    option: "COMMISSIONER",
    label: "League Commissioner",
    description: "Run weekly league operations and approvals.",
    testId: "login-role-option-commissioner",
  },
  {
    option: "MEMBER_WITH_TEAM",
    label: "League Member (Team)",
    description: "Manage your team roster and participate in drafts.",
    testId: "login-role-option-member-team",
  },
  {
    option: "MEMBER_NO_TEAM",
    label: "League Member (No Team)",
    description: "Participate in league without an active team.",
    testId: "login-role-option-member-no-team",
  },
];

function toIdentityOption(identity: Identity): IdentityOption {
  if (identity.leagueRole === "COMMISSIONER") {
    return "COMMISSIONER";
  }
  return identity.teamId ? "MEMBER_WITH_TEAM" : "MEMBER_NO_TEAM";
}

function identityLabel(identity: Identity): string {
  if (identity.leagueRole === "COMMISSIONER") {
    return "Commissioner";
  }
  if (identity.teamId && identity.teamName) {
    return `${identity.teamName} Owner`;
  }
  return "Member";
}

export default function DevLoginPage() {
  const router = useRouter();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [demoAuthEnabled, setDemoAuthEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/");
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  const loginOpenedAtRef = useRef(Date.now());

  // Environment checks for demo auth
  const isProduction = process.env.NODE_ENV === "production";
  const isDemoAuthAvailable = demoAuthEnabled && !isProduction;


  // Load recent emails from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dev-recent-emails");
      if (stored) {
        try {
          setRecentEmails(JSON.parse(stored));
        } catch {}
      }
    }
  }, []);

  // Save recent emails to localStorage
  const addRecentEmail = useCallback((email: string) => {
    setRecentEmails((prev) => {
      const next = [email, ...prev.filter((e) => e !== email)].slice(0, 5);
      if (typeof window !== "undefined") {
        localStorage.setItem("dev-recent-emails", JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const loadIdentities = useCallback(async () => {
    setIsLoading(true);

    try {
      const payload = await requestJson<IdentityPayload>("/api/auth/identities", {
        cache: "no-store",
      });
      setDemoAuthEnabled(payload.demoAuthEnabled);
      setIdentities(payload.identities);
      setActiveEmail(payload.activeEmail);

    } catch (loadError) {
      console.warn("Failed to load demo identities:", loadError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setReturnTo(normalizeReturnTo(params.get(RETURN_TO_PARAM)) ?? "/");
    }

    loadIdentities();
  }, [loadIdentities]);


  // Group identities by scenario
  const groupedIdentities = useMemo(() => {
    const groups: Record<IdentityOption, Identity[]> = {
      COMMISSIONER: [],
      MEMBER_WITH_TEAM: [],
      MEMBER_NO_TEAM: [],
    };
    identities.forEach((identity) => {
      groups[toIdentityOption(identity)].push(identity);
    });
    return groups;
  }, [identities]);

  // Recent identities (if still present)
  const recentIdentities = useMemo(() => {
    return recentEmails
      .map((email) => identities.find((i) => i.email === email))
      .filter(Boolean) as Identity[];
  }, [recentEmails, identities]);

  async function signInAs(email: string, overrideRoute?: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await requestJson<{ destination?: string }>(
        "/api/auth/session",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "demo",
            email,
            leagueId: parseLeagueIdFromReturnTo(returnTo),
          }),
        },
        "Sign-in failed.",
      );
      addRecentEmail(email);
      let destination = overrideRoute || response.destination;
      if (!destination || destination === "/") {
        destination = "/my-leagues";
      }
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_SUCCESS,
        pagePath: "/dev/login",
        eventStep: "sign_in",
        status: "success",
        entityType: "auth_identity",
        entityId: email,
        context: {
          returnTo,
          destination,
          elapsedMs: Date.now() - loginOpenedAtRef.current,
          authMode: "demo",
        },
      });
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_RETURN_TO_REDIRECT,
        pagePath: "/dev/login",
        eventStep: "route_transition",
        status: "success",
        entityType: "route",
        entityId: destination,
        context: {
          destination,
          requestedReturnTo: returnTo,
          authMode: "demo",
        },
      });
      router.push(destination);
      router.refresh();
    } catch (submitError) {
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_FAILURE,
        pagePath: "/dev/login",
        eventStep: "sign_in",
        status: "error",
        entityType: "auth_identity",
        entityId: email || "none",
        context: {
          returnTo,
          authMode: "demo",
        },
      });
      setError(submitError instanceof Error ? submitError.message : "Could not authenticate with demo identity.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Redirect to canonical login if demo auth is not available
  if (!isDemoAuthAvailable && !isLoading) {
    router.replace(`/login${returnTo !== "/" ? `?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : ""}`);
    return null;
  }

  return (
    <div className="flex min-h-full flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-lg lg:w-[32rem]">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <Link
                href="/"
                className="flex-shrink-0"
                aria-label="Dynasty Football home"
              >
                <img
                  src="/brand/dynasty-logo-mark.png"
                  alt="Dynasty Football"
                  width={40}
                  height={40}
                  className="h-10 w-10"
                />
              </Link>
              <div className="flex items-center gap-2">
                <div className="h-6 w-px bg-amber-600/40"></div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚡️</span>
                    <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-400">
                      Dev Test Harness
                    </h1>
                  </div>
                  <p className="text-xs text-amber-200/80">
                    One-click Seeded Persona Launcher
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-600/30 bg-amber-950/20 p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 flex-shrink-0">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </span>
                <div className="space-y-2 text-xs text-amber-200">
                  <p className="font-medium">Development Environment Only</p>
                  <p>This page provides access to seeded test identities for development and testing workflows. It should never be available in production environments.</p>
                  <p>
                    For canonical authentication, use the{" "}
                    <Link 
                      href={`/login${returnTo !== "/" ? `?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : ""}`}
                      className="underline hover:text-amber-100"
                    >
                      main login page
                    </Link>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
              <p className="mt-4 text-sm text-amber-300">Loading demo identities...</p>
            </div>
          ) : identities.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-amber-400">No demo identities are available in the active workspace.</p>
              <p className="mt-2 text-xs text-amber-300">
                Ensure seeded accounts are properly configured in your development environment.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-md border border-red-600/40 bg-red-950/20 p-3 mb-4">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}


              {/* Quick Launch Row */}
              <div className="mb-6">
                <h2 className="text-xs font-bold text-amber-400 uppercase mb-2 tracking-widest">Quick Launch</h2>
                <div className="flex flex-wrap gap-2">
                  {QUICK_LAUNCH_SCENARIOS.map((scenario) => {
                    // Find first persona for this role
                    const persona = groupedIdentities[scenario.role as IdentityOption]?.[0];
                    if (!persona) return null;
                    return (
                      <button
                        key={scenario.label}
                        type="button"
                        onClick={() => signInAs(persona.email)}
                        className="rounded bg-amber-700/80 hover:bg-amber-700 text-xs font-semibold text-white px-3 py-1.5 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={isSubmitting}
                        data-testid={`quick-launch-${scenario.role}`}
                      >
                        {scenario.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recent picker */}
              {recentIdentities.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-xs font-bold text-amber-400 uppercase mb-2 tracking-widest">Recent</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentIdentities.map((identity) => (
                      <button
                        key={identity.email}
                        type="button"
                        onClick={() => signInAs(identity.email)}
                        className="rounded-md border border-amber-600/40 bg-amber-900/30 px-4 py-3 text-left text-sm text-amber-200 hover:bg-amber-900/50 transition flex flex-col gap-1"
                        disabled={isSubmitting}
                        data-testid={`persona-card-recent-${identity.email}`}
                      >
                        <span className="font-medium">{identity.name ?? identity.email}</span>
                        <span className="text-xs text-amber-300">{identityLabel(identity)}</span>
                        <span className="text-xs text-amber-400">{identity.email}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Grouped persona cards */}
              {Object.entries(groupedIdentities).map(([option, group]) => (
                group.length > 0 && (
                  <div key={option} className="mb-8">
                    <h2 className="text-xs font-bold text-amber-400 uppercase mb-2 tracking-widest">
                      {LOGIN_ROLE_OPTIONS.find((o) => o.option === option)?.label || option}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.map((identity) => (
                        <button
                          key={identity.email}
                          type="button"
                          onClick={() => signInAs(identity.email)}
                          className="rounded-md border border-amber-600/40 bg-amber-900/30 px-4 py-3 text-left text-sm text-amber-200 hover:bg-amber-900/50 transition flex flex-col gap-1"
                          disabled={isSubmitting}
                          data-testid={`persona-card-${option}-${identity.email}`}
                        >
                          <span className="font-medium">{identity.name ?? identity.email}</span>
                          <span className="text-xs text-amber-300">{identityLabel(identity)}</span>
                          <span className="text-xs text-amber-400">{identity.email}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </>
          )}
        </div>
      </div>

      {/* Background pattern */}
      <div className="relative hidden w-0 flex-1 lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-950/20 via-transparent to-orange-950/30"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/5 via-transparent to-transparent"></div>
        <div 
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='none' fill-rule='evenodd'%3e%3cg fill='%23f59e0b' fill-opacity='0.1'%3e%3ccircle cx='30' cy='30' r='2'/%3e%3c/g%3e%3c/g%3e%3c/svg%3e\")"
          }}
        ></div>
      </div>
    </div>
  );
}