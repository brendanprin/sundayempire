import Link from "next/link";
import { AUTH_PLATFORM_INVITE_TOKEN_PARAM } from "@/lib/auth-constants";
import { getAuthenticatedUser } from "@/lib/auth";
import { createPlatformInviteService } from "@/lib/domain/auth/PlatformInviteService";
import { prisma } from "@/lib/prisma";
import { buildJoinPath, buildLoginPath } from "@/lib/return-to";
import { JoinAcceptancePanel } from "./join-acceptance-panel";

type JoinPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  return typeof value === "string" ? value.trim() : null;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const resolvedParams = await searchParams;
  const token = readParam(resolvedParams, AUTH_PLATFORM_INVITE_TOKEN_PARAM) ?? "";

  const joinPath = token ? buildJoinPath({ token }) : "/join";

  const [user, landingState] = await Promise.all([
    getAuthenticatedUser(),
    token
      ? createPlatformInviteService(prisma).getInviteLandingState(token)
      : Promise.resolve({ status: "invalid" as const, invite: null }),
  ]);

  const currentEmail = user?.email?.trim().toLowerCase() ?? null;
  const invitedEmail = landingState.invite?.email ?? null;
  const emailMatchesInvite = currentEmail && invitedEmail
    ? currentEmail === invitedEmail
    : false;

  const headingText = {
    pending: "You've been invited",
    accepted: "Invitation accepted",
    expired: "Invitation expired",
    revoked: "Invitation revoked",
    invalid: "Invitation not found",
  }[landingState.status];

  return (
    <section className="space-y-6" data-testid="join-page">
      <header className="space-y-2">
        <p
          className="text-xs uppercase tracking-[0.2em]"
          style={{ color: "var(--muted-foreground)" }}
        >
          Platform Invitation
        </p>
        <h2
          className="text-2xl font-semibold"
          style={{ color: "var(--foreground)" }}
          data-testid="join-status-heading"
        >
          {headingText}
        </h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {landingState.status === "pending"
            ? "Sign in with the invited email, then activate your account."
            : "This invite link can no longer be used."}
        </p>
      </header>

      {/* Invite detail card */}
      {landingState.invite ? (
        <div
          className="space-y-2 rounded-lg border p-4"
          style={{
            backgroundColor: "var(--brand-surface-muted)",
            borderColor: "var(--brand-structure-muted)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">Invited email:</span>{" "}
            {landingState.invite.email}
          </p>
          {landingState.invite.invitedByUser ? (
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              <span className="font-semibold">Invited by:</span>{" "}
              {landingState.invite.invitedByUser.name ?? landingState.invite.invitedByUser.email}
            </p>
          ) : null}
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {landingState.status === "pending"
              ? `Expires ${landingState.invite.expiresAt.toLocaleString()}`
              : landingState.status === "expired"
              ? `Expired ${landingState.invite.expiresAt.toLocaleString()}`
              : null}
          </p>
        </div>
      ) : null}

      {/* Not signed in — prompt to sign in */}
      {landingState.status === "pending" && !user ? (
        <div
          className="space-y-3 rounded-lg border p-4"
          style={{
            backgroundColor: "var(--brand-surface-muted)",
            borderColor: "var(--brand-structure-muted)",
          }}
          data-testid="join-sign-in-panel"
        >
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Sign in with the invited email to verify your identity before activating your account.
          </p>
          <Link
            href={buildLoginPath({ returnTo: joinPath })}
            className="inline-flex rounded-md px-4 py-2 text-sm font-medium transition"
            style={{
              backgroundColor: "var(--brand-accent-primary)",
              color: "var(--brand-midnight-navy)",
            }}
            data-testid="join-sign-in-link"
          >
            Continue to Sign In
          </Link>
        </div>
      ) : null}

      {/* Signed in but wrong account */}
      {landingState.status === "pending" && user && !emailMatchesInvite ? (
        <div
          className="space-y-3 rounded-lg border border-amber-700/60 bg-amber-950/20 p-4"
          data-testid="join-email-mismatch-panel"
        >
          <p className="text-sm text-amber-100">
            This invite was sent to {landingState.invite?.email}, but you are signed in as{" "}
            {user.email}.
          </p>
          <p className="text-sm text-amber-200/80">
            Switch to the invited account to accept this invitation.
          </p>
          <Link
            href={buildLoginPath({ returnTo: joinPath, switchSession: true })}
            className="inline-flex rounded-md border border-amber-500/70 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-300"
            data-testid="join-switch-account-link"
          >
            Switch Account
          </Link>
        </div>
      ) : null}

      {/* Signed in, email matches — ready to accept */}
      {landingState.status === "pending" && user && emailMatchesInvite ? (
        <div className="space-y-3">
          <p
            className="text-sm"
            style={{ color: "var(--muted-foreground)" }}
            data-testid="join-authenticated-email"
          >
            Signed in as {user.email}
          </p>
          <JoinAcceptancePanel token={token} />
        </div>
      ) : null}

      {/* Already accepted */}
      {landingState.status === "accepted" ? (
        <div
          className="space-y-3 rounded-lg border border-emerald-700/40 px-4 py-4 text-sm"
          style={{ backgroundColor: "rgba(5, 46, 22, 0.35)", color: "rgb(209, 250, 229)" }}
          data-testid="join-accepted-panel"
        >
          <p>This invitation has already been accepted.</p>
          <Link
            href="/my-leagues"
            className="inline-flex rounded-md border border-emerald-500/70 px-4 py-2 text-sm transition hover:border-emerald-300"
          >
            Go to My Leagues
          </Link>
        </div>
      ) : null}

      {landingState.status === "expired" ? (
        <div
          className="rounded-lg border border-red-700/60 bg-red-950/20 px-4 py-4 text-sm text-red-100"
          data-testid="join-expired-panel"
        >
          This invitation expired before it was accepted. Ask the person who invited you to send a
          fresh one.
        </div>
      ) : null}

      {landingState.status === "revoked" ? (
        <div
          className="rounded-lg border border-red-700/60 bg-red-950/20 px-4 py-4 text-sm text-red-100"
          data-testid="join-revoked-panel"
        >
          This invitation was revoked and is no longer valid.
        </div>
      ) : null}

      {landingState.status === "invalid" ? (
        <div
          className="rounded-lg border border-red-700/60 bg-red-950/20 px-4 py-4 text-sm text-red-100"
          data-testid="join-invalid-panel"
        >
          This invitation link is invalid or incomplete.
        </div>
      ) : null}

      <Link
        href="/"
        className="text-sm underline decoration-dotted underline-offset-4 transition"
        style={{ color: "var(--muted-foreground)" }}
      >
        Back to home
      </Link>
    </section>
  );
}
