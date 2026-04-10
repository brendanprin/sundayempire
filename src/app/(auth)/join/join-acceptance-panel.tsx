"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJson } from "@/lib/client-request";

type AcceptInviteResponse = {
  ok: boolean;
  redirectTo: string;
};

export function JoinAcceptancePanel({ token }: { token: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptInvite() {
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = await requestJson<AcceptInviteResponse>(
        "/api/platform/invites/accept",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        },
        "Could not accept the invitation.",
      );

      router.push(payload.redirectTo);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not accept the invitation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="space-y-4 rounded-lg border p-4"
      style={{
        backgroundColor: "var(--brand-surface-muted)",
        borderColor: "var(--brand-structure-muted)",
      }}
    >
      <div className="space-y-1">
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Accept and activate your account
        </h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Your identity is confirmed. Click below to activate your SundayEmpire account.
        </p>
      </div>

      <button
        type="button"
        onClick={() => { void acceptInvite(); }}
        disabled={isSubmitting}
        className="rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: "var(--brand-accent-primary)",
          color: "var(--brand-midnight-navy)",
        }}
        data-testid="join-accept-button"
      >
        {isSubmitting ? "Activating..." : "Activate Account"}
      </button>

      {error ? (
        <div
          className="rounded-md border border-red-700/70 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          data-testid="join-accept-error"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
