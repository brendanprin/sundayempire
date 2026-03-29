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
    description: "Sign in as a member with active team management access.",
    testId: "login-role-option-member-team",
  },
  {
    option: "MEMBER_NO_TEAM",
    label: "League Member (No Team)",
    description: "Sign in as a member without team assignment.",
    testId: "login-role-option-member-no-team",
  },
];

function roleLabel(role: LeagueRole) {
  if (role === "COMMISSIONER") {
    return "Commissioner";
  }
  return "Member";
}

function identityLabel(identity: Identity) {
  const parts = [roleLabel(identity.leagueRole)];
  if (identity.teamName) {
    parts.push(identity.teamName);
  } else if (identity.leagueRole === "MEMBER") {
    parts.push("No team assignment");
  }
  return parts.join(" - ");
}

function toIdentityOption(identity: Identity): IdentityOption {
  if (identity.leagueRole === "COMMISSIONER") {
    return "COMMISSIONER";
  }

  if (identity.teamId) {
    return "MEMBER_WITH_TEAM";
  }

  return "MEMBER_NO_TEAM";
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
        title: "Already Used Sign-In Link",
        message: "This sign-in link has already been used. Each link can only be used once for security.",
        canResendToSameEmail: true,
        recoveryAction: "resend"
      };
    
    case LOGIN_ERROR_USER_NOT_FOUND:
      return {
        title: "Account Access Issue",
        message: "We couldn't locate or create your account. This may be a temporary issue.",
        canResendToSameEmail: true,
        recoveryAction: "retry"
      };
    
    case LOGIN_ERROR_SESSION_EXPIRED:
      return {
        title: "Session Expired",
        message: "Your session expired or was revoked. Sign in again to continue.",
        canResendToSameEmail: false,
        recoveryAction: "sign_in_again"
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ReturnType<typeof buildLoginErrorMessage>>(null);
  const [returnTo, setReturnTo] = useState("/");
  const [switchRequested, setSwitchRequested] = useState(false);
  const loginOpenedAtRef = useRef(Date.now());
  const loginViewedTrackedRef = useRef(false);
  const selectedEmailRef = useRef("");
  const emailRef = useRef("");

  useEffect(() => {
    selectedEmailRef.current = selectedEmail;
  }, [selectedEmail]);

  useEffect(() => {
    emailRef.current = email;
  }, [email]);

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

      if (!emailRef.current && payload.activeEmail) {
        setEmail(payload.activeEmail);
      }
    } catch (loadError) {
      setDemoAuthEnabled(false);
      setIdentities([]);
      setActiveEmail(null);
      setSelectedRole(null);
      setSelectedEmail("");
      setError(loadError instanceof Error ? loadError.message : "Unable to load login options.");
    } finally {
      setIsLoading(false);
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
  }, []);

  useEffect(() => {
    void loadIdentities();
  }, [loadIdentities]);

  const selectedIdentity = useMemo(
    () => identities.find((identity) => identity.email === selectedEmail) ?? null,
    [identities, selectedEmail],
  );
  const identitiesForSelectedRole = useMemo(() => {
    if (!selectedRole) {
      return identities;
    }
    return identities.filter((identity) => toIdentityOption(identity) === selectedRole);
  }, [identities, selectedRole]);

  useEffect(() => {
    if (!selectedRole) {
      return;
    }

    const roleIdentities = identities.filter((identity) => toIdentityOption(identity) === selectedRole);
    if (roleIdentities.length === 0) {
      if (selectedEmail !== "") {
        setSelectedEmail("");
      }
      return;
    }

    if (!roleIdentities.some((identity) => identity.email === selectedEmail)) {
      setSelectedEmail(roleIdentities[0].email);
    }
  }, [identities, selectedEmail, selectedRole]);

  function handleRoleSelection(role: IdentityOption) {
    setSelectedRole(role);
    const firstIdentityForRole = identities.find((identity) => toIdentityOption(identity) === role);
    setSelectedEmail(firstIdentityForRole?.email ?? "");
  }

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
      setError(submitError instanceof Error ? submitError.message : "Could not send a sign-in link.");
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
      await requestJson(
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

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SIGN_IN_SUCCESS,
        pagePath: "/login",
        eventStep: "sign_in",
        status: "success",
        entityType: "auth_identity",
        entityId: selectedEmail,
        context: {
          returnTo,
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
        entityId: returnTo,
        context: {
          destination: returnTo,
          switchRequested,
          authMode: "demo",
        },
      });

      router.push(returnTo);
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
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setIsSubmitting(true);
    setError(null);

    try {
      await requestJson(
        "/api/auth/session",
        {
          method: "DELETE",
        },
        "Could not clear the current session.",
      );

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SESSION_RESET,
        pagePath: "/login",
        eventStep: "reset_session",
        status: "success",
        entityType: "auth_session",
        entityId: requestedEmail || activeEmail || "active",
        context: {
          returnTo,
          switchRequested,
        },
      });

      setRequestedEmail(null);
      await loadIdentities();
      router.refresh();
    } catch (resetError) {
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SESSION_RESET,
        pagePath: "/login",
        eventStep: "reset_session",
        status: "error",
        entityType: "auth_session",
        entityId: requestedEmail || activeEmail || "active",
        context: {
          returnTo,
          switchRequested,
        },
      });
      setError(resetError instanceof Error ? resetError.message : "Could not clear the current session.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const heading = switchRequested
    ? demoAuthEnabled
      ? "Switch Account"
      : "Account"
    : returnTo.startsWith("/invite")
      ? "Accept League Invite"
      : "Sign In";

  const confirmationHeading = requestedEmail ? "Check Your Email" : heading;
  const confirmationDescription = requestedEmail
    ? `We sent a secure sign-in link to ${requestedEmail}. Click the link in your email to continue.`
    : (switchRequested
        ? "Request a fresh sign-in link for yourself, or use the demo switcher only when local/test mode enables it."
        : returnTo.startsWith("/invite")
          ? "Enter the invited email address and we'll send a one-time sign-in link so you can accept the league invite."
          : "We'll email you a secure sign-in link. Works for new accounts and existing users.");

  // Handle resending magic link
  async function handleResendMagicLink() {
    if (!requestedEmail) return;
    
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
            email: requestedEmail,
            returnTo,
          }),
        },
        "Could not send a sign-in link.",
      );

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_MAGIC_LINK_REQUESTED,
        pagePath: "/login",
        eventStep: "resend",
        status: "success",
        entityType: "auth_email",
        entityId: requestedEmail,
        context: {
          returnTo,
          switchRequested,
          action: "resend"
        },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not resend sign-in link.");
      setErrorDetails(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle changing email
  function handleChangeEmail() {
    setRequestedEmail(null);
    setError(null);
    setErrorDetails(null);
    setEmail("");
  }

  // Handle quick recovery actions based on error type
  async function handleQuickRecovery() {
    if (!errorDetails) return;
    
    if (errorDetails.recoveryAction === "resend" && errorDetails.canResendToSameEmail) {
      // If we can resend to the same email, try to get the last email from URL or use a reasonable default
      const lastEmail = email || "";
      if (lastEmail) {
        setEmail(lastEmail);
        await handleMagicLinkRequest(new Event("submit") as any);
      }
    } else {
      // For other cases, just clear the error and let user start fresh
      setErrorDetails(null);
      setError(null);
      setEmail("");
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--shell-text-muted)" }}>
          Authentication
        </p>
        <h2 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          {confirmationHeading}
        </h2>
        <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
          {confirmationDescription}
        </p>
      </header>

      {requestedEmail ? (
        // Confirmation State
        <div
          className="rounded-lg border border-emerald-600/30 p-6"
          style={{ backgroundColor: "var(--brand-success-surface)", borderColor: "var(--brand-success-border)" }}
          data-testid="login-confirmation-state"
        >
          <div className="space-y-4">
            {/* Email icon and confirmation */}
            <div className="flex items-start gap-3">
              <div 
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--brand-success-soft)" }}
              >
                <svg className="h-6 w-6" style={{ color: "var(--brand-success-primary)" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--brand-success-primary)" }}>
                  Sign-in link sent!
                </p>
                <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
                  Check your email for a secure sign-in link. It may take a few minutes to arrive.
                </p>
                <p className="text-xs" style={{ color: "var(--shell-text-muted)" }}>
                  <span className="font-medium">Email:</span> {requestedEmail}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleResendMagicLink}
                disabled={isSubmitting}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="login-resend-link"
              >
                {isSubmitting ? "Resending..." : "Resend Link"}
              </button>
              
              <button
                type="button"
                onClick={handleChangeEmail}
                disabled={isSubmitting}
                className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  color: "var(--shell-text-secondary)",
                }}
                data-testid="login-change-email"
              >
                Use Different Email
              </button>
              
              <Link
                href={returnTo}
                className="text-sm underline decoration-dotted underline-offset-4 transition"
                style={{
                  color: "var(--shell-text-secondary)",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.color = "var(--foreground)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.color = "var(--shell-text-secondary)";
                }}
              >
                {returnTo === "/" ? "Back to home" : "Back to app"}
              </Link>
            </div>
            
            {/* Next steps */}
            <div 
              className="rounded-md border border-[var(--brand-structure-muted)] p-3 text-xs"
              style={{ backgroundColor: "var(--brand-surface-card)" }}
            >
              <p className="font-medium" style={{ color: "var(--foreground)" }}>What happens next?</p>
              <ul className="mt-1 space-y-1" style={{ color: "var(--shell-text-muted)" }}>
                <li>• Check your email inbox (and spam folder)</li>
                <li>• Click the secure sign-in link</li>
                <li>• You'll be automatically signed in and redirected</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        // Initial Email Form State - only show if no magic link error
        !errorDetails && (
        <div
          className="rounded-lg border border-[var(--brand-structure-muted)] p-4"
          style={{ backgroundColor: "var(--brand-surface-muted)" }}
        >
          <div className="space-y-5">
            <form className="space-y-4" onSubmit={handleMagicLinkRequest} data-testid="magic-link-form">
              <div className="space-y-2">
                <span
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--shell-text-muted)" }}
                >
                  Email Address
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-[var(--brand-structure-muted)] px-3 py-2 text-sm focus:border-[var(--brand-accent-primary)] focus:outline-none"
                  style={{
                    backgroundColor: "var(--brand-surface-card)",
                    color: "var(--foreground)",
                  }}
                  disabled={isSubmitting}
                  data-testid="login-email-input"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || email.trim().length === 0}
                  className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="login-submit"
                >
                  {isSubmitting ? "Sending Link..." : "Email Me a Sign-In Link"}
                </button>
                {switchRequested ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSignOut();
                    }}
                    disabled={isSubmitting}
                    className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      color: "var(--shell-text-secondary)",
                    }}
                    data-testid="login-sign-out"
                  >
                    Sign Out
                  </button>
                ) : null}
                <Link
                  href={returnTo}
                  className="text-sm underline decoration-dotted underline-offset-4 transition"
                  style={{
                    color: "var(--shell-text-secondary)",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.color = "var(--foreground)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.color = "var(--shell-text-secondary)";
                  }}
                >
                  {returnTo === "/" ? "Back to home" : "Back to app"}
                </Link>
              </div>
            </form>

            <p className="text-xs" style={{ color: "var(--shell-text-muted)" }}>
              Magic-link authentication • No passwords needed • Works for new and returning users
            </p>
          </div>
        </div>
        )
      )}

      {demoAuthEnabled ? (
        <div
          className="rounded-lg border border-[var(--brand-structure-muted)] p-4"
          style={{ backgroundColor: "var(--brand-surface-muted)" }}
          data-testid="login-demo-auth-panel"
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--shell-text-muted)" }}>
                Demo/Test Access
              </p>
              <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
                This seeded account switcher is only available because demo auth is explicitly enabled for this environment.
              </p>
            </div>

            {isLoading ? (
              <p className="text-sm" style={{ color: "var(--foreground)" }}>
                Loading demo identities...
              </p>
            ) : identities.length === 0 ? (
              <p className="text-sm text-amber-600">No demo identities are available in the active workspace.</p>
            ) : (
              <form className="space-y-4" onSubmit={handleDemoSignIn}>
                <div className="space-y-2" data-testid="login-role-prompt">
                  <span
                    className="text-xs uppercase tracking-wide"
                    style={{ color: "var(--shell-text-muted)" }}
                  >
                    Sign In As
                  </span>
                  <div className="grid gap-2 md:grid-cols-3">
                    {LOGIN_ROLE_OPTIONS.map((option) => {
                      const isSelected = selectedRole === option.option;
                      const count = identities.filter(
                        (identity) => toIdentityOption(identity) === option.option,
                      ).length;
                      return (
                        <button
                          key={option.option}
                          type="button"
                          onClick={() => handleRoleSelection(option.option)}
                          className={`rounded-md border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-[var(--brand-accent-primary)] bg-[var(--brand-accent-soft)]"
                              : "border-[var(--brand-structure-muted)] hover:border-[var(--brand-structure)]"
                          }`}
                          style={{
                            backgroundColor: isSelected ? undefined : "var(--brand-surface-card)",
                          }}
                          data-testid={option.testId}
                        >
                          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                            {option.label}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: "var(--shell-text-secondary)" }}>
                            {option.description}
                          </p>
                          <p className="mt-2 text-[11px]" style={{ color: "var(--shell-text-muted)" }}>
                            {count} account{count === 1 ? "" : "s"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block space-y-2">
                  <span
                    className="text-xs uppercase tracking-wide"
                    style={{ color: "var(--shell-text-muted)" }}
                  >
                    Choose Account
                  </span>
                  <select
                    value={selectedEmail}
                    onChange={(event) => {
                      const nextEmail = event.target.value;
                      setSelectedEmail(nextEmail);
                      const nextIdentity =
                        identities.find((identity) => identity.email === nextEmail) ?? null;
                      if (nextIdentity) {
                        setSelectedRole(toIdentityOption(nextIdentity));
                      }
                    }}
                    className="w-full rounded-md border border-[var(--brand-structure-muted)] px-3 py-2 text-sm focus:border-[var(--brand-accent-primary)] focus:outline-none"
                    style={{
                      backgroundColor: "var(--brand-surface-card)",
                      color: "var(--foreground)",
                    }}
                    disabled={isSubmitting}
                    data-testid="login-identity-select"
                  >
                    {identitiesForSelectedRole.map((identity) => (
                      <option key={identity.email} value={identity.email}>
                        {identity.name ?? identity.email} ({identityLabel(identity)})
                      </option>
                    ))}
                  </select>
                </label>

                {selectedRole && identitiesForSelectedRole.length === 0 ? (
                  <p className="text-xs text-amber-600" data-testid="login-role-no-identities">
                    No accounts are available for this role in the current league workspace.
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting || !selectedEmail || !selectedRole}
                    className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm font-medium transition hover:border-[var(--brand-structure)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      color: "var(--foreground)",
                      backgroundColor: "var(--brand-surface-card)",
                    }}
                    data-testid="login-demo-submit"
                  >
                    {isSubmitting ? "Signing In..." : "Use Demo Identity"}
                  </button>
                </div>

                {selectedIdentity ? (
                  <p
                    className="text-xs"
                    style={{ color: "var(--shell-text-muted)" }}
                    data-testid="login-selection-summary"
                  >
                    Selected: {selectedIdentity.name ?? selectedIdentity.email} as{" "}
                    {identityLabel(selectedIdentity)}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      ) : null}

      {activeEmail ? (
        <p className="text-xs" style={{ color: "var(--shell-text-muted)" }} data-testid="login-active-email">
          Current session email: {activeEmail}
        </p>
      ) : null}

      {/* Magic Link Error State - Show prominently if present */}
      {errorDetails ? (
        <div
          className="rounded-lg border border-red-600/30 p-6"
          style={{ backgroundColor: "var(--brand-error-surface)", borderColor: "var(--brand-error-border)" }}
          data-testid="login-magic-link-error-state"
        >
          <div className="space-y-4">
            {/* Error icon and title */}
            <div className="flex items-start gap-3">
              <div 
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--brand-error-soft)" }}
              >
                <svg className="h-6 w-6" style={{ color: "var(--brand-error-primary)" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              
              <div className="space-y-1">
                <p className="text-lg font-semibold" style={{ color: "var(--brand-error-primary)" }}>
                  {errorDetails.title}
                </p>
                <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
                  {errorDetails.message}
                </p>
              </div>
            </div>

            {/* Recovery Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {errorDetails.recoveryAction === "resend" ? (
                <>
                  <button
                    type="button"
                    onClick={handleQuickRecovery}
                    disabled={isSubmitting}
                    className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="login-error-resend"
                  >
                    {isSubmitting ? "Sending..." : "Send New Link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    disabled={isSubmitting}
                    className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      color: "var(--shell-text-secondary)",
                    }}
                    data-testid="login-error-change-email"
                  >
                    Use Different Email
                  </button>
                </>
              ) : errorDetails.recoveryAction === "request_new" ? (
                <>
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    disabled={isSubmitting}
                    className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="login-error-start-over"
                  >
                    Request New Sign-In Link
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  disabled={isSubmitting}
                  className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="login-error-try-again"
                >
                  Try Signing In Again
                </button>
              )}
              
              <Link
                href={returnTo}
                className="text-sm underline decoration-dotted underline-offset-4 transition"
                style={{
                  color: "var(--shell-text-secondary)",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.color = "var(--foreground)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.color = "var(--shell-text-secondary)";
                }}
              >
                {returnTo === "/" ? "Back to home" : "Back to app"}
              </Link>
            </div>
            
            {/* Help text for specific error types */}
            {errorDetails.recoveryAction === "resend" && (
              <div 
                className="rounded-md border border-[var(--brand-structure-muted)] p-3 text-xs"
                style={{ backgroundColor: "var(--brand-surface-card)" }}
              >
                <p className="font-medium" style={{ color: "var(--foreground)" }}>Need a fresh link?</p>
                <p style={{ color: "var(--shell-text-muted)" }}>
                  Click "Send New Link" to get a new sign-in link sent to the same email address, 
                  or choose "Use Different Email" to sign in with a different account.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-700/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
