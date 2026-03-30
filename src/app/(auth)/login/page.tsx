"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
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
} from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

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
        title: "Account Not Found",
        message: "We couldn't find an account associated with this email address.",
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
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ReturnType<typeof buildLoginErrorMessage>>(null);
  const [returnTo, setReturnTo] = useState("/");
  const [switchRequested, setSwitchRequested] = useState(false);
  const loginOpenedAtRef = useRef(Date.now());
  const loginViewedTrackedRef = useRef(false);

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

  function handleRetrySubmission() {
    setError(null);
    setErrorDetails(null);
    setRequestedEmail(null);
  }

  const showSignInForm = !requestedEmail;
  const showSuccessMessage = !showSignInForm;

  return (
    <div className="flex min-h-full flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Link href="/" className="inline-block">
              <img
                alt="Dynasty Football"
                src="/brand/dynasty-logo-mark.png"
                className="h-10 w-auto"
              />
            </Link>
            <h2 className="mt-8 text-2xl font-bold leading-9 tracking-tight" style={{ color: "var(--foreground)" }}>
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--shell-text-secondary)" }}>
              New to Dynasty Football?{" "}
              <Link
                href="/"
                className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Get an invite to a league
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
              Magic-link authentication • No passwords needed • Works for new and returning users
            </p>
          </div>
        </div>
      </div>

      {/* Background pattern */}
      <div className="relative hidden w-0 flex-1 lg:block">
        <img
          alt="Dynasty Football Background"
          src="/brand/dynasty-login-background.jpg"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-purple-900/30"></div>
      </div>
    </div>
  );
}
