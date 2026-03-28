"use client";

export type CommissionerInviteRow = {
  id: string;
  email: string;
  intendedRole: "COMMISSIONER" | "MEMBER";
  intendedLeagueRole: "COMMISSIONER" | "MEMBER";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  canResend: boolean;
  canRevoke: boolean;
  team: {
    id: string;
    name: string;
  } | null;
  owner: {
    id: string;
    name: string;
    email: string | null;
    userId: string | null;
  } | null;
  invitedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  delivery: {
    state: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown";
    label: string;
    detail: string;
    attemptedAt: string | null;
    canRetry: boolean;
    inviteStillValid: boolean;
  } | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusBadgeClasses(status: CommissionerInviteRow["status"]) {
  switch (status) {
    case "accepted":
      return "border-emerald-700/60 bg-emerald-950/30 text-emerald-200";
    case "expired":
      return "border-amber-700/60 bg-amber-950/30 text-amber-200";
    case "revoked":
      return "border-slate-700/60 bg-slate-900/70 text-slate-300";
    case "pending":
    default:
      return "border-sky-700/60 bg-sky-950/30 text-sky-200";
  }
}

function getStatusLabel(status: CommissionerInviteRow["status"]) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "pending":
    default:
      return "Pending";
  }
}

function formatIntendedLeagueRole(role: CommissionerInviteRow["intendedLeagueRole"]) {
  return role === "COMMISSIONER" ? "Commissioner" : "Member";
}

function getDeliveryBadgeClasses(
  state: NonNullable<CommissionerInviteRow["delivery"]>["state"],
) {
  switch (state) {
    case "sent":
      return "border-emerald-700/60 bg-emerald-950/20 text-emerald-200";
    case "captured":
      return "border-amber-700/60 bg-amber-950/20 text-amber-200";
    case "logged":
      return "border-slate-700/60 bg-slate-900/70 text-slate-300";
    case "failed":
      return "border-red-700/60 bg-red-950/20 text-red-200";
    case "not_configured":
      return "border-orange-700/60 bg-orange-950/20 text-orange-200";
    case "unknown":
    default:
      return "border-slate-700/60 bg-slate-900/70 text-slate-300";
  }
}

function buildInviteTimestampLine(invite: CommissionerInviteRow) {
  const createdAt = formatDateTime(invite.createdAt);
  const expiresAt = formatDateTime(invite.expiresAt);
  const acceptedAt = formatDateTime(invite.acceptedAt);
  const revokedAt = formatDateTime(invite.revokedAt);

  if (invite.status === "accepted") {
    return `Created ${createdAt} · Accepted ${acceptedAt ?? "Unknown"}${
      expiresAt ? ` · Original expiry ${expiresAt}` : ""
    }`;
  }

  if (invite.status === "revoked") {
    return `Created ${createdAt} · Revoked ${revokedAt ?? "Unknown"}${
      expiresAt ? ` · Original expiry ${expiresAt}` : ""
    }`;
  }

  if (invite.status === "expired") {
    return `Created ${createdAt} · Expired ${expiresAt ?? "Unknown"}`;
  }

  return `Created ${createdAt} · Expires ${expiresAt ?? "Unknown"}`;
}

