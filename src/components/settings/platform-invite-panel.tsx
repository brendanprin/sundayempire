"use client";

import { useEffect, useState } from "react";
import { requestJson, ApiRequestError } from "@/lib/client-request";

type InviteDeliveryState = "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown";

type SentInvite = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  canResend: boolean;
  canRevoke: boolean;
  delivery: {
    state: InviteDeliveryState;
    label: string;
    detail: string;
    attemptedAt: string | null;
    canRetry: boolean;
    inviteStillValid: boolean;
  } | null;
};

function statusBadgeClass(status: SentInvite["status"]) {
  switch (status) {
    case "accepted": return "border-emerald-700/60 bg-emerald-950/30 text-emerald-200";
    case "expired": return "border-amber-700/60 bg-amber-950/30 text-amber-200";
    case "revoked": return "border-slate-700/60 bg-slate-900/70 text-slate-400";
    default: return "border-sky-700/60 bg-sky-950/30 text-sky-200";
  }
}

function deliveryBadgeClass(state: InviteDeliveryState) {
  switch (state) {
    case "sent": return "border-emerald-700/60 bg-emerald-950/20 text-emerald-200";
    case "captured": return "border-amber-700/60 bg-amber-950/20 text-amber-200";
    case "logged": return "border-slate-700/60 bg-slate-900/70 text-slate-300";
    case "failed": return "border-red-700/60 bg-red-950/20 text-red-200";
    case "not_configured": return "border-blue-700/60 bg-blue-950/20 text-blue-200";
    default: return "border-slate-700/60 bg-slate-900/70 text-slate-300";
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PlatformInvitePanel() {
  const [invites, setInvites] = useState<SentInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadInvites();
  }, []);

  useEffect(() => {
    if (!sendSuccess) return;
    const timer = setTimeout(() => setSendSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [sendSuccess]);

  async function loadInvites() {
    try {
      const data = await requestJson<{ invites: SentInvite[] }>(
        "/api/platform/invites",
        { cache: "no-store" },
      );
      setInvites(data.invites);
    } catch {
      // Non-fatal — just show empty state
    } finally {
      setLoading(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendSuccess(null);
    setSending(true);

    try {
      const data = await requestJson<{ invite: SentInvite }>(
        "/api/platform/invites",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        },
        "Could not send the invitation.",
      );
      setInvites((prev) => [data.invite, ...prev]);
      setSendSuccess(`Invitation sent to ${data.invite.email}.`);
      setEmail("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send the invitation.");
    } finally {
      setSending(false);
    }
  }

  async function revokeInvite(invite: SentInvite) {
    const key = `revoke:${invite.id}`;
    setBusyAction(key);
    setActionError(null);
    try {
      await requestJson(
        `/api/platform/invites/${invite.id}/revoke`,
        { method: "POST" },
        "Could not revoke the invitation.",
      );
      setInvites((prev) =>
        prev.map((i) => (i.id === invite.id ? { ...i, status: "revoked" as const, canRevoke: false, canResend: true } : i)),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not revoke the invitation.");
    } finally {
      setBusyAction(null);
    }
  }

  async function resendInvite(invite: SentInvite) {
    const key = `resend:${invite.id}`;
    setBusyAction(key);
    setActionError(null);
    try {
      const data = await requestJson<{ invite: { id: string; email: string; expiresAt: string } }>(
        `/api/platform/invites/${invite.id}/resend`,
        { method: "POST" },
        "Could not resend the invitation.",
      );
      await loadInvites();
      setSendSuccess(`Invitation resent to ${data.invite.email}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not resend the invitation.");
    } finally {
      setBusyAction(null);
    }
  }

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const otherInvites = invites.filter((i) => i.status !== "pending");

  return (
    <section
      className="rounded-2xl border p-5 lg:p-6 space-y-5"
      style={{
        borderColor: "var(--brand-structure-muted)",
        backgroundColor: "var(--brand-surface-elevated)",
      }}
      data-testid="platform-invite-panel"
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--muted-foreground)" }}>
          Account
        </p>
        <h3 className="mt-1 text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          Invite someone to SundayEmpire
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          SundayEmpire is invite-only. Send a platform invite to give someone access before adding
          them to a league.
        </p>
      </div>

      {/* Send form */}
      <form onSubmit={(e) => { void sendInvite(e); }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label
            htmlFor="invite-email"
            className="text-xs font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
            style={{
              backgroundColor: "var(--brand-surface-muted)",
              borderColor: "var(--brand-structure-muted)",
              color: "var(--foreground)",
            }}
            data-testid="invite-email-input"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--brand-accent-primary)",
            color: "var(--brand-midnight-navy)",
          }}
          data-testid="invite-send-button"
        >
          {sending ? "Sending..." : "Send Invite"}
        </button>
      </form>

      {sendSuccess ? (
        <p className="text-sm text-emerald-300" data-testid="invite-send-success">{sendSuccess}</p>
      ) : null}
      {sendError ? (
        <p className="text-sm text-red-300" data-testid="invite-send-error">{sendError}</p>
      ) : null}
      {actionError ? (
        <p className="text-sm text-red-300" data-testid="invite-action-error">{actionError}</p>
      ) : null}

      {/* Invite list */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading invites…</p>
      ) : invites.length === 0 ? (
        <p
          className="rounded-lg border border-dashed px-4 py-4 text-sm"
          style={{ borderColor: "var(--brand-structure-muted)", color: "var(--muted-foreground)" }}
        >
          No platform invites sent yet.
        </p>
      ) : (
        <div className="space-y-4">
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--muted-foreground)" }}>
                Pending ({pendingInvites.length})
              </p>
              {pendingInvites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  busyAction={busyAction}
                  onRevoke={revokeInvite}
                  onResend={resendInvite}
                />
              ))}
            </div>
          )}

          {otherInvites.length > 0 && (
            <details className="group">
              <summary
                className="cursor-pointer text-[11px] uppercase tracking-[0.2em] select-none"
                style={{ color: "var(--muted-foreground)" }}
              >
                History ({otherInvites.length})
              </summary>
              <div className="mt-2 space-y-2">
                {otherInvites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    busyAction={busyAction}
                    onRevoke={revokeInvite}
                    onResend={resendInvite}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function InviteRow({
  invite,
  busyAction,
  onRevoke,
  onResend,
}: {
  invite: SentInvite;
  busyAction: string | null;
  onRevoke: (invite: SentInvite) => void;
  onResend: (invite: SentInvite) => void;
}) {
  const anyBusy = busyAction !== null;
  const revokeBusy = busyAction === `revoke:${invite.id}`;
  const resendBusy = busyAction === `resend:${invite.id}`;

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-3"
      style={{
        backgroundColor: "var(--brand-surface-muted)",
        borderColor: "var(--brand-structure-muted)",
      }}
      data-testid="platform-invite-row"
    >
      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
            {invite.email}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(invite.status)}`}>
            {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
          </span>
        </div>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {invite.status === "pending"
            ? `Expires ${formatDate(invite.expiresAt)}`
            : invite.status === "accepted" && invite.acceptedAt
            ? `Accepted ${formatDate(invite.acceptedAt)}`
            : invite.status === "expired"
            ? `Expired ${formatDate(invite.expiresAt)}`
            : invite.revokedAt
            ? `Revoked ${formatDate(invite.revokedAt)}`
            : `Sent ${formatDate(invite.createdAt)}`}
        </p>
        {invite.delivery ? (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${deliveryBadgeClass(invite.delivery.state)}`}>
            {invite.delivery.label}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {invite.canResend ? (
          <button
            type="button"
            onClick={() => onResend(invite)}
            disabled={anyBusy}
            className="rounded border px-2.5 py-1 text-xs disabled:opacity-50"
            style={{ borderColor: "var(--brand-structure-muted)", color: "var(--foreground)" }}
            data-testid="platform-invite-resend"
          >
            {resendBusy ? "…" : "Resend"}
          </button>
        ) : null}
        {invite.canRevoke ? (
          <button
            type="button"
            onClick={() => onRevoke(invite)}
            disabled={anyBusy}
            className="rounded border border-red-800/70 px-2.5 py-1 text-xs text-red-300 disabled:opacity-50"
            data-testid="platform-invite-revoke"
          >
            {revokeBusy ? "…" : "Revoke"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
