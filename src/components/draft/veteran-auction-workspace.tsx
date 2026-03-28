"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { ResponsiveAuctionLayout } from "@/components/auction/responsive-auction-layout";
import { CompactRoomStatus } from "@/components/auction/compact-room-status";
import { requestJson } from "@/lib/client-request";
import { extractBidRejectionContext } from "@/lib/client-request";
import { formatEnumLabel } from "@/lib/format-label";
import type {
  AuctionStatusSyncResponse,
  VeteranAuctionRoomProjection,
  VeteranAuctionRoomResponse,
  VeteranAuctionSetupProjection,
  VeteranAuctionSetupResponse,
} from "@/types/draft";
import type { 
  EnhancedAuctionRoomProjection, 
  AuctionBoardRow 
} from "@/lib/read-models/auction/enhanced-auction-room-projection";

type BidFormState = {
  salaryAmount: string;
  contractYears: string;
};

type ReviewState = {
  winningBidId: string;
  reason: string;
};

// VA-S12: Enhanced bid error state for inline form validation
type BidErrorState = {
  hasError: boolean;
  message: string;
  rejectionType?: string;
  context?: Record<string, unknown>;
};

function formatStatus(status: string) {
  return formatEnumLabel(status);
}

function describeAuctionEntryStatus(input: {
  status: string;
  completed: boolean;
  reviewRequired: boolean;
  awarded: boolean;
}) {
  if (input.awarded || input.status === "AWARDED") {
    return "Contract Finalized";
  }

  if (input.reviewRequired) {
    return "Awaiting Commissioner Review";
  }

  if (input.completed) {
    return "Concluded Without Award";
  }

  return formatStatus(input.status);
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `$${value.toLocaleString()}`;
}

