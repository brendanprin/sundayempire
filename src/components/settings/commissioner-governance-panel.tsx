"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { trackUiEvent } from "@/lib/ui-analytics";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type CommissionerIntegrityStatus = "HEALTHY" | "MISSING_COMMISSIONER" | "MULTIPLE_COMMISSIONERS";

type CommissionerIntegrityIssue = {
  code:
    | "MISSING_ACTIVE_COMMISSIONER"
    | "MULTIPLE_ACTIVE_COMMISSIONERS"
    | "PENDING_DESIGNATION_TARGET_ALREADY_MEMBER"
    | "PENDING_DESIGNATION_TARGET_ALREADY_COMMISSIONER";
  severity: "error" | "warning";
  message: string;
};

type CommissionerMembershipRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  createdAt: string;
};

type CommissionerGovernanceHistoryRow = {
  id: string;
  kind: "COMMISSIONER_REPAIR" | "COMMISSIONER_TRANSFER" | "COMMISSIONER_OVERRIDE";
  summary: string;
  createdAt: string;
  actor: {
    email: string | null;
    leagueRole: string | null;
  } | null;
  targetEmail: string | null;
};

type CommissionerGovernancePayload = {
  leagueId: string;
  viewer: {
    userId: string;
    accountRole: "ADMIN" | "USER";
    canTransferCommissioner: boolean;
    canRepairCommissionerIntegrity: boolean;
  };
  integrity: {
    status: CommissionerIntegrityStatus;
    isHealthy: boolean;
    activeCommissionerCount: number;
    issues: CommissionerIntegrityIssue[];
  };
  commissioner: CommissionerMembershipRow | null;
  members: CommissionerMembershipRow[];
  pendingCommissionerDesignation: {
    inviteId: string;
    email: string;
    createdAt: string;
    expiresAt: string;
    invitedBy: {
      userId: string;
      email: string;
      name: string | null;
    } | null;
    targetMembership: {
      membershipId: string;
      userId: string;
      email: string;
      leagueRole: "COMMISSIONER" | "MEMBER";
    } | null;
    conflict: {
      code: "TARGET_ALREADY_MEMBER" | "TARGET_ALREADY_COMMISSIONER";
      message: string;
    } | null;
  } | null;
  history: CommissionerGovernanceHistoryRow[];
};

function displayUser(user: Pick<CommissionerMembershipRow, "name" | "email">) {
  return user.name?.trim() ? `${user.name} (${user.email})` : user.email;
}

function describeIntegrityStatus(status: CommissionerIntegrityStatus) {
  switch (status) {
    case "HEALTHY":
      return {
        label: "Healthy",
        detail: "Exactly one active commissioner is present for this league.",
        className: "border-emerald-700/60 bg-emerald-950/25 text-emerald-100",
      };
    case "MISSING_COMMISSIONER":
      return {
        label: "Missing Commissioner",
        detail: "No active commissioner is currently assigned.",
        className: "border-red-700/60 bg-red-950/25 text-red-100",
      };
    default:
      return {
        label: "Conflicting Commissioners",
        detail: "Multiple active commissioner memberships were detected.",
        className: "border-red-700/60 bg-red-950/25 text-red-100",
      };
  }
}

function describeHistoryKind(kind: CommissionerGovernanceHistoryRow["kind"]) {
  if (kind === "COMMISSIONER_REPAIR") {
    return "Repair";
  }

  if (kind === "COMMISSIONER_TRANSFER") {
    return "Transfer";
  }

  return "Override";
}

function buildSupportDeepLink(input: {
  leagueId: string;
  status: CommissionerIntegrityStatus;
}) {
  const params = new URLSearchParams({
    leagueId: input.leagueId,
    status: input.status,
    sort: "INTEGRITY_SEVERITY_DESC",
    page: "1",
    pageSize: "20",
  });
  return `/support/commissioner?${params.toString()}`;
}

