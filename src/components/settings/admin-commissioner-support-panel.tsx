"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { trackUiEvent } from "@/lib/ui-analytics";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type CommissionerIntegrityStatus = "HEALTHY" | "MISSING_COMMISSIONER" | "MULTIPLE_COMMISSIONERS";
type CommissionerIntegrityFilter =
  | "ALL"
  | "UNHEALTHY"
  | "HEALTHY"
  | "MISSING_COMMISSIONER"
  | "MULTIPLE_COMMISSIONERS";
type CommissionerIndexSort =
  | "INTEGRITY_SEVERITY_DESC"
  | "INTEGRITY_SEVERITY_ASC"
  | "CREATED_AT_DESC"
  | "CREATED_AT_ASC";

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

type AdminLeagueIntegrityIndexRow = {
  leagueId: string;
  leagueName: string;
  createdAt: string;
  membershipCount: number;
  activeCommissionerCount: number;
  integrityStatus: CommissionerIntegrityStatus;
};

type AdminCommissionerGovernancePayload = {
  viewer: {
    userId: string;
    email: string;
    accountRole: "ADMIN" | "USER";
  };
  filters: {
    query: string;
    status: Exclude<CommissionerIntegrityFilter, "ALL"> | null;
    sort: CommissionerIndexSort;
  };
  index: {
    rows: AdminLeagueIntegrityIndexRow[];
    page: number;
    pageSize: number;
    sort: CommissionerIndexSort;
    totalCount: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  selectedLeagueId: string | null;
  selectedLeague: {
    leagueId: string;
    leagueName: string;
    createdAt: string;
    repairContextReady: boolean;
    snapshot: {
      leagueId: string;
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
      } | null;
      history: CommissionerGovernanceHistoryRow[];
    };
  } | null;
};

type AuthMePayload = {
  user: {
    accountRole: "ADMIN" | "USER";
  };
};

const DEFAULT_STATUS_FILTER: CommissionerIntegrityFilter = "UNHEALTHY";
const DEFAULT_SORT_MODE: CommissionerIndexSort = "INTEGRITY_SEVERITY_DESC";
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function displayUser(user: Pick<CommissionerMembershipRow, "name" | "email">) {
  return user.name?.trim() ? `${user.name} (${user.email})` : user.email;
}

function describeIntegrityStatus(status: CommissionerIntegrityStatus) {
  switch (status) {
    case "HEALTHY":
      return {
        label: "Healthy",
        className: "border-emerald-700/60 bg-emerald-950/25 text-emerald-100",
      };
    case "MISSING_COMMISSIONER":
      return {
        label: "Missing Commissioner",
        className: "border-red-700/60 bg-red-950/25 text-red-100",
      };
    default:
      return {
        label: "Conflicting Commissioners",
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

function describeSortMode(sortMode: CommissionerIndexSort) {
  if (sortMode === "INTEGRITY_SEVERITY_DESC") {
    return "Severity (worst first)";
  }

  if (sortMode === "INTEGRITY_SEVERITY_ASC") {
    return "Severity (healthiest first)";
  }

  if (sortMode === "CREATED_AT_ASC") {
    return "League creation (oldest first)";
  }

  return "League creation (newest first)";
}

function normalizeStatusFilter(
  value: string | null,
  fallback: CommissionerIntegrityFilter = DEFAULT_STATUS_FILTER,
): CommissionerIntegrityFilter {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "ALL" ||
    normalized === "UNHEALTHY" ||
    normalized === "HEALTHY" ||
    normalized === "MISSING_COMMISSIONER" ||
    normalized === "MULTIPLE_COMMISSIONERS"
  ) {
    return normalized;
  }

  return fallback;
}

function normalizeSortMode(value: string | null): CommissionerIndexSort {
  if (!value) {
    return DEFAULT_SORT_MODE;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "INTEGRITY_SEVERITY_DESC" ||
    normalized === "INTEGRITY_SEVERITY_ASC" ||
    normalized === "CREATED_AT_DESC" ||
    normalized === "CREATED_AT_ASC"
  ) {
    return normalized;
  }

  return DEFAULT_SORT_MODE;
}

function normalizePage(value: string | null) {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function normalizePageSize(value: string | null) {
  if (!value) {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number.parseInt(value, 10);
  if (!PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])) {
    return DEFAULT_PAGE_SIZE;
  }

  return parsed;
}

function normalizeLeagueId(value: string | null) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function buildSupportUrlStateParams(input: {
  searchQuery: string;
  statusFilter: CommissionerIntegrityFilter;
  page: number;
  pageSize: number;
  sortMode: CommissionerIndexSort;
  selectedLeagueId: string;
}) {
  const params = new URLSearchParams();
  if (input.searchQuery.length > 0) {
    params.set("q", input.searchQuery);
  }

  params.set("status", input.statusFilter);
  params.set("sort", input.sortMode);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));

  if (input.selectedLeagueId.length > 0) {
    params.set("leagueId", input.selectedLeagueId);
  }

  return params;
}

