"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJson } from "@/lib/client-request";

type AcceptInviteResponse = {
  redirectTo: string;
};

type InviteAcceptancePanelProps = {
  token: string;
  returnTo: string | null;
  leagueName: string;
  teamName: string | null;
};

export function InviteAcceptancePanel({
  token,
  returnTo,
  leagueName,
  teamName,
}: InviteAcceptancePanelProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptInvite() {
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = await requestJson<AcceptInviteResponse>(
        "/api/league/invites/accept",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            token,
            returnTo,
          }),
        },
        "Could not accept the invitation.",
      );

      router.push(payload.redirectTo);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not accept the invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--brand-structure-muted)] p-4" style={{ backgroundColor: "var(--brand-surface-muted)" }}>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Accept Invitation
        </h3>
        <p className="text-sm" style={{ color: "var(--shell-text-secondary)" }}>
          Join {leagueName}
          {teamName ? ` as ${teamName}` : ""} with your authenticated email.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          void acceptInvite();
        }}
        disabled={isSubmitting}
        className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="invite-accept-button"
      >
        {isSubmitting ? "Accepting..." : "Accept Invitation"}
      </button>

      {error ? (
        <div
          className="rounded-md border border-red-700/70 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          data-testid="invite-accept-error"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