export function CommissionerGovernancePanel() {
  const pathname = usePathname();
  const [payload, setPayload] = useState<CommissionerGovernancePayload | null>(null);
  const [transferUserId, setTransferUserId] = useState("");
  const [repairUserId, setRepairUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const transferTargets = useMemo(() => {
    if (!payload || !payload.commissioner) {
      return [];
    }

    return payload.members.filter((member) => member.userId !== payload.commissioner?.userId);
  }, [payload]);

  const repairTargets = useMemo(() => {
    if (!payload) {
      return [];
    }

    if (!payload.viewer.canRepairCommissionerIntegrity || payload.integrity.isHealthy) {
      return [];
    }

    const allMembers = payload.members;

    if (
      payload.integrity.status === "MISSING_COMMISSIONER" &&
      !payload.viewer.canTransferCommissioner
    ) {
      return allMembers.filter((member) => member.userId === payload.viewer.userId);
    }

    return allMembers;
  }, [payload]);

  async function loadPanel() {
    setIsLoading(true);
    setError(null);

    try {
      const nextPayload = await requestJson<CommissionerGovernancePayload>(
        "/api/league/commissioner",
        { cache: "no-store" },
        "Could not load commissioner governance settings.",
      );
      setPayload(nextPayload);

      setTransferUserId((current) => {
        if (current && nextPayload.members.some((member) => member.userId === current)) {
          return current;
        }

        if (!nextPayload.commissioner) {
          return "";
        }

        return (
          nextPayload.members.find((member) => member.userId !== nextPayload.commissioner?.userId)
            ?.userId ?? ""
        );
      });

      setRepairUserId((current) => {
        if (current && nextPayload.members.some((member) => member.userId === current)) {
          return current;
        }

        if (nextPayload.integrity.status === "MISSING_COMMISSIONER") {
          return (
            nextPayload.members.find((member) => member.userId === nextPayload.viewer.userId)
              ?.userId ?? nextPayload.members[0]?.userId ?? ""
          );
        }

        return nextPayload.members[0]?.userId ?? "";
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load commissioner governance settings.",
      );
      setPayload(null);
      setTransferUserId("");
      setRepairUserId("");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPanel();
  }, []);

  async function transferCommissioner() {
    if (!transferUserId || isTransferring) {
      return;
    }

    setIsTransferring(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await requestJson<{
        commissioner: CommissionerMembershipRow;
      }>(
        "/api/league/commissioner",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            targetUserId: transferUserId,
          }),
        },
        "Could not transfer commissioner authority.",
      );

      setSuccessMessage(`Commissioner authority transferred to ${displayUser(response.commissioner)}.`);
      await loadPanel();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.message);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not transfer commissioner authority.",
        );
      }
    } finally {
      setIsTransferring(false);
    }
  }

  async function repairCommissionerIntegrity() {
    if (!repairUserId || isRepairing) {
      return;
    }

    setIsRepairing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await requestJson<{
        commissioner: CommissionerMembershipRow;
      }>(
        "/api/league/commissioner/repair",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            targetUserId: repairUserId,
          }),
        },
        "Could not repair commissioner integrity.",
      );

      setSuccessMessage(
        `Commissioner governance repaired. Active commissioner is now ${displayUser(response.commissioner)}.`,
      );
      await loadPanel();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.message);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not repair commissioner integrity.",
        );
      }
    } finally {
      setIsRepairing(false);
    }
  }

  const statusDescriptor = payload ? describeIntegrityStatus(payload.integrity.status) : null;
  const supportLinkHref =
    payload && payload.viewer.accountRole === "ADMIN"
      ? buildSupportDeepLink({
          leagueId: payload.leagueId,
          status: payload.integrity.status,
        })
      : null;

  function trackGovernanceSupportDeepLink(source: "integrity_card" | "history_card") {
    if (!payload) {
      return;
    }

    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_SUPPORT_DEEP_LINK_OPENED_FROM_GOVERNANCE,
      pagePath: pathname,
      eventStep: "open_deep_link",
      status: "success",
      entityType: "league",
      entityId: payload.leagueId,
      context: {
        source,
        integrityStatus: payload.integrity.status,
      },
    });
  }

  return (
    <section
      className="rounded-2xl border border-cyan-800/40 bg-gradient-to-br from-cyan-950/25 to-slate-950/70 p-5 lg:p-6"
      data-testid="settings-commissioner-governance"
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/90">League Governance</p>
      <h3 className="mt-2 text-xl font-semibold text-cyan-100">Commissioner assignment</h3>
      <p className="mt-2 text-sm text-cyan-200/80">
        Commissioner authority is league-scoped and explicit. Team ownership remains a separate team relationship.
      </p>

      {isLoading ? <p className="mt-4 text-sm text-cyan-100/80">Loading commissioner governance...</p> : null}

      {!isLoading && payload ? (
        <div className="mt-4 space-y-3 text-sm text-cyan-50">
          {statusDescriptor ? (
            <div
              className={`rounded-xl border p-4 ${statusDescriptor.className}`}
              data-testid="settings-commissioner-integrity-status"
            >
              <p className="text-xs uppercase tracking-[0.16em]">Commissioner Integrity</p>
              <p className="mt-1 font-medium">{statusDescriptor.label}</p>
              <p className="mt-1 text-xs opacity-90">{statusDescriptor.detail}</p>
              <p className="mt-1 text-xs opacity-80">
                Active commissioner memberships: {payload.integrity.activeCommissionerCount}
              </p>
              {supportLinkHref ? (
                <Link
                  href={supportLinkHref}
                  onClick={() => {
                    trackGovernanceSupportDeepLink("integrity_card");
                  }}
                  className="mt-3 inline-block text-xs text-cyan-200 underline decoration-cyan-400/70 underline-offset-4 hover:text-cyan-100"
                  data-testid="settings-commissioner-support-link"
                >
                  Open in Commissioner Support
                </Link>
              ) : null}
            </div>
          ) : null}

          {payload.integrity.issues.length > 0 ? (
            <div
              className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-amber-100"
              data-testid="settings-commissioner-integrity-issues"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Integrity Findings</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
                {payload.integrity.issues.map((issue) => (
                  <li key={issue.code} data-testid="settings-commissioner-integrity-issue">
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload.commissioner ? (
            <div
              className="rounded-xl border border-cyan-800/50 bg-cyan-950/30 p-4"
              data-testid="settings-current-commissioner"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Active Commissioner</p>
              <p className="mt-1 font-medium">{displayUser(payload.commissioner)}</p>
              <p className="mt-1 text-xs text-cyan-200/80">
                {payload.commissioner.teamName
                  ? `Also manages team: ${payload.commissioner.teamName}`
                  : "No team assignment is required for commissioner authority."}
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-red-100"
              data-testid="settings-current-commissioner-missing"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-red-300">Active Commissioner</p>
              <p className="mt-1">No active commissioner membership is currently assigned.</p>
            </div>
          )}

          {payload.pendingCommissionerDesignation ? (
            <div
              className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-amber-100"
              data-testid="settings-pending-commissioner-designation"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Pending Commissioner Designation</p>
              <p className="mt-1">
                Invite sent to {payload.pendingCommissionerDesignation.email}. Current commissioner remains active until
                acceptance.
              </p>
              <p className="mt-1 text-xs text-amber-200/80">
                Expires {new Date(payload.pendingCommissionerDesignation.expiresAt).toLocaleString()}.
              </p>
              {payload.pendingCommissionerDesignation.conflict ? (
                <p
                  className="mt-2 rounded-md border border-amber-600/60 bg-amber-900/35 px-2 py-1 text-xs text-amber-100"
                  data-testid="settings-pending-commissioner-conflict"
                >
                  {payload.pendingCommissionerDesignation.conflict.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div
            className="rounded-xl border border-cyan-800/50 bg-cyan-950/25 p-4"
            data-testid="settings-commissioner-history"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Governance History</p>
              {supportLinkHref ? (
                <Link
                  href={supportLinkHref}
                  onClick={() => {
                    trackGovernanceSupportDeepLink("history_card");
                  }}
                  className="text-xs text-cyan-200 underline decoration-cyan-400/70 underline-offset-4 hover:text-cyan-100"
                  data-testid="settings-commissioner-history-support-link"
                >
                  Open in Commissioner Support
                </Link>
              ) : null}
            </div>
            {payload.history.length === 0 ? (
              <p className="mt-2 text-xs text-cyan-200/80">
                No commissioner governance events are recorded yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {payload.history.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-cyan-800/40 bg-slate-950/40 px-3 py-2"
                    data-testid="settings-commissioner-history-entry"
                  >
                    <p className="text-xs uppercase tracking-[0.14em] text-cyan-300/80">
                      {describeHistoryKind(entry.kind)}
                    </p>
                    <p className="mt-1 text-sm text-cyan-50">{entry.summary}</p>
                    <p className="mt-1 text-xs text-cyan-200/70">
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.actor?.email ? ` · by ${entry.actor.email}` : ""}
                      {entry.targetEmail ? ` · target ${entry.targetEmail}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!payload.integrity.isHealthy && payload.viewer.canRepairCommissionerIntegrity ? (
            <div className="rounded-xl border border-red-700/60 bg-red-950/20 p-4" data-testid="settings-commissioner-repair">
              <p className="text-xs uppercase tracking-[0.16em] text-red-300">Repair Commissioner Integrity</p>
              <p className="mt-1 text-xs text-red-100/90">
                Choose a league member to restore one active commissioner safely.
              </p>

              <label className="mt-3 block text-xs text-red-100/90">
                <span className="mb-1.5 block">Repair target member</span>
                <select
                  value={repairUserId}
                  onChange={(event) => setRepairUserId(event.target.value)}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm text-red-50"
                  style={{
                    borderColor: "rgba(248, 113, 113, 0.45)",
                  }}
                  data-testid="settings-commissioner-repair-select"
                >
                  {repairTargets.length > 0 ? (
                    repairTargets.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {displayUser(member)}
                        {member.teamName ? ` - ${member.teamName}` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">No eligible members</option>
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  void repairCommissionerIntegrity();
                }}
                disabled={!repairUserId || repairTargets.length === 0 || isRepairing}
                className="mt-3 rounded-md bg-red-300 px-4 py-2 text-sm font-medium text-red-950 transition hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="settings-commissioner-repair-button"
              >
                {isRepairing ? "Repairing..." : "Repair Commissioner Governance"}
              </button>
            </div>
          ) : null}

          {payload.integrity.isHealthy && payload.viewer.canTransferCommissioner && payload.commissioner ? (
            <div className="rounded-xl border border-cyan-800/50 bg-cyan-950/30 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Transfer Commissioner</p>
              <p className="mt-1 text-xs text-cyan-200/80">
                Select an existing member to transfer commissioner authority.
              </p>

              <label className="mt-3 block text-xs text-cyan-200/90">
                <span className="mb-1.5 block">Target member</span>
                <select
                  value={transferUserId}
                  onChange={(event) => setTransferUserId(event.target.value)}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm text-cyan-50"
                  style={{
                    borderColor: "rgba(34, 211, 238, 0.35)",
                  }}
                  data-testid="settings-commissioner-transfer-select"
                >
                  {transferTargets.length > 0 ? (
                    transferTargets.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {displayUser(member)}
                        {member.teamName ? ` - ${member.teamName}` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">No eligible members</option>
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  void transferCommissioner();
                }}
                disabled={!transferUserId || transferTargets.length === 0 || isTransferring}
                className="mt-3 rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="settings-commissioner-transfer-button"
              >
                {isTransferring ? "Transferring..." : "Transfer Commissioner"}
              </button>
            </div>
          ) : null}

          {!payload.integrity.isHealthy && !payload.viewer.canRepairCommissionerIntegrity ? (
            <p className="text-xs text-cyan-200/80" data-testid="settings-commissioner-repair-readonly">
              Commissioner integrity is unhealthy. Ask your active commissioner or platform support to run repair.
            </p>
          ) : null}

          {payload.integrity.isHealthy && !payload.viewer.canTransferCommissioner ? (
            <p className="text-xs text-cyan-200/80" data-testid="settings-commissioner-transfer-readonly">
              Only the active commissioner can transfer commissioner authority.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-4 rounded-md border border-red-700/60 bg-red-950/30 px-3 py-2 text-sm text-red-100"
          data-testid="settings-commissioner-error"
        >
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div
          className="mt-4 rounded-md border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
          data-testid="settings-commissioner-success"
        >
          {successMessage}
        </div>
      ) : null}
    </section>
  );
}