function buildSupportApiParams(input: {
  searchQuery: string;
  statusFilter: CommissionerIntegrityFilter;
  page: number;
  pageSize: number;
  sortMode: CommissionerIndexSort;
  selectedLeagueId: string;
}) {
  const params = new URLSearchParams();
  if (input.searchQuery.length > 0) {
    params.set("q", input.searchQuery);
  }

  if (input.statusFilter !== "ALL") {
    params.set("status", input.statusFilter);
  }

  params.set("sort", input.sortMode);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));

  if (input.selectedLeagueId.length > 0) {
    params.set("leagueId", input.selectedLeagueId);
  }

  return params;
}

export function AdminCommissionerSupportPanel() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<AdminCommissionerGovernancePayload | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState(() =>
    normalizeLeagueId(searchParams.get("leagueId")),
  );
  const [repairUserId, setRepairUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [statusFilter, setStatusFilter] = useState<CommissionerIntegrityFilter>(() =>
    normalizeStatusFilter(searchParams.get("status")),
  );
  const [sortMode, setSortMode] = useState<CommissionerIndexSort>(() =>
    normalizeSortMode(searchParams.get("sort")),
  );
  const [page, setPage] = useState(() => normalizePage(searchParams.get("page")));
  const [pageSize, setPageSize] = useState(() => normalizePageSize(searchParams.get("pageSize")));
  const [refreshTick, setRefreshTick] = useState(0);
  const [initialQueryString] = useState(() => searchParams.toString());
  const openedWorkspaceTelemetrySent = useRef(false);

  const selectedSnapshot = payload?.selectedLeague?.snapshot ?? null;

  const repairTargets = useMemo(() => {
    if (!selectedSnapshot || selectedSnapshot.integrity.isHealthy) {
      return [];
    }

    return selectedSnapshot.members;
  }, [selectedSnapshot]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setIsLoading(true);
      setError(null);

      try {
        const auth = await requestJson<AuthMePayload>(
          "/api/auth/me",
          { cache: "no-store" },
          "Could not verify account role.",
        );

        if (!mounted) {
          return;
        }

        if (auth.user.accountRole !== "ADMIN") {
          setIsAdmin(false);
          setPayload(null);
          setSelectedLeagueId("");
          setRepairUserId("");
          setIsLoading(false);
          return;
        }

        setIsAdmin(true);
      } catch (requestError) {
        if (!mounted) {
          return;
        }

        setIsAdmin(false);
        setPayload(null);
        setError(requestError instanceof Error ? requestError.message : "Could not verify account role.");
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isAdmin !== true) {
      return;
    }

    const nextParams = buildSupportUrlStateParams({
      searchQuery,
      statusFilter,
      page,
      pageSize,
      sortMode,
      selectedLeagueId,
    });
    const nextQueryString = nextParams.toString();
    const currentQueryString = searchParams.toString();

    if (nextQueryString === currentQueryString) {
      return;
    }

    router.replace(nextQueryString.length > 0 ? `${pathname}?${nextQueryString}` : pathname, {
      scroll: false,
    });
  }, [
    isAdmin,
    page,
    pageSize,
    pathname,
    router,
    searchParams,
    searchQuery,
    selectedLeagueId,
    sortMode,
    statusFilter,
  ]);

  useEffect(() => {
    if (isAdmin !== true || openedWorkspaceTelemetrySent.current) {
      return;
    }

    openedWorkspaceTelemetrySent.current = true;
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_SUPPORT_WORKSPACE_OPENED,
      pagePath: pathname,
      eventStep: "open",
      status: "success",
      entityType: "support_workspace",
      entityId: "commissioner",
      context: {
        deepLinked: initialQueryString.length > 0,
        hasLeagueId: selectedLeagueId.length > 0,
        queryLength: searchQuery.length,
        integrityFilter: statusFilter,
        sortMode,
        pageSize,
      },
    });
  }, [
    initialQueryString.length,
    isAdmin,
    pageSize,
    pathname,
    searchQuery.length,
    selectedLeagueId.length,
    sortMode,
    statusFilter,
  ]);

  useEffect(() => {
    if (isAdmin !== true) {
      return;
    }

    let cancelled = false;

    async function loadPanel() {
      setIsLoading(true);
      setError(null);

      try {
        const apiSearch = buildSupportApiParams({
          searchQuery,
          statusFilter,
          page,
          pageSize,
          sortMode,
          selectedLeagueId,
        });

        const nextPayload = await requestJson<AdminCommissionerGovernancePayload>(
          `/api/admin/commissioner-governance?${apiSearch.toString()}`,
          { cache: "no-store" },
          "Could not load commissioner support data.",
        );

        if (cancelled) {
          return;
        }

        setPayload(nextPayload);

        if (nextPayload.filters.query !== searchQuery) {
          setSearchQuery(nextPayload.filters.query);
          setSearchDraft(nextPayload.filters.query);
        }

        const normalizedStatusFilter = normalizeStatusFilter(nextPayload.filters.status, "ALL");
        if (normalizedStatusFilter !== statusFilter) {
          setStatusFilter(normalizedStatusFilter);
        }

        const normalizedSortMode = normalizeSortMode(nextPayload.filters.sort);
        if (normalizedSortMode !== sortMode) {
          setSortMode(normalizedSortMode);
        }

        if (nextPayload.index.page !== page) {
          setPage(nextPayload.index.page);
        }

        if (nextPayload.index.pageSize !== pageSize) {
          setPageSize(nextPayload.index.pageSize);
        }

        const nextSelectedLeagueId = nextPayload.selectedLeagueId ?? "";
        if (nextSelectedLeagueId !== selectedLeagueId) {
          setSelectedLeagueId(nextSelectedLeagueId);
        }

        const nextMembers = nextPayload.selectedLeague?.snapshot.members ?? [];
        const firstMemberUserId = nextMembers[0]?.userId ?? "";
        const fallbackRepairUserId =
          nextPayload.selectedLeague?.snapshot.commissioner?.userId ?? firstMemberUserId;

        setRepairUserId((current) => {
          if (current && nextMembers.some((member) => member.userId === current)) {
            return current;
          }

          return fallbackRepairUserId;
        });
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setPayload(null);
        setRepairUserId("");
        setError(
          requestError instanceof Error ? requestError.message : "Could not load commissioner support data.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPanel();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, page, pageSize, refreshTick, searchQuery, selectedLeagueId, sortMode, statusFilter]);

  async function repairCommissionerIntegrity() {
    if (!payload?.selectedLeague || !repairUserId || isRepairing) {
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
            leagueId: payload.selectedLeague.leagueId,
            targetUserId: repairUserId,
          }),
        },
        "Could not repair commissioner integrity.",
      );

      setSuccessMessage(
        `Commissioner integrity repaired for ${payload.selectedLeague.leagueName}. Active commissioner is now ${displayUser(response.commissioner)}.`,
      );
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_SUPPORT_REPAIR_SUBMITTED,
        pagePath: pathname,
        eventStep: "submit",
        status: "success",
        entityType: "league",
        entityId: payload.selectedLeague.leagueId,
        context: {
          source: "support_workspace",
          deepLinked: initialQueryString.length > 0,
          targetUserId: repairUserId,
          integrityFilter: statusFilter,
          sortMode,
          pageSize,
        },
      });
      setRefreshTick((current) => current + 1);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.message);
      } else {
        setError(
          requestError instanceof Error ? requestError.message : "Could not repair commissioner integrity.",
        );
      }
    } finally {
      setIsRepairing(false);
    }
  }

  async function copyTriageLink() {
    setError(null);
    setSuccessMessage(null);

    try {
      if (typeof window === "undefined" || !window.navigator.clipboard) {
        throw new Error("Clipboard is not available.");
      }

      const params = buildSupportUrlStateParams({
        searchQuery,
        statusFilter,
        page,
        pageSize,
        sortMode,
        selectedLeagueId,
      });
      const query = params.toString();
      const path = query.length > 0 ? `${pathname}?${query}` : pathname;
      const absoluteUrl = `${window.location.origin}${path}`;

      await window.navigator.clipboard.writeText(absoluteUrl);
      setSuccessMessage("Support triage link copied to clipboard.");
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_SUPPORT_TRIAGE_LINK_COPIED,
        pagePath: pathname,
        eventStep: "copy_link",
        status: "success",
        entityType: "league",
        entityId: selectedLeagueId || "none",
        context: {
          deepLinked: initialQueryString.length > 0,
          integrityFilter: statusFilter,
          sortMode,
          page,
          pageSize,
          hasSearchQuery: searchQuery.length > 0,
        },
      });
    } catch {
      setError("Could not copy support triage link.");
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchDraft.trim());
  }

  if (isAdmin === false) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-fuchsia-800/40 bg-gradient-to-br from-fuchsia-950/20 to-slate-950/70 p-5 lg:p-6"
      data-testid="settings-admin-commissioner-support"
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-fuchsia-400/90">Platform Support</p>
      <h3 className="mt-2 text-xl font-semibold text-fuchsia-100">Cross-league commissioner integrity</h3>
      <p className="mt-2 text-sm text-fuchsia-200/80">
        Search league workspaces, review integrity status, and run audited commissioner repair when governance is unhealthy.
      </p>

      <form className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto]" onSubmit={applySearch}>
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search leagues"
          className="rounded-md border border-fuchsia-800/50 bg-fuchsia-950/20 px-3 py-2 text-sm text-fuchsia-50"
          data-testid="settings-admin-commissioner-search-input"
        />
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as CommissionerIntegrityFilter);
            setPage(1);
          }}
          className="rounded-md border border-fuchsia-800/50 bg-fuchsia-950/20 px-3 py-2 text-sm text-fuchsia-100"
          data-testid="settings-admin-commissioner-status-filter"
        >
          <option value="UNHEALTHY">Unhealthy leagues</option>
          <option value="ALL">All leagues</option>
          <option value="MISSING_COMMISSIONER">Missing commissioner</option>
          <option value="MULTIPLE_COMMISSIONERS">Conflicting commissioners</option>
          <option value="HEALTHY">Healthy</option>
        </select>
        <select
          value={sortMode}
          onChange={(event) => {
            setSortMode(event.target.value as CommissionerIndexSort);
            setPage(1);
          }}
          className="rounded-md border border-fuchsia-800/50 bg-fuchsia-950/20 px-3 py-2 text-sm text-fuchsia-100"
          data-testid="settings-admin-commissioner-sort"
        >
          <option value="INTEGRITY_SEVERITY_DESC">Severity (worst first)</option>
          <option value="INTEGRITY_SEVERITY_ASC">Severity (healthiest first)</option>
          <option value="CREATED_AT_DESC">League creation (newest first)</option>
          <option value="CREATED_AT_ASC">League creation (oldest first)</option>
        </select>
        <select
          value={String(pageSize)}
          onChange={(event) => {
            setPageSize(normalizePageSize(event.target.value));
            setPage(1);
          }}
          className="rounded-md border border-fuchsia-800/50 bg-fuchsia-950/20 px-3 py-2 text-sm text-fuchsia-100"
          data-testid="settings-admin-commissioner-page-size"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={String(option)}>
              {option} / page
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-fuchsia-300 px-3 py-2 text-sm font-medium text-fuchsia-950 transition hover:bg-fuchsia-200"
          data-testid="settings-admin-commissioner-search-submit"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => {
            void copyTriageLink();
          }}
          className="rounded-md border border-fuchsia-700/60 px-3 py-2 text-sm text-fuchsia-100 transition hover:border-fuchsia-500"
          data-testid="settings-admin-commissioner-copy-link"
        >
          Copy Link
        </button>
      </form>

      {payload ? (
        <div
          className="mt-3 rounded-lg border border-fuchsia-800/40 bg-fuchsia-950/15 px-3 py-2 text-xs text-fuchsia-100/90"
          data-testid="settings-admin-commissioner-index-summary"
        >
          Showing {payload.index.rows.length} of {payload.index.totalCount} league(s). Page {payload.index.page}
          {payload.index.totalPages > 0 ? ` of ${payload.index.totalPages}` : ""}. Sort: {describeSortMode(payload.index.sort)}.
        </div>
      ) : null}

      {isLoading && !payload ? (
        <p className="mt-4 text-sm text-fuchsia-100/80">Loading platform support governance...</p>
      ) : null}

      {!isLoading && payload ? (
        <div className="mt-4 space-y-3 text-sm text-fuchsia-50">
          {payload.index.rows.length === 0 ? (
            <p className="rounded-xl border border-fuchsia-800/40 bg-fuchsia-950/20 p-4 text-sm text-fuchsia-100/90">
              No leagues matched the current search/filter.
            </p>
          ) : (
            <div className="rounded-xl border border-fuchsia-800/40 bg-fuchsia-950/20 p-2">
              <ul className="space-y-1" data-testid="settings-admin-commissioner-index-list">
                {payload.index.rows.map((league) => {
                  const statusDescriptor = describeIntegrityStatus(league.integrityStatus);
                  const selected = payload.selectedLeague?.leagueId === league.leagueId;

                  return (
                    <li
                      key={league.leagueId}
                      className={`rounded-md border px-3 py-2 ${selected ? "border-fuchsia-400 bg-fuchsia-900/30" : "border-fuchsia-800/40 bg-fuchsia-950/10"}`}
                      data-testid="settings-admin-commissioner-index-row"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-fuchsia-50">{league.leagueName}</p>
                          <p className="mt-1 text-xs text-fuchsia-200/80">
                            {statusDescriptor.label} · memberships {league.membershipCount} · commissioners {league.activeCommissionerCount}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeagueId(league.leagueId);
                          }}
                          className="rounded-md border border-fuchsia-700/60 px-2 py-1 text-xs text-fuchsia-100 hover:border-fuchsia-500"
                          data-testid="settings-admin-commissioner-index-select"
                        >
                          {selected ? "Selected" : "Inspect"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={!payload.index.hasPreviousPage}
                  onClick={() => {
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  className="rounded-md border border-fuchsia-700/60 px-2 py-1 text-xs text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="settings-admin-commissioner-index-prev"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!payload.index.hasNextPage}
                  onClick={() => {
                    setPage((current) => current + 1);
                  }}
                  className="rounded-md border border-fuchsia-700/60 px-2 py-1 text-xs text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="settings-admin-commissioner-index-next"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {payload.selectedLeague ? (
            <>
              <div
                className={`rounded-xl border p-4 ${describeIntegrityStatus(payload.selectedLeague.snapshot.integrity.status).className}`}
                data-testid="settings-admin-commissioner-integrity-status"
              >
                <p className="text-xs uppercase tracking-[0.16em]">Commissioner Integrity</p>
                <p className="mt-1 font-medium">
                  {payload.selectedLeague.leagueName} - {describeIntegrityStatus(payload.selectedLeague.snapshot.integrity.status).label}
                </p>
                <p className="mt-1 text-xs opacity-85">
                  Active commissioner memberships: {payload.selectedLeague.snapshot.integrity.activeCommissionerCount}
                </p>
                <p className="mt-1 text-xs opacity-75">
                  Active memberships: {payload.selectedLeague.snapshot.members.length}
                </p>
              </div>

              {payload.selectedLeague.snapshot.integrity.issues.length > 0 ? (
                <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-amber-100">
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Integrity Findings</p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
                    {payload.selectedLeague.snapshot.integrity.issues.map((issue) => (
                      <li key={issue.code}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!payload.selectedLeague.repairContextReady ? (
                <p className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                  Repair is currently unavailable because this league does not have an active season and ruleset context.
                </p>
              ) : null}

              {!payload.selectedLeague.snapshot.integrity.isHealthy &&
              repairTargets.length > 0 &&
              payload.selectedLeague.repairContextReady ? (
                <div
                  className="rounded-xl border border-red-700/60 bg-red-950/20 p-4"
                  data-testid="settings-admin-commissioner-repair"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-red-300">Run Audited Repair</p>
                  <p className="mt-1 text-xs text-red-100/90">
                    Select a member to restore one active commissioner in this league.
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
                      data-testid="settings-admin-commissioner-repair-select"
                    >
                      {repairTargets.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {displayUser(member)}
                          {member.teamName ? ` - ${member.teamName}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      void repairCommissionerIntegrity();
                    }}
                    disabled={!repairUserId || isRepairing}
                    className="mt-3 rounded-md bg-red-300 px-4 py-2 text-sm font-medium text-red-950 transition hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="settings-admin-commissioner-repair-button"
                  >
                    {isRepairing ? "Repairing..." : "Repair League Commissioner"}
                  </button>
                </div>
              ) : null}

              <div
                className="rounded-xl border border-fuchsia-800/50 bg-fuchsia-950/20 p-4"
                data-testid="settings-admin-commissioner-history"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-fuchsia-300/90">
                  Commissioner Governance History
                </p>
                {payload.selectedLeague.snapshot.history.length === 0 ? (
                  <p className="mt-2 text-xs text-fuchsia-200/80">
                    No commissioner governance events are recorded yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {payload.selectedLeague.snapshot.history.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-lg border border-fuchsia-800/40 bg-slate-950/40 px-3 py-2"
                        data-testid="settings-admin-commissioner-history-entry"
                      >
                        <p className="text-xs uppercase tracking-[0.14em] text-fuchsia-300/80">
                          {describeHistoryKind(entry.kind)}
                        </p>
                        <p className="mt-1 text-sm text-fuchsia-50">{entry.summary}</p>
                        <p className="mt-1 text-xs text-fuchsia-200/70">
                          {new Date(entry.createdAt).toLocaleString()}
                          {entry.actor?.email ? ` · by ${entry.actor.email}` : ""}
                          {entry.targetEmail ? ` · target ${entry.targetEmail}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-4 rounded-md border border-red-700/60 bg-red-950/30 px-3 py-2 text-sm text-red-100"
          data-testid="settings-admin-commissioner-error"
        >
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div
          className="mt-4 rounded-md border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
          data-testid="settings-admin-commissioner-success"
        >
          {successMessage}
        </div>
      ) : null}
    </section>
  );
}