export function VeteranAuctionWorkspace() {
  const [setup, setSetup] = useState<VeteranAuctionSetupProjection | null>(null);
  const [room, setRoom] = useState<EnhancedAuctionRoomProjection | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [projectedBid, setProjectedBid] = useState<{salary: number; years: number} | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [auctionMode, setAuctionMode] = useState<"STANDARD" | "EMERGENCY_FILL_IN">("STANDARD");
  const [auctionEndsAt, setAuctionEndsAt] = useState("");
  const [openWindowSeconds, setOpenWindowSeconds] = useState("60");
  const [resetWindowSeconds, setResetWindowSeconds] = useState("30");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [bidForms, setBidForms] = useState<Record<string, BidFormState>>({});
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>({});
  // VA-S12: Per-entry bid error state for inline validation
  const [bidErrors, setBidErrors] = useState<Record<string, BidErrorState>>({});
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // VA-S15: Auto-refresh state management
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(0);
  
  // VA-S15: Page visibility tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadSetup = useCallback(async (search?: string) => {
    const params = new URLSearchParams();
    params.set("type", "VETERAN_AUCTION");
    if (search?.trim()) {
      params.set("search", search.trim());
    }

    const payload = await requestJson<VeteranAuctionSetupResponse>(
      `/api/drafts/setup?${params.toString()}`,
      undefined,
      "Failed to load veteran auction setup.",
    );
    setSetup(payload.setup);
    setDraftTitle((current) => current || payload.setup.draft?.title || payload.setup.defaultTitle);
    setAuctionMode(payload.setup.config.auctionMode);
    setAuctionEndsAt(toDatetimeLocalValue(payload.setup.config.auctionEndsAt));
    setOpenWindowSeconds(String(payload.setup.config.auctionOpenBidWindowSeconds));
    setResetWindowSeconds(String(payload.setup.config.auctionBidResetSeconds));
    return payload.setup;
  }, []);

  const loadRoom = useCallback(async (draftId: string) => {
    const payload = await requestJson<EnhancedAuctionRoomProjection>(
      `/api/drafts/${draftId}/auction-room`,
      undefined,
      "Failed to load veteran auction room.",
    );
    setRoom(payload);
    return payload;
  }, []);

  // VA-S15: Auto-refresh room data without disrupting form state
  const refreshRoomOnly = useCallback(async () => {
    if (!room?.draft) {
      return;
    }
    
    try {
      const payload = await requestJson<EnhancedAuctionRoomProjection>(
        `/api/drafts/${room.draft.id}/auction-room`,
        undefined,
        "Failed to load veteran auction room.",
      );
      setRoom(payload);
      lastRefreshRef.current = Date.now();
    } catch (refreshError) {
      // Silent failure for background refresh - don't disrupt user experience
      console.warn('Background auction refresh failed:', refreshError);
    }
  }, [room?.draft]);

  const refresh = useCallback(
    async () => {
      const nextSetup = await loadSetup(candidateSearch);
      if (nextSetup.draft && nextSetup.draft.status !== "NOT_STARTED") {
        await loadRoom(nextSetup.draft.id);
      } else {
        setRoom(null);
      }
    },
    [candidateSearch, loadRoom, loadSetup],
  );

  useEffect(() => {
    let mounted = true;

    refresh()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load veteran auction workspace.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [refresh]);
  
  // VA-S15: Auto-polling logic for active auctions
  useEffect(() => {
    const shouldPoll = room?.draft?.status === "IN_PROGRESS" && isPageVisible;
    
    if (shouldPoll && !isPollingActive) {
      setIsPollingActive(true);
      
      // Start polling with 5-second intervals
      pollingIntervalRef.current = setInterval(() => {
        // Only refresh if it's been at least 4 seconds since last refresh to prevent overlapping
        if (Date.now() - lastRefreshRef.current > 4000) {
          refreshRoomOnly();
        }
      }, 5000);
    } else if ((!shouldPoll || !isPageVisible) && isPollingActive) {
      setIsPollingActive(false);
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
    
    // Cleanup interval on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [room?.draft?.status, isPageVisible, isPollingActive, refreshRoomOnly]);
  
  // VA-S15: Reduced polling when page is hidden
  useEffect(() => {
    if (!isPageVisible && room?.draft?.status === "IN_PROGRESS") {
      // Clear the fast interval when page is hidden
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      // Set up a slower polling interval for background updates (30 seconds)
      const backgroundInterval = setInterval(() => {
        if (Date.now() - lastRefreshRef.current > 25000) {
          refreshRoomOnly();
        }
      }, 30000);
      
      return () => clearInterval(backgroundInterval);
    }
  }, [isPageVisible, room?.draft?.status, refreshRoomOnly]);

  const draft = room?.draft ?? setup?.draft ?? null;
  const isSetupView = !draft || draft.status === "NOT_STARTED";
  const isAuctionComplete = draft?.status === "COMPLETED";
  const canManageSetup = setup?.permissions.canManage ?? false;
  const hasCommissionerRoomControls = Boolean(
    room?.permissions.canSyncStatus || room?.permissions.canReviewBlindTies,
  );

  const generatePool = useCallback(
    async (regenerate: boolean) => {
      setBusyLabel(regenerate ? "Regenerating Auction Pool" : "Generating Auction Pool");
      setError(null);
      try {
        const payload = await requestJson<VeteranAuctionSetupResponse>(
          "/api/drafts/setup",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              type: "VETERAN_AUCTION",
              draftId: setup?.draft?.id ?? null,
              title: draftTitle,
              regenerate,
              auctionMode,
              auctionEndsAt,
              auctionOpenBidWindowSeconds: Number.parseInt(openWindowSeconds, 10),
              auctionBidResetSeconds: Number.parseInt(resetWindowSeconds, 10),
              selectedPlayerIds,
            }),
          },
          "Failed to prepare veteran auction pool.",
        );
        setSetup(payload.setup);
        setAuctionMode(payload.setup.config.auctionMode);
        setAuctionEndsAt(toDatetimeLocalValue(payload.setup.config.auctionEndsAt));
        if (payload.setup.draft && payload.setup.draft.status !== "NOT_STARTED") {
          await loadRoom(payload.setup.draft.id);
        } else {
          setRoom(null);
        }
      } finally {
        setBusyLabel(null);
      }
    },
    [
      auctionEndsAt,
      auctionMode,
      draftTitle,
      loadRoom,
      openWindowSeconds,
      resetWindowSeconds,
      selectedPlayerIds,
      setup?.draft?.id,
    ],
  );

  const finalizePool = useCallback(async () => {
    if (!setup?.draft) {
      return;
    }

    setBusyLabel("Finalizing Auction Pool");
    setError(null);
    try {
      const payload = await requestJson<VeteranAuctionSetupResponse>(
        "/api/drafts/setup",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            type: "VETERAN_AUCTION",
            draftId: setup.draft.id,
            finalizePool: true,
          }),
        },
        "Failed to finalize veteran auction pool.",
      );
      setSetup(payload.setup);
    } finally {
      setBusyLabel(null);
    }
  }, [setup?.draft]);

  const startAuction = useCallback(async () => {
    if (!setup?.draft) {
      return;
    }

    setBusyLabel("Starting Veteran Auction");
    setError(null);
    try {
      await requestJson(
        `/api/drafts/${setup.draft.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "START_DRAFT",
          }),
        },
        "Failed to start veteran auction.",
      );
      await refresh();
      // Reset the last refresh timestamp after manual refresh
      lastRefreshRef.current = Date.now();
    } finally {
      setBusyLabel(null);
    }
  }, [refresh, setup?.draft]);

  const syncStatus = useCallback(async () => {
    if (!draft) {
      return;
    }

    setBusyLabel("Syncing Auction Status");
    setError(null);
    try {
      await requestJson<AuctionStatusSyncResponse>(
        `/api/drafts/${draft.id}/auction/status/sync`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        },
        "Failed to sync auction status.",
      );
      await refresh();
      // Reset the last refresh timestamp after manual refresh
      lastRefreshRef.current = Date.now();
    } finally {
      setBusyLabel(null);
    }
  }, [draft, refresh]);

  const placeBid = useCallback(
    async (entryId: string, salary?: number, years?: number) => {
      if (!draft) {
        return;
      }

      // Use provided salary/years or fall back to form state for backwards compatibility
      const salaryAmount = salary ?? (
        bidForms[entryId] ? Number.parseInt(bidForms[entryId].salaryAmount, 10) : 0
      );
      const contractYears = years ?? (
        bidForms[entryId] ? Number.parseInt(bidForms[entryId].contractYears, 10) : 0
      );
      
      // VA-S12: Clear any previous bid error for this entry
      setBidErrors(prev => ({
        ...prev,
        [entryId]: { hasError: false, message: "" }
      }));
      
      // VAH-1: Simplified to open bidding only - removed blind bid UI complexity
      setBusyLabel("Placing Open Bid");
      setError(null);
      try {
        // Make API call and wait for response
        await requestJson<EnhancedAuctionRoomProjection>(
          `/api/drafts/${draft.id}/auction/open-bids`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              poolEntryId: entryId,
              salaryAmount,
              contractYears,
            }),
          },
          "Failed to place open bid.",
        );
        
        // VA-S12: Clear bid form only on successful submission
        setBidForms(prev => ({
          ...prev,
          [entryId]: { salaryAmount: "", contractYears: "" }
        }));
        
        // Refresh room data to get latest authoritative state
        setBusyLabel("Refreshing Auction State");
        await refresh();
        // Reset the last refresh timestamp after manual refresh
        lastRefreshRef.current = Date.now();      } catch (error) {
        // VA-S12: Handle bid rejection errors with inline validation
        const rejectionContext = extractBidRejectionContext(error);
        
        if (rejectionContext.friendlyMessage || rejectionContext.rejectionType) {
          // This is a bid rejection - show inline error and preserve form state
          setBidErrors(prev => ({
            ...prev,
            [entryId]: {
              hasError: true,
              message: rejectionContext.friendlyMessage || "Bid was rejected. Please review and try again.",
              rejectionType: rejectionContext.rejectionType,
              context: rejectionContext.context
            }
          }));
          
          // VA-S24: For awarded players, refresh to guide user back to finalized state
          if (rejectionContext.rejectionType === "WRONG_ENTRY_STATUS" && 
              rejectionContext.context?.poolEntryStatus === "AWARDED") {
            // Player was awarded while user had stale UI - refresh to show finalized state
            setBusyLabel("Refreshing to Show Final State");
            await refresh();
            lastRefreshRef.current = Date.now();
          }
          // For other bid rejections, don't refresh room data - let user correct and resubmit
        } else {
          // This is a different kind of error - use existing error handling
          throw error;
        }
      } finally {
        setBusyLabel(null);
      }
    },
    [bidForms, draft, refresh],
  );

  const submitReview = useCallback(
    async (entryId: string, winningBidId?: string, reason?: string) => {
      if (!draft) {
        return;
      }

      // Use provided parameters or fall back to form state for backwards compatibility 
      const review = winningBidId && reason ? { winningBidId, reason } : reviewState[entryId];
      if (!review) {
        return;
      }

      setBusyLabel("Resolving Bid Tie");
      setError(null);
      try {
        await requestJson<EnhancedAuctionRoomProjection>(
          `/api/drafts/${draft.id}/auction/review/${entryId}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(review),
          },
          "Failed to resolve bid tie.",
        );
        await refresh();
        // Reset the last refresh timestamp after manual refresh
        lastRefreshRef.current = Date.now();
      } finally {
        setBusyLabel(null);
      }
    },
    [draft, refresh, reviewState],
  );

  const refreshRoom = useCallback(async () => {
    if (!draft) {
      return;
    }

    setBusyLabel("Refreshing Auction Room");
    setError(null);
    try {
      await loadRoom(draft.id);
      // Reset the last refresh timestamp after manual refresh
      lastRefreshRef.current = Date.now();
    } finally {
      setBusyLabel(null);
    }
  }, [draft, loadRoom]);

  const selectedEmergencySet = useMemo(() => new Set(selectedPlayerIds), [selectedPlayerIds]);

  if (error && !setup) {
    return (
      <CanonicalRouteState
        eyebrow="Picks & Draft"
        title="Veteran Auction Workspace"
        description="Configure the veteran pool, manage the auction room, and review awards from one canonical workspace."
        tone="error"
        message="Veteran Auction Workspace could not load."
        safetyCopy={`${error} Auction data remains unchanged. Refresh to retry, or return to Picks & Draft.`}
        actionHref="/draft"
        actionLabel="Back to Picks & Draft"
        testId="veteran-auction-route-state"
      />
    );
  }

  if (!setup) {
    return (
      <CanonicalRouteState
        eyebrow="Picks & Draft"
        title="Veteran Auction Workspace"
        description="Configure the veteran pool, manage the auction room, and review awards from one canonical workspace."
        tone="loading"
        message="Loading veteran auction setup, pool state, and room status."
        safetyCopy="Auction data remains secure while the workspace loads."
        testId="veteran-auction-route-state"
      />
    );
  }

  return (
    <div className="space-y-2" data-testid="veteran-auction-workspace">
      <section className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Veteran Auction</h2>
              <p className="text-sm text-slate-400">
                {draft
                  ? `${draft.title} · ${formatStatus(draft.status)} · ${setup.config.auctionMode === "EMERGENCY_FILL_IN" ? "Emergency fill-in" : "Standard auction"}`
                  : `${setup.defaultTitle} · Setup required`}
              </p>
            </div>
          </div>
          <Link
            href="/draft"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
          >
            ← Back
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {busyLabel ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
          {busyLabel}...
        </div>
      ) : null}

      {isSetupView ? (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Auction setup</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">Pool Generation and Start Controls</h3>
            <p className="mt-2 text-sm text-slate-400">
              Configure the auction session, generate the veteran pool, and start the room from the same canonical workflow.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Included</div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{setup.status.includedCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Excluded</div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{setup.status.excludedCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Review State</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {formatEnumLabel(setup.status.reviewState)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Ready To Start</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {setup.status.readyForStart ? "Ready" : "Blocked"}
              </div>
            </div>
          </div>

          {canManageSetup ? (
            <div className="space-y-6" data-testid="veteran-auction-setup-controls">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">Draft Title</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">Auction Mode</span>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={auctionMode}
                    onChange={(event) =>
                      setAuctionMode(event.target.value as "STANDARD" | "EMERGENCY_FILL_IN")
                    }
                  >
                    <option value="STANDARD">Standard Veteran Auction</option>
                    <option value="EMERGENCY_FILL_IN">Emergency Fill-In</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">Auction Ends At</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={auctionEndsAt}
                    onChange={(event) => setAuctionEndsAt(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">Open Bid Window (seconds)</span>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={openWindowSeconds}
                    onChange={(event) => setOpenWindowSeconds(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">Bid Reset Window (seconds)</span>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={resetWindowSeconds}
                    onChange={(event) => setResetWindowSeconds(event.target.value)}
                  />
                </label>
              </div>

              {auctionMode === "EMERGENCY_FILL_IN" ? (
                <div className="space-y-4 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-amber-100">Emergency Fill-In Pool</h3>
                      <p className="mt-1 text-sm text-amber-200/80">
                        Select a narrow list of eligible veterans for commissioner-run emergency acquisition.
                      </p>
                    </div>
                    <input
                      className="rounded-lg border border-amber-700/60 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      placeholder="Filter emergency candidates"
                      value={candidateSearch}
                      onChange={(event) => setCandidateSearch(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {setup.emergencyCandidates.map((candidate) => {
                      const checked = selectedEmergencySet.has(candidate.id);
                      return (
                        <label
                          key={candidate.id}
                          className="flex items-start gap-3 rounded-lg border border-amber-900/50 bg-slate-950/50 px-3 py-3 text-sm text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setSelectedPlayerIds((current) =>
                                event.target.checked
                                  ? [...current, candidate.id]
                                  : current.filter((value) => value !== candidate.id),
                              );
                            }}
                          />
                          <span>
                            <span className="font-medium text-slate-100">{candidate.name}</span>
                            <span className="ml-2 text-slate-400">
                              {candidate.position} · {candidate.nflTeam ?? "FA"} · Rank {candidate.draftRank ?? "-"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => generatePool(false)}
                  disabled={Boolean(setup.draft && !setup.status.canRegenerate)}
                  className="rounded-lg border border-sky-700 bg-sky-950/40 px-4 py-2 text-sm font-medium text-sky-100 hover:border-sky-500"
                >
                  {setup.draft ? "Generate Auction Pool" : "Create Auction & Generate Pool"}
                </button>
                {setup.draft ? (
                  <>
                    <button
                      type="button"
                      onClick={() => generatePool(true)}
                      disabled={!setup.status.canRegenerate}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      Regenerate Pool
                    </button>
                    <button
                      type="button"
                      onClick={finalizePool}
                      disabled={!setup.status.canFinalize}
                      className="rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-100 hover:border-amber-500 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      {setup.status.isFinalized ? "Pool Finalized" : "Finalize Pool"}
                    </button>
                    <button
                      type="button"
                      onClick={startAuction}
                      disabled={!setup.status.readyForStart}
                      className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-500 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      Start Veteran Auction
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
              Commissioner setup controls stay on the commissioner view. Managers can review the pool once the room is live.
            </div>
          )}

          {setup.status.blockers.length > 0 ? (
            <ul className="space-y-2">
              {setup.status.blockers.map((blocker) => (
                <li
                  key={blocker.code}
                  className="rounded-lg border border-rose-700/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-100"
                >
                  {blocker.message}
                </li>
              ))}
            </ul>
          ) : null}

          {setup.warnings.length > 0 ? (
            <ul className="space-y-2">
              {setup.warnings.map((warning) => (
                <li
                  key={warning.code}
                  className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-100">Current Pool</h3>
            {setup.poolEntries.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-400">
                No veteran auction pool has been generated yet. Generate the pool to review eligible veterans before the room opens.
              </p>
            ) : (
              setup.poolEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-100">
                        {entry.player.name}
                      </h4>
                      <p className="text-sm text-slate-400">
                        {entry.player.position} · {entry.player.nflTeam ?? "FA"} · Rank {entry.player.draftRank ?? "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {formatStatus(entry.status)}
                      </p>
                      <p className="text-sm text-slate-300">
                        Leader {entry.currentLeadingTeam?.abbreviation ?? "-"} {formatMoney(entry.currentLeadingBidAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-100">Excluded Players</h3>
            {setup.excludedPlayers.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-400">
                No excluded players were recorded for the current auction pool snapshot.
              </p>
            ) : (
              setup.excludedPlayers.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-100">
                        {entry.player.name}
                      </h4>
                      <p className="text-sm text-slate-400">
                        {entry.player.position} · {entry.player.nflTeam ?? "FA"} · Rank {entry.player.draftRank ?? "-"}
                      </p>
                      {entry.player.ownerTeam ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Controlled by {entry.player.ownerTeam.name} ({entry.player.ownerTeam.abbreviation ?? "—"})
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {formatEnumLabel(entry.reason)}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        {entry.reasons.map((reason) => formatEnumLabel(reason)).join(" / ")}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-2">
          <CompactRoomStatus
            title={draft?.title || "Veteran Auction"}
            auctionEndsAt={room?.config.auctionEndsAt || null}
            auctionMode={room?.config.auctionMode || "STANDARD"}
            isAuctionComplete={isAuctionComplete}
            summary={room?.summary}
            onRefresh={refreshRoom}
            onSyncStatus={room?.permissions.canSyncStatus ? syncStatus : undefined}
            canSyncStatus={room?.permissions.canSyncStatus}
          />

          {room?.warnings.length ? (
            <ul className="space-y-2">
              {room.warnings.map((warning) => (
                <li
                  key={warning.code}
                  className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Responsive Auction Layout handles all screen sizes */}
          {room && (
            <ResponsiveAuctionLayout
              room={room}
              selectedPlayerId={selectedPlayerId}
              onPlayerSelect={setSelectedPlayerId}
              onPlaceBid={placeBid}
              onSubmitReview={submitReview}
              onBidFormChange={setProjectedBid}
              isLoading={Boolean(busyLabel)}
              projectedBid={projectedBid}
              bidErrors={bidErrors}
            />
          )}
        </section>
      )}
    </div>
  );
}
