"use client";

import { useState } from "react";

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
      return "border-blue-700/60 bg-blue-950/20 text-blue-200";
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

function InviteSummary(props: {
  pendingCount: number;
  acceptedCount: number;
  expiredCount: number;
  revokedCount: number;
  deliveryIssues: {
    notConfigured: boolean;
    failed: boolean;
    captured: boolean;
  };
  viewMode: "pending" | "history" | "all";
  onViewModeChange: (mode: "pending" | "history" | "all") => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const totalInvites = props.pendingCount + props.acceptedCount + props.expiredCount + props.revokedCount;
  const hasIssues = props.deliveryIssues.notConfigured || props.deliveryIssues.failed;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">Invite Management</h4>
          <p className="mt-1 text-xs text-slate-400">
            {totalInvites === 0 
              ? "No invites sent yet in this league."
              : `${totalInvites} invites total • ${props.pendingCount} pending`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalInvites > 0 && (
            <button
              onClick={props.onToggleExpanded}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100"
            >
              {props.isExpanded ? "Collapse" : "Manage"}
            </button>
          )}
        </div>
      </div>

      {/* Quick Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-lg font-medium text-sky-300">{props.pendingCount}</div>
          <div className="text-xs text-slate-400">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-medium text-green-300">{props.acceptedCount}</div>
          <div className="text-xs text-slate-400">Accepted</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-medium text-amber-300">{props.expiredCount}</div>
          <div className="text-xs text-slate-400">Expired</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-medium text-red-300">{props.revokedCount}</div>
          <div className="text-xs text-slate-400">Revoked</div>
        </div>
      </div>

      {/* Delivery Issues Alert */}
      {hasIssues && (
        <div className="rounded border border-orange-700/40 bg-orange-950/20 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-orange-200">
            <span>⚠️</span>
            <span>
              {props.deliveryIssues.notConfigured && props.deliveryIssues.failed 
                ? "Some invites have delivery issues"
                : props.deliveryIssues.notConfigured 
                ? "Email delivery disabled in this environment"
                : "Some emails failed to deliver"}
            </span>
          </div>
        </div>
      )}

      {/* View Mode Tabs */}
      {totalInvites > 0 && props.isExpanded && (
        <div className="flex items-center gap-1 border-b border-slate-800">
          {([
            { key: "pending" as const, label: "Pending", count: props.pendingCount },
            { key: "history" as const, label: "History", count: props.acceptedCount + props.expiredCount + props.revokedCount },
            { key: "all" as const, label: "All", count: totalInvites }
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => props.onViewModeChange(tab.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                props.viewMode === tab.key
                  ? "border-sky-500 text-sky-200"
                  : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactInviteRow(props: {
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
    <div className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/50 px-3 py-2 hover:bg-slate-950/80">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeClasses(
              props.invite.status,
            )}`}
          >
            {getStatusLabel(props.invite.status)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-100 truncate">
              {props.invite.email}
            </span>
            {props.invite.delivery?.state === "not_configured" && (
              <span className="text-[10px] text-blue-400">Email Disabled</span>
            )}
            {props.invite.delivery?.state === "failed" && (
              <span className="text-[10px] text-orange-400">Delivery Failed</span>
            )}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {props.invite.team ? `Team: ${props.invite.team.name}` : "League-level invite"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {props.invite.canResend && (
          <button
            onClick={() => props.onResend(props.invite)}
            disabled={anyBusy}
            className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:text-slate-100 disabled:opacity-50"
          >
            {resendBusy ? "..." : "Resend"}
          </button>
        )}
        {props.copyFreshLinkEnabled && props.invite.canResend && (
          <button
            onClick={() => props.onCopyFreshLink(props.invite)}
            disabled={anyBusy}
            className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:text-slate-100 disabled:opacity-50"
          >
            {copyBusy ? "..." : "Copy"}
          </button>
        )}
        {props.invite.canRevoke && (
          <button
            onClick={() => props.onRevoke(props.invite)}
            disabled={anyBusy}
            className="rounded border border-red-700 px-2 py-1 text-[10px] text-red-300 hover:text-red-100 disabled:opacity-50"
          >
            {revokeBusy ? "..." : "Revoke"}
          </button>
        )}
      </div>
    </div>
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
  const [viewMode, setViewMode] = useState<"pending" | "history" | "all">("pending");
  const [isExpanded, setIsExpanded] = useState(false);
  const [compactView, setCompactView] = useState(true);

  const pendingInvites = props.invites.filter((invite) => invite.status === "pending");
  const historyInvites = props.invites.filter((invite) => invite.status !== "pending");
  const acceptedInvites = props.invites.filter((invite) => invite.status === "accepted");
  const expiredInvites = props.invites.filter((invite) => invite.status === "expired");
  const revokedInvites = props.invites.filter((invite) => invite.status === "revoked");

  const hasCapturedDelivery = props.invites.some(
    (invite) => invite.delivery?.state === "captured",
  );
  const hasNotConfiguredDelivery = props.invites.some(
    (invite) => invite.delivery?.state === "not_configured",
  );
  const hasFailedDelivery = props.invites.some(
    (invite) => invite.delivery?.state === "failed",
  );

  const displayInvites = (() => {
    if (viewMode === "pending") return pendingInvites;
    if (viewMode === "history") return historyInvites;
    return props.invites;
  })();

  const shouldShowExpanded = isExpanded || displayInvites.length === 0;

  return (
    <div className="space-y-3">
      {/* Compact Summary */}
      <InviteSummary 
        pendingCount={pendingInvites.length}
        acceptedCount={acceptedInvites.length}
        expiredCount={expiredInvites.length}
        revokedCount={revokedInvites.length}
        deliveryIssues={{
          notConfigured: hasNotConfiguredDelivery,
          failed: hasFailedDelivery,
          captured: hasCapturedDelivery
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isExpanded={shouldShowExpanded}
        onToggleExpanded={() => setIsExpanded(!isExpanded)}
      />

      {/* Additional Environment Notes (only when expanded) */}
      {shouldShowExpanded && (
        <div className="space-y-2">
          {props.copyFreshLinkEnabled && (
            <p className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
              Copy Fresh Link is available only in local or explicitly gated support environments.
            </p>
          )}
          {hasCapturedDelivery && (
            <p
              className="rounded-md border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-100"
              data-testid="workspace-invite-capture-note"
            >
              Test capture is active in this environment. Invite rows marked "Test capture active" did not send real email.
            </p>
          )}
          {hasNotConfiguredDelivery && (
            <p
              className="rounded-md border border-blue-800/60 bg-blue-950/20 px-3 py-2 text-xs text-blue-100"
              data-testid="workspace-invite-delivery-unavailable-note"
            >
              Email delivery is disabled in this environment. All invites remain valid and can be copied or resent when needed.
            </p>
          )}
          {hasFailedDelivery && (
            <p
              className="rounded-md border border-orange-800/60 bg-orange-950/20 px-3 py-2 text-xs text-orange-100"
              data-testid="workspace-invite-delivery-failed-note"
            >
              Some emails failed to deliver, but the invites remain valid. Use Resend to try email delivery again with a fresh link.
            </p>
          )}
        </div>
      )}

      {/* Expandable Invite List */}
      {shouldShowExpanded && displayInvites.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h5 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {viewMode === "pending" ? "Pending Invites" : 
                 viewMode === "history" ? "Invite History" : "All Invites"}
              </h5>
              <span className="text-xs text-slate-500">{displayInvites.length} items</span>
            </div>
            <button
              onClick={() => setCompactView(!compactView)}
              className="text-xs text-slate-400 hover:text-slate-300"
            >
              {compactView ? "Detailed" : "Compact"}
            </button>
          </div>
          
          <div className="space-y-1">
            {displayInvites.map((invite) => (
              compactView ? (
                <CompactInviteRow
                  key={invite.id}
                  invite={invite}
                  busyAction={props.busyAction}
                  copyFreshLinkEnabled={props.copyFreshLinkEnabled}
                  onResend={props.onResend}
                  onRevoke={props.onRevoke}
                  onCopyFreshLink={props.onCopyFreshLink}
                />
              ) : (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  busyAction={props.busyAction}
                  copyFreshLinkEnabled={props.copyFreshLinkEnabled}
                  onResend={props.onResend}
                  onRevoke={props.onRevoke}
                  onCopyFreshLink={props.onCopyFreshLink}
                />
              )
            ))}
          </div>
        </div>
      )}

      {shouldShowExpanded && displayInvites.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-sm text-slate-400">
          {viewMode === "pending" ? "No pending invites in this league right now." :
           viewMode === "history" ? "No invite history available." :
           "No invites in this league yet."}
        </p>
      )}
    </div>
  );
}
