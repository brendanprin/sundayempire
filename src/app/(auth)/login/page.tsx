"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "@/lib/client-request";
import {
  LOGIN_ERROR_PARAM,
  LOGIN_ERROR_MAGIC_LINK_INVALID,
  LOGIN_ERROR_MAGIC_LINK_EXPIRED,
  LOGIN_ERROR_MAGIC_LINK_USED,
  LOGIN_ERROR_USER_NOT_FOUND,
  LOGIN_ERROR_SESSION_EXPIRED,
  RETURN_TO_PARAM,
  SWITCH_SESSION_PARAM,
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

function buildLoginErrorMessage(code: string | null) {
  switch (code) {
    case LOGIN_ERROR_MAGIC_LINK_INVALID:
      return {
        title: "Invalid Sign-In Link",
        message: "This sign-in link appears to be malformed or corrupted.",
        canResendToSameEmail: false,
        recoveryAction: "request_new"
      };
    
    case LOGIN_ERROR_MAGIC_LINK_EXPIRED:
      return {
        title: "Expired Sign-In Link",
        message: "This sign-in link has expired. Sign-in links are valid for 15 minutes after being sent.",
        canResendToSameEmail: true,
        recoveryAction: "resend"
      };
    
    case LOGIN_ERROR_MAGIC_LINK_USED:
      return {
        title: "Already Used",
        message: "This sign-in link has already been used. Each link can only be used once for security.",
        canResendToSameEmail: true,
        recoveryAction: "request_new"
      };
    
    case LOGIN_ERROR_USER_NOT_FOUND:
      return {
        title: "No League Access",
        message: "This email address is not associated with any Dynasty Football league. Access requires an invitation from a league commissioner.",
        canResendToSameEmail: false,
        recoveryAction: "request_new"
      };

    case LOGIN_ERROR_SESSION_EXPIRED:
      return {
        title: "Session Expired",
        message: "Your session has expired. Please sign in again to continue.",
        canResendToSameEmail: false,
        recoveryAction: "request_new"
      };
    
    default:
      return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [demoAuthEnabled, setDemoAuthEnabled] = useState(false);
  const [selectedRole, setSelectedRole] = useState<IdentityOption | null>(null);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ReturnType<typeof buildLoginErrorMessage>>(null);
  const [returnTo, setReturnTo] = useState("/");
  const [switchRequested, setSwitchRequested] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const loginOpenedAtRef = useRef(Date.now());
  const loginViewedTrackedRef = useRef(false);
  const selectedEmailRef = useRef("");

  // Environment checks for demo auth
  const isProduction = process.env.NODE_ENV === "production";
  const isDemoAuthAvailable = demoAuthEnabled && !isProduction;

  useEffect(() => {
    selectedEmailRef.current = selectedEmail;
  }, [selectedEmail]);

  const loadIdentities = useCallback(async () => {
    setIsLoadingDemo(true);

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
      setDemoAuthEnabled(false);
      setIdentities([]);
      setActiveEmail(null);
      setSelectedRole(null);
      setSelectedEmail("");
    } finally {
      setIsLoadingDemo(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const normalizedReturnTo = normalizeReturnTo(params.get(RETURN_TO_PARAM)) ?? "/";
    const isSwitchRequested = params.get(SWITCH_SESSION_PARAM) === "1";
    const loginError = buildLoginErrorMessage(params.get(LOGIN_ERROR_PARAM));

    setReturnTo(normalizedReturnTo);
    setSwitchRequested(isSwitchRequested);
    setErrorDetails(loginError);
    setError(loginError?.message || null);

    if (!loginViewedTrackedRef.current) {
      loginViewedTrackedRef.current = true;
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_LOGIN_VIEWED,
        pagePath: "/login",
        eventStep: "view",
        status: "success",
        entityType: "auth_entry",
        entityId: isSwitchRequested ? "switch_session" : "sign_in",
        context: {
          returnTo: normalizedReturnTo,
          switchRequested: isSwitchRequested,
        },
      });
    }

    // Load demo identities in background
    void loadIdentities();
  }, [loadIdentities]);

  const identitiesForSelectedRole = useMemo(() => {
    if (!selectedRole) return [];
    return identities.filter((identity) => toIdentityOption(identity) === selectedRole);
  }, [identities, selectedRole]);

  const selectedIdentity = useMemo(() => {
    return selectedEmail ? identities.find((identity) => identity.email === selectedEmail) ?? null : null;
  }, [identities, selectedEmail]);

  async function handleMagicLinkRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await requestJson(
        "/api/auth/session",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            returnTo,
          }),
        },
        "Could not send a sign-in link.",
      );

      const normalizedEmail = email.trim().toLowerCase();
      setRequestedEmail(normalizedEmail);
      setEmail(normalizedEmail);

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_MAGIC_LINK_REQUESTED,
        pagePath: "/login",
        eventStep: "request",
        status: "success",
        entityType: "auth_email",
        entityId: normalizedEmail,
        context: {
          returnTo,
          switchRequested,
          elapsedMs: Date.now() - loginOpenedAtRef.current,
        },
      });
    } catch (submitError) {
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_FAILURE,
        pagePath: "/login",
        eventStep: "request",
        status: "error",
        entityType: "auth_email",
        entityId: email.trim().toLowerCase() || "none",
        context: {
          returnTo,
          switchRequested,
        },
      });
      setError(submitError instanceof Error ? submitError.message : "Could not send sign-in link. Please check that this email has league access.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
        pagePath: "/login",
        eventStep: "sign_in",
        status: "success",
        entityType: "auth_identity",
        entityId: selectedEmail,
        context: {
          returnTo,
          destination,
          switchRequested,
          elapsedMs: Date.now() - loginOpenedAtRef.current,
          authMode: "demo",
        },
      });
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_RETURN_TO_REDIRECT,
        pagePath: "/login",
        eventStep: "route_transition",
        status: "success",
        entityType: "route",
        entityId: destination,
        context: {
          destination,
          requestedReturnTo: returnTo,
          switchRequested,
          authMode: "demo",
        },
      });

      router.push(destination);
      router.refresh();
    } catch (submitError) {
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_FAILURE,
        pagePath: "/login",
        eventStep: "sign_in",
        status: "error",
        entityType: "auth_identity",
        entityId: selectedEmail || "none",
        context: {
          returnTo,
          switchRequested,
          authMode: "demo",
        },
      });
      setError(submitError instanceof Error ? submitError.message : "Could not authenticate with demo identity.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRetrySubmission() {
    setError(null);
    setErrorDetails(null);
    setRequestedEmail(null);
  }

  function openDevModal() {
    setShowDevModal(true);
    setError(null);
  }

  const showSignInForm = !requestedEmail;
  const showSuccessMessage = !showSignInForm;

  return (
    <>
      <div className="flex min-h-full flex-1">
        <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
          <div className="mx-auto w-full max-w-sm lg:w-96">
            <div>
              <Link href="/" className="inline-block">
                <img
                  alt="SundayEmpire"
                  src="/brand/badge/sundayempire-logo-badge.png"
                  className="h-10 w-auto"
                />
              </Link>
              <h2 className="mt-8 text-2xl font-bold leading-9 tracking-tight" style={{ color: "var(--foreground)" }}>
                Sign in to your account
              </h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--shell-text-secondary)" }}>
                SundayEmpire access requires a league invite.{" "}
                <Link
                  href="/"
                  className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Learn more about joining a league
                </Link>
              </p>
            </div>

            <div className="mt-10">
              {errorDetails && (
                <div 
                  className="mb-6 rounded-md border p-4"
                  style={{ 
                    borderColor: "var(--destructive-border)", 
                    backgroundColor: "var(--destructive-background)" 
                  }}
                >
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg 
                        className="h-5 w-5" 
                        style={{ color: "var(--destructive-foreground)" }}
                        viewBox="0 0 20 20" 
                        fill="currentColor" 
                        aria-hidden="true"
                      >
                        <path 
                          fillRule="evenodd" 
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" 
                          clipRule="evenodd" 
                        />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-sm font-medium" style={{ color: "var(--destructive-foreground)" }}>
                        {errorDetails.title}
                      </h3>
                      <div className="mt-2 text-sm" style={{ color: "var(--destructive-foreground)" }}>
                        <p>{errorDetails.message}</p>
                      </div>
                      {errorDetails.canResendToSameEmail && email && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={handleRetrySubmission}
                            className="text-sm font-medium underline hover:no-underline"
                            style={{ color: "var(--destructive-foreground)" }}
                          >
                            Try again
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {showSuccessMessage && (
                <div 
                  className="mb-6 rounded-md border p-4"
                  style={{ 
                    borderColor: "var(--success-border)", 
                    backgroundColor: "var(--success-background)" 
                  }}
                >
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg 
                        className="h-5 w-5" 
                        style={{ color: "var(--success-foreground)" }}
                        viewBox="0 0 20 20" 
                        fill="currentColor" 
                        aria-hidden="true"
                      >
                        <path 
                          fillRule="evenodd" 
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.236 4.53L7.643 10.5a.75.75 0 00-1.286.768l1.857 3.429a.75.75 0 001.286-.768l1.286 2.571a.75.75 0 001.214-1.426L10.5 13.571l3.357-4.38z" 
                          clipRule="evenodd" 
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium" style={{ color: "var(--success-foreground)" }}>
                        Sign-in link sent
                      </h3>
                      <div className="mt-2 text-sm" style={{ color: "var(--success-foreground)" }}>
                        <p>Check your email at <strong>{requestedEmail}</strong> for a sign-in link.</p>
                        <p className="mt-1">The link will expire in 15 minutes.</p>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={handleRetrySubmission}
                          className="text-sm font-medium underline hover:no-underline"
                          style={{ color: "var(--success-foreground)" }}
                        >
                          Send to a different email
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showSignInForm && (
                <form className="space-y-6" onSubmit={handleMagicLinkRequest}>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium leading-6"
                      style={{ color: "var(--foreground)" }}
                    >
                      Email address
                    </label>
                    <div className="mt-2">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="Your invited league email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:ring-gray-600 dark:bg-gray-800 dark:text-white "
                        data-testid="login-email-input"
                      />
                    </div>
                  </div>

                  {error && !errorDetails && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-600 dark:bg-red-950">
                      <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                  )}

                  <div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="login-submit"
                    >
                      {isSubmitting ? "Sending..." : "Send sign-in link"}
                    </button>
                  </div>
                </form>
              )}

              <p className="mt-6 text-xs" style={{ color: "var(--shell-text-muted)" }}>
                Secure email authentication • No passwords needed • For invited league members
              </p>

              <div className="mt-6 border-t border-gray-700/50 pt-6">
                <p className="text-sm text-gray-400 mb-3">Starting a new league?</p>
                <Link
                  href="/login?returnTo=%2Fmy-leagues%2Fnew"
                  onClick={() => {
                    setReturnTo("/my-leagues/new");
                    setEmail("");
                    setRequestedEmail(null);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-400 hover:text-white"
                  data-testid="login-create-league-cta"
                >
                  Create a league
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Subtle development access entry point */}
              {isDemoAuthAvailable && !showDevModal && (
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={openDevModal}
                    className="text-xs text-gray-400 hover:text-gray-300 underline decoration-dotted"
                    data-testid="login-show-demo-section"
                  >
                    Development access
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Background pattern */}
        <div className="relative hidden w-0 flex-1 lg:block overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-slate-800 to-purple-900/20"></div>
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='none' fill-rule='evenodd'%3e%3cg fill='%236366f1' fill-opacity='0.4'%3e%3ccircle cx='30' cy='30' r='2'/%3e%3c/g%3e%3c/g%3e%3c/svg%3e\")"
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
        </div>
      </div>

      {/* Development Modal - Overlay instead of inline */}
      {showDevModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDevModal(false)}>
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg border shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            data-testid="login-demo-auth-panel"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    Development Access
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDevModal(false)}
                  className="rounded p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Close development access"
                  data-testid="login-demo-close"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded border-l-2 border-gray-300 dark:border-gray-600">
                <p className="font-medium mb-1">Developer Testing Tool</p>
                <p>Switch between pre-seeded test accounts. This utility bypasses normal invitation requirements and is only available in development environments.</p>
              </div>

              {isLoadingDemo ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading accounts...</p>
                </div>
              ) : identities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No demo identities available</p>
              ) : (
                <form className="space-y-4" onSubmit={handleDemoSignIn}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Role
                    </label>
                    <div className="grid gap-2">
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
                            className={`text-left p-3 rounded border text-sm transition ${
                              isSelected 
                                ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20' 
                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
                            }`}
                            data-testid={option.testId}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{option.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                              </div>
                              <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                {count}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Account
                    </label>
                    <select
                      value={selectedEmail}
                      onChange={(event) => setSelectedEmail(event.target.value)}
                      disabled={!selectedRole}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
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
                  </div>

                  {selectedRole && identitiesForSelectedRole.length === 0 && (
                    <p className="text-xs text-gray-500" data-testid="login-role-no-identities">
                      No accounts available for this role.
                    </p>
                  )}

                  {selectedIdentity && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded border text-xs">
                      <p className="text-gray-600 dark:text-gray-400" data-testid="login-selection-summary">
                        <span className="font-medium">Selected:</span> {selectedIdentity.name ?? selectedIdentity.email} as {identityLabel(selectedIdentity)}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || !selectedEmail || !selectedRole}
                      className="flex-1 rounded bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed"
                      data-testid="login-demo-submit"
                    >
                      {isSubmitting ? "Signing In..." : "Use Account"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDevModal(false)}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