function InviteRow(props: {
  invite: CommissionerInviteRow;
  busyAction: string | null;
  copyFreshLinkEnabled: boolean;
  onResend: (invite: CommissionerInviteRow) => void;
  onRevoke: (invite: CommissionerInviteRow) => void;
  onCopyFreshLink: (invite: CommissionerInviteRow) => void;
}) {
  const resendBusy = props.busyAction === `invite:resend:${props.invite.id}`;
  const revokeBusy = props.busyAction === `invite:revoke:${props.invite.id}`;
  const copyBusy = props.busyAction === `invite:copy:${props.invite.id}`;
  const anyBusy = props.busyAction !== null;

  return (
    <article
      className="rounded-lg border border-slate-800 bg-slate-950/70 p-4"
      data-testid="workspace-invite-row"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-100" data-testid="workspace-invite-email">
              {props.invite.email}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClasses(
                props.invite.status,
              )}`}
              data-testid="workspace-invite-status"
            >
              {getStatusLabel(props.invite.status)}
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
              {formatIntendedLeagueRole(props.invite.intendedLeagueRole)}
            </span>
          </div>
          <p className="text-xs text-slate-300">
            {props.invite.team ? `Team: ${props.invite.team.name}` : "League-level invite"}
            {props.invite.owner ? ` · Team owner profile: ${props.invite.owner.name}` : ""}
          </p>
          <p className="text-xs text-slate-400">{buildInviteTimestampLine(props.invite)}</p>
          {props.invite.invitedByUser ? (
            <p className="text-xs text-slate-500">
              Sent by {props.invite.invitedByUser.name ?? props.invite.invitedByUser.email}
            </p>
          ) : null}
          {props.invite.delivery ? (
            <div className="space-y-1 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getDeliveryBadgeClasses(
                    props.invite.delivery.state,
                  )}`}
                  data-testid="workspace-invite-delivery-badge"
                >
                  {props.invite.delivery.label}
                </span>
                {props.invite.delivery.attemptedAt ? (
                  <span className="text-[11px] text-slate-500" data-testid="workspace-invite-delivery-attempted-at">
                    Last attempt {formatDateTime(props.invite.delivery.attemptedAt)}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-300" data-testid="workspace-invite-delivery-detail">
                {props.invite.delivery.detail}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {props.invite.canResend ? (
            <button
              type="button"
              data-testid="workspace-invite-resend"
              onClick={() => props.onResend(props.invite)}
              disabled={anyBusy}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
            >
              {resendBusy ? "Resending..." : "Resend"}
            </button>
          ) : null}
          {props.copyFreshLinkEnabled && props.invite.canResend ? (
            <button
              type="button"
              data-testid="workspace-invite-copy-link"
              onClick={() => props.onCopyFreshLink(props.invite)}
              disabled={anyBusy}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
            >
              {copyBusy ? "Copying..." : "Copy Fresh Link"}
            </button>
          ) : null}
          {props.invite.canRevoke ? (
            <button
              type="button"
              data-testid="workspace-invite-revoke"
              onClick={() => props.onRevoke(props.invite)}
              disabled={anyBusy}
              className="rounded-md border border-red-800/70 px-3 py-1.5 text-xs text-red-200 disabled:opacity-50"
            >
              {revokeBusy ? "Revoking..." : "Revoke"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function InviteManagementPanel(props: {
  invites: CommissionerInviteRow[];
  copyFreshLinkEnabled: boolean;
  busyAction: string | null;
  onResend: (invite: CommissionerInviteRow) => void;
  onRevoke: (invite: CommissionerInviteRow) => void;
  onCopyFreshLink: (invite: CommissionerInviteRow) => void;
}) {
  const pendingInvites = props.invites.filter((invite) => invite.status === "pending");
  const historyInvites = props.invites.filter((invite) => invite.status !== "pending");
  const hasCapturedDelivery = props.invites.some((invite) => invite.delivery?.state === "captured");
  const hasNotConfiguredDelivery = props.invites.some(
    (invite) => invite.delivery?.state === "not_configured",
  );
  const hasFailedDelivery = props.invites.some((invite) => invite.delivery?.state === "failed");

  return (
    <section
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-950 p-4"
      data-testid="workspace-invite-management"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">Invite Management</h4>
          <p className="mt-1 text-xs text-slate-400">
            Track current invites, resend expired links, and revoke pending access before it is accepted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
          <span className="rounded-full border border-slate-700 px-2 py-0.5">
            Pending {pendingInvites.length}
          </span>
          <span className="rounded-full border border-slate-700 px-2 py-0.5">
            History {historyInvites.length}
          </span>
        </div>
      </div>

      {props.copyFreshLinkEnabled ? (
        <p className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
          Copy Fresh Link is available only in local or explicitly gated support environments.
        </p>
      ) : null}
      {hasCapturedDelivery ? (
        <p
          className="rounded-md border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-100"
          data-testid="workspace-invite-capture-note"
        >
          Test capture is active in this environment. Invite rows marked "Test capture active" did not send real email.
        </p>
      ) : null}
      {hasNotConfiguredDelivery ? (
        <p
          className="rounded-md border border-orange-800/60 bg-orange-950/20 px-3 py-2 text-xs text-orange-100"
          data-testid="workspace-invite-delivery-unavailable-note"
        >
          Outbound invite email is not configured in this environment. Pending invites remain valid, and commissioners can resend after delivery is fixed.
        </p>
      ) : null}
      {hasFailedDelivery ? (
        <p
          className="rounded-md border border-red-800/60 bg-red-950/20 px-3 py-2 text-xs text-red-100"
          data-testid="workspace-invite-delivery-failed-note"
        >
          A failed delivery does not automatically invalidate a pending invite. Use Resend to issue a fresh active link when needed.
        </p>
      ) : null}

      <div className="space-y-3" data-testid="workspace-invite-pending-section">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Pending Invites
          </h5>
        </div>
        {pendingInvites.length > 0 ? (
          pendingInvites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              busyAction={props.busyAction}
              copyFreshLinkEnabled={props.copyFreshLinkEnabled}
              onResend={props.onResend}
              onRevoke={props.onRevoke}
              onCopyFreshLink={props.onCopyFreshLink}
            />
          ))
        ) : (
          <p
            className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-sm text-slate-400"
            data-testid="workspace-invite-pending-empty"
          >
            No pending invites in this league right now.
          </p>
        )}
      </div>

      <div className="space-y-3" data-testid="workspace-invite-history-section">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Invite History
          </h5>
        </div>
        {historyInvites.length > 0 ? (
          historyInvites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              busyAction={props.busyAction}
              copyFreshLinkEnabled={props.copyFreshLinkEnabled}
              onResend={props.onResend}
              onRevoke={props.onRevoke}
              onCopyFreshLink={props.onCopyFreshLink}
            />
          ))
        ) : (
          <p
            className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-sm text-slate-400"
            data-testid="workspace-invite-history-empty"
          >
            Accepted, expired, and revoked invites will appear here after commissioners start inviting league members.
          </p>
        )}
      </div>
    </section>
  );
}
