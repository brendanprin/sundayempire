import Link from "next/link";
import { AUTH_INVITE_TOKEN_PARAM } from "@/lib/auth-constants";
import { getAuthenticatedUser } from "@/lib/auth";
import { createLeagueInviteService } from "@/lib/domain/auth/LeagueInviteService";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";
import {
  buildInvitePath,
  buildLoginPath,
  normalizeReturnTo,
  RETURN_TO_PARAM,
} from "@/lib/return-to";
import { InviteAcceptancePanel } from "./invite-acceptance-panel";

type InvitePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return typeof value === "string" ? value : null;
}

function formatLeagueRole(role: "COMMISSIONER" | "MEMBER") {
  if (role === "COMMISSIONER") {
    return "Commissioner";
  }
  return "Member";
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const resolvedSearchParams = await searchParams;
  const token = readSearchParam(resolvedSearchParams, AUTH_INVITE_TOKEN_PARAM)?.trim() ?? "";
  const returnTo = normalizeReturnTo(readSearchParam(resolvedSearchParams, RETURN_TO_PARAM));
  const invitePath = token
    ? buildInvitePath({
        token,
        returnTo,
      })
    : "/invite";
  const [user, landingState] = await Promise.all([
    getAuthenticatedUser(),
    token
      ? createLeagueInviteService(prisma).getInviteLandingState(token)
      : Promise.resolve({
          status: "invalid" as const,
          invite: null,
        }),
  ]);

  const invite = landingState.invite;
  const currentEmail = user?.email?.trim().toLowerCase() ?? null;
  const invitedEmail = invite?.email ?? null;
  const emailMatchesInvite = currentEmail && invitedEmail ? currentEmail === invitedEmail : false;

  return (
    <section className="space-y-6" data-testid="invite-page">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--shell-text-muted)" }}>
          League Invite
        </p>
        <h2 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }} data-testid="invite-status-heading">
          {landingState.status === "pending"
            ? "Join League"
            : landingState.status === "accepted"
              ? "Invitation Accepted"
              : landingState.status === "expired"
                ? "Invitation Expired"
                : landingState.status === "revoked"
                  ? "Invitation Revoked"
                  : "Invitation Not Found"}
        </h2>
        <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
          {landingState.status === "pending"
            ? "Authenticate as the invited email, then bind access to the intended league workspace."
            : "This invite link can no longer be used for onboarding."}
        </p>
      </header>

      {invite ? (
        <div className="space-y-2 rounded-lg border border-[var(--brand-structure-muted)] p-4" style={{ backgroundColor: "var(--brand-surface-muted)" }}>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">League:</span> {invite.league.name}
          </p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">League Role:</span>{" "}
            {formatLeagueRole(toCanonicalLeagueRole(invite.intendedRole))}
          </p>
          {invite.team ? (
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              <span className="font-semibold">Team:</span> {invite.team.name}
            </p>
          ) : null}
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">Invited Email:</span> {invite.email}
          </p>
          <p className="text-xs" style={{ color: "var(--shell-text-muted)" }}>
            Expires {invite.expiresAt.toLocaleString()}.
          </p>
        </div>
      ) : null}

      {landingState.status === "pending" && !user ? (
        <div className="space-y-3 rounded-lg border border-[var(--brand-structure-muted)] p-4" style={{ backgroundColor: "var(--brand-surface-muted)" }} data-testid="invite-sign-in-panel">
          <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
            Continue with the invited email to verify your identity before joining the league.
          </p>
          <Link
            href={buildLoginPath({
              returnTo: invitePath,
            })}
            className="inline-flex rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
            data-testid="invite-sign-in-link"
          >
            Continue to Sign In
          </Link>
        </div>
      ) : null}

      {landingState.status === "pending" && user && !emailMatchesInvite ? (
        <div className="space-y-3 rounded-lg border border-amber-700/60 bg-amber-950/20 p-4" data-testid="invite-email-mismatch-panel">
          <p className="text-sm text-amber-100">
            This invite was sent to {invite?.email}, but you are signed in as {user.email}.
          </p>
          <p className="text-sm text-amber-200">
            Switch to the invited account to accept this league membership safely.
          </p>
          <Link
            href={buildLoginPath({
              returnTo: invitePath,
              switchSession: true,
            })}
            className="inline-flex rounded-md border border-amber-500/70 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-300"
            data-testid="invite-switch-account-link"
          >
            Switch Account
          </Link>
        </div>
      ) : null}

      {landingState.status === "pending" && user && emailMatchesInvite ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }} data-testid="invite-authenticated-email">
            Signed in as {user.email}
          </p>
          <InviteAcceptancePanel
            token={token}
            returnTo={returnTo}
            leagueName={invite?.league.name ?? "your league"}
            teamName={invite?.team?.name ?? null}
          />
        </div>
      ) : null}

      {landingState.status === "accepted" && invite ? (
        <div className="space-y-3 rounded-lg border border-emerald-700/40 px-4 py-4 text-sm" style={{ backgroundColor: "rgba(5, 46, 22, 0.35)", color: "rgb(209, 250, 229)" }} data-testid="invite-accepted-panel">
          <p>This invitation has already been accepted.</p>
          <Link
            href={`/league/${invite.leagueId}`}
            className="inline-flex rounded-md border border-emerald-500/70 px-4 py-2 text-sm transition hover:border-emerald-300"
          >
            Open League
          </Link>
        </div>
      ) : null}

      {landingState.status === "expired" ? (
        <div className="rounded-lg border border-red-700/60 bg-red-950/20 px-4 py-4 text-sm text-red-100" data-testid="invite-expired-panel">
          This invitation expired before it was accepted. Ask your commissioner to send a fresh invite.
        </div>
      ) : null}

      {landingState.status === "revoked" ? (
        <div className="rounded-lg border border-red-700/60 bg-red-950/20 px-4 py-4 text-sm text-red-100" data-testid="invite-revoked-panel">
          This invitation was revoked and is no longer valid.
        </div>
      ) : null}

      {landingState.status === "invalid" ? (
        <div className="rounded-lg border border-red-700/60 bg-red-950/20 px-4 py-4 text-sm text-red-100" data-testid="invite-invalid-panel">
          This invitation link is invalid or incomplete.
        </div>
      ) : null}

      <Link
        href="/"
        className="text-sm underline decoration-dotted underline-offset-4 transition"
        style={{ color: "var(--shell-text-secondary)" }}
      >
        Back to app
      </Link>
    </section>
  );
}
