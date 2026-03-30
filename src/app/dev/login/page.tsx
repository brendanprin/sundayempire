"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [selectedRole, setSelectedRole] = useState<IdentityOption | null>(null);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/");
  const loginOpenedAtRef = useRef(Date.now());
  const selectedEmailRef = useRef("");

  // Environment checks for demo auth
  const isProduction = process.env.NODE_ENV === "production";
  const isDemoAuthAvailable = demoAuthEnabled && !isProduction;

  useEffect(() => {
    selectedEmailRef.current = selectedEmail;
  }, [selectedEmail]);

  const loadIdentities = useCallback(async () => {
    setIsLoading(true);

    try {
      const payload = await requestJson<IdentityPayload>("/api/auth/identities", {
        cache: "no-store",
      });
      setDemoAuthEnabled(payload.demoAuthEnabled);
      setIdentities(payload.identities);
      setActiveEmail(payload.activeEmail);

      const nextEmail =
        selectedEmailRef.current ||
        payload.activeEmail ||
        payload.identities[0]?.email ||
        "";
      const nextIdentity =
        payload.identities.find((identity) => identity.email === nextEmail) ?? null;

      setSelectedEmail(nextEmail);
      setSelectedRole(
        nextIdentity ? toIdentityOption(nextIdentity) : payload.identities[0] ? toIdentityOption(payload.identities[0]) : null,
      );
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

  const identitiesForSelectedRole = useMemo(() => {
    if (!selectedRole) return [];
    return identities.filter((identity) => toIdentityOption(identity) === selectedRole);
  }, [identities, selectedRole]);

  const selectedIdentity = useMemo(() => {
    return selectedEmail ? identities.find((identity) => identity.email === selectedEmail) ?? null : null;
  }, [identities, selectedEmail]);

  async function handleDemoSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmail) {
      setError("Select an account before signing in.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await requestJson<{ destination?: string }>(
        "/api/auth/session",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mode: "demo",
            email: selectedEmail,
            leagueId: parseLeagueIdFromReturnTo(returnTo),
          }),
        },
        "Sign-in failed.",
      );

      // Ensure we navigate to an authenticated route, never back to the landing page
      const destination = response.destination && response.destination !== "/" 
        ? response.destination 
        : "/my-leagues";

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_SUCCESS,
        pagePath: "/dev/login",
        eventStep: "sign_in",
        status: "success",
        entityType: "auth_identity",
        entityId: selectedEmail,
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
        entityId: selectedEmail || "none",
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
        <div className="mx-auto w-full max-w-sm lg:w-96">
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
                    <span className="text-lg">⚠️</span>
                    <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-400">
                      Development Access
                    </h1>
                  </div>
                  <p className="text-xs text-amber-200/80">
                    Seeded Identity Switcher
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
            <form className="space-y-6" onSubmit={handleDemoSignIn} data-testid="login-demo-auth-panel">
              {error && (
                <div className="rounded-md border border-red-600/40 bg-red-950/20 p-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div className="space-y-3" data-testid="login-role-prompt">
                <label className="block">
                  <span className="text-sm font-medium text-amber-300 mb-3 block">
                    Select Role
                  </span>
                  <div className="grid gap-3">
                    {LOGIN_ROLE_OPTIONS.map((option, index) => {
                      const count = identities.filter(
                        (identity) => toIdentityOption(identity) === option.option,
                      ).length;
                      const isSelected = selectedRole === option.option;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setSelectedRole(option.option);
                            setSelectedEmail("");
                          }}
                          className="rounded-md border p-4 text-left transition hover:border-amber-500/70"
                          style={{
                            borderColor: isSelected
                              ? "rgb(245, 158, 11)"
                              : "rgb(245, 158, 11, 0.3)",
                            backgroundColor: isSelected 
                              ? "rgb(245, 158, 11, 0.1)" 
                              : "rgb(245, 158, 11, 0.05)",
                          }}
                          data-testid={option.testId}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-amber-200">
                                {option.label}
                              </p>
                              <p className="mt-1 text-xs text-amber-300/80">
                                {option.description}
                              </p>
                            </div>
                            <div className="ml-4 flex-shrink-0">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-900/30 text-amber-300">
                                {count} account{count === 1 ? "" : "s"}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </label>
              </div>

              <label className="block space-y-3">
                <span className="text-sm font-medium text-amber-300">
                  Select Account
                </span>
                <select
                  value={selectedEmail}
                  onChange={(event) => {
                    const nextEmail = event.target.value;
                    setSelectedEmail(nextEmail);
                  }}
                  disabled={!selectedRole}
                  className="w-full rounded-md border border-amber-600/40 bg-amber-950/20 px-3 py-3 text-sm text-amber-200 placeholder-amber-400/60 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  data-testid="login-demo-email-select"
                >
                  <option value="">
                    {selectedRole ? "Choose an account..." : "Select a role first"}
                  </option>
                  {identitiesForSelectedRole.map((identity) => (
                    <option key={identity.email} value={identity.email}>
                      {identity.name ?? identity.email} ({identityLabel(identity)})
                    </option>
                  ))}
                </select>
              </label>

              {selectedRole && identitiesForSelectedRole.length === 0 ? (
                <p className="text-xs text-amber-400" data-testid="login-role-no-identities">
                  No accounts are available for this role in the current league workspace.
                </p>
              ) : null}

              {selectedIdentity ? (
                <div className="rounded-md border border-amber-600/30 bg-amber-950/10 p-3">
                  <p className="text-xs text-amber-300" data-testid="login-selection-summary">
                    <span className="font-medium">Selected:</span> {selectedIdentity.name ?? selectedIdentity.email} as{" "}
                    {identityLabel(selectedIdentity)}
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || !selectedEmail || !selectedRole}
                className="w-full rounded-md border border-amber-600/40 bg-amber-900/30 px-4 py-3 text-sm font-medium text-amber-300 transition hover:bg-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="login-demo-submit"
              >
                {isSubmitting ? "Signing In..." : "Sign In with Demo Identity"}
              </button>
            </form>
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