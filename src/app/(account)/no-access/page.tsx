"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { buildLoginPath, LOGIN_ERROR_SESSION_EXPIRED } from "@/lib/return-to";

function parseInviteToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (token.length > 0) return token;
  } catch {
    // Not a URL — treat as a raw token
  }

  return trimmed;
}

export default function NoAccessPage() {
  const router = useRouter();
  const [inviteValue, setInviteValue] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  function handleJoinLeague() {
    const token = parseInviteToken(inviteValue);
    if (!token) {
      setInviteError("Paste a valid invite link or token.");
      return;
    }

    setInviteError(null);
    router.push(`/invite?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent("/my-leagues")}`);
  }

  function handleSignOut() {
    requestJson("/api/auth/session", { method: "DELETE" }, "Sign out failed.")
      .then(() => {
        window.location.assign("/");
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.code === "AUTH_REQUIRED") {
          window.location.assign(buildLoginPath({ error: LOGIN_ERROR_SESSION_EXPIRED }));
          return;
        }
        window.location.assign("/");
      });
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ backgroundColor: "var(--background)" }}>
      <div className="mx-auto max-w-lg">
        <div className="space-y-8" data-testid="no-access-page">
          <header className="text-center space-y-3">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              SundayEmpire
            </p>
            <h1 className="text-3xl font-bold" style={{ color: "var(--foreground)" }}>
              No League Access
            </h1>
            <p className="text-lg max-w-sm mx-auto" style={{ color: "var(--muted-foreground)" }}>
              You&apos;re signed in, but you don&apos;t currently have access to any leagues.
            </p>
          </header>

          <div
            className="rounded-xl border p-8 space-y-6"
            style={{
              borderColor: "var(--brand-structure-muted)",
              backgroundColor: "var(--brand-surface-elevated)",
            }}
          >
            {/* Join with invite */}
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  Join with an invite
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Paste the invite link your commissioner sent you.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteValue}
                  onChange={(e) => {
                    setInviteValue(e.target.value);
                    setInviteError(null);
                  }}
                  placeholder="Paste invite link or token"
                  className="flex-1 rounded-lg border bg-transparent px-3 py-2.5 text-sm transition-colors focus:ring-2 focus:ring-[var(--brand-accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                  style={{
                    borderColor: inviteError ? "var(--destructive)" : "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  data-testid="invite-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinLeague();
                  }}
                />
                <button
                  type="button"
                  onClick={handleJoinLeague}
                  className="rounded-lg bg-[var(--brand-accent-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                  data-testid="join-league-button"
                >
                  Join League
                </button>
              </div>
              {inviteError ? (
                <p className="text-xs" style={{ color: "var(--destructive)" }} data-testid="invite-error">
                  {inviteError}
                </p>
              ) : null}
            </div>

            <div
              className="border-t"
              style={{ borderColor: "var(--brand-structure-muted)" }}
            />

            {/* Contact commissioner */}
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Contact your commissioner
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                If you were previously in a league, reach out to your commissioner to have your access restored or to receive a new invite.
              </p>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-center gap-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <Link
              href="/"
              className="transition hover:opacity-80"
              style={{ color: "var(--brand-accent-primary)" }}
              data-testid="return-home-link"
            >
              Return home
            </Link>
            <span>·</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="transition hover:opacity-80"
              style={{ color: "var(--muted-foreground)" }}
              data-testid="sign-out-button"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
