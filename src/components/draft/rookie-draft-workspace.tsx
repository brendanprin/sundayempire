"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { requestJson } from "@/lib/client-request";
import { formatEnumLabel } from "@/lib/format-label";
import type {
  DraftOrderEntryCorrectionResponse,
  DraftSetupProjection,
  DraftSetupResponse,
  RookieDraftActionResponse,
  RookieDraftRoomProjection,
} from "@/types/draft";

type PlayerFilters = {
  search: string;
  position: string;
  tier: string;
  availability: "ALL" | "AVAILABLE_ONLY";
  boardOrder: "BEST_RANK" | "BEST_TIER" | "LATER_RANK";
};

type CorrectionState = {
  selectingTeamId: string;
  owningTeamId: string;
  reason: string;
};

const DEFAULT_FILTERS: PlayerFilters = {
  search: "",
  position: "ALL",
  tier: "ALL",
  availability: "ALL",
  boardOrder: "BEST_RANK",
};

function resolveBoardOrderFilters(boardOrder: PlayerFilters["boardOrder"]) {
  if (boardOrder === "BEST_TIER") {
    return {
      sortBy: "tier",
      sortDir: "asc",
    };
  }

  if (boardOrder === "LATER_RANK") {
    return {
      sortBy: "rank",
      sortDir: "desc",
    };
  }

  return {
    sortBy: "rank",
    sortDir: "asc",
  };
}

function buildRoomFilterRequest(activeFilters: PlayerFilters) {
  const boardOrder = resolveBoardOrderFilters(activeFilters.boardOrder);

  return {
    search: activeFilters.search.trim(),
    position: activeFilters.position,
    tier: activeFilters.tier,
    availableOnly: activeFilters.availability === "AVAILABLE_ONLY",
    sortBy: boardOrder.sortBy,
    sortDir: boardOrder.sortDir,
  };
}

function serializeRoomFilterRequest(draftId: string, activeFilters: PlayerFilters) {
  return JSON.stringify({
    draftId,
    ...buildRoomFilterRequest(activeFilters),
  });
}

function formatStatus(status: string) {
  return formatEnumLabel(status);
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toLocaleString()}`;
}

function formatTeamLabel(team: { name: string; abbreviation: string | null }) {
  return team.abbreviation ?? team.name;
}

function formatFuturePickLabel(
  futurePick: {
    seasonYear: number;
    round: number;
    overall: number | null;
  } | null,
) {
  if (!futurePick) {
    return "Manual slot";
  }

  return `${futurePick.seasonYear} R${futurePick.round}${futurePick.overall ? ` (#${futurePick.overall})` : ""}`;
}

function buildCorrectionState(setup: DraftSetupProjection) {
  return Object.fromEntries(
    setup.entries.map((entry) => [
      entry.id,
      {
        selectingTeamId: entry.selectingTeam.id,
        owningTeamId: entry.owningTeam.id,
        reason: entry.overrideReason ?? "",
      } satisfies CorrectionState,
    ]),
  ) as Record<string, CorrectionState>;
}

export function RookieDraftWorkspace() {
  const [setup, setSetup] = useState<DraftSetupProjection | null>(null);
  const [room, setRoom] = useState<RookieDraftRoomProjection | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [filters, setFilters] = useState<PlayerFilters>(DEFAULT_FILTERS);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, CorrectionState>>({});
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRoomFilterKey, setPendingRoomFilterKey] = useState<string | null>(null);
  const latestRoomRequestId = useRef(0);
  const latestRoomRequestKeyRef = useRef<string | null>(null);

  const loadSetup = useCallback(async () => {
    const payload = await requestJson<DraftSetupResponse>(
      "/api/drafts/setup",
      undefined,
      "Failed to load rookie draft setup.",
    );
    setSetup(payload.setup);
    setCorrections(buildCorrectionState(payload.setup));
    setDraftTitle((current) => current || payload.setup.defaultTitle);
    return payload.setup;
  }, []);

  const loadRoom = useCallback(async (draftId: string, activeFilters: PlayerFilters) => {
    const roomFilterRequest = buildRoomFilterRequest(activeFilters);
    const requestId = latestRoomRequestId.current + 1;
    const requestKey = serializeRoomFilterRequest(draftId, activeFilters);
    latestRoomRequestId.current = requestId;
    latestRoomRequestKeyRef.current = requestKey;
    setPendingRoomFilterKey(requestKey);
    const params = new URLSearchParams();
    if (roomFilterRequest.search) {
      params.set("search", roomFilterRequest.search);
    }
    if (roomFilterRequest.position !== "ALL") {
      params.set("position", roomFilterRequest.position);
    }
    if (roomFilterRequest.tier !== "ALL") {
      params.set("tier", roomFilterRequest.tier);
    }
    if (roomFilterRequest.availableOnly) {
      params.set("availableOnly", "true");
    }
    params.set("sortBy", roomFilterRequest.sortBy);
    params.set("sortDir", roomFilterRequest.sortDir);

    try {
      const payload = await requestJson<RookieDraftRoomProjection>(
        `/api/drafts/${draftId}/room?${params.toString()}`,
        undefined,
        "Failed to load rookie draft room.",
      );
      if (requestId === latestRoomRequestId.current) {
        setRoom(payload);
      }
      return payload;
    } finally {
      if (requestId === latestRoomRequestId.current) {
        setPendingRoomFilterKey(null);
      }
    }
  }, []);

  const refresh = useCallback(async (nextFilters?: PlayerFilters) => {
    const resolvedFilters = nextFilters ?? filters;
    const nextSetup = await loadSetup();

    if (nextSetup.draft && nextSetup.draft.status !== "NOT_STARTED") {
      await loadRoom(nextSetup.draft.id, resolvedFilters);
    } else {
      setRoom(null);
    }
  }, [filters, loadRoom, loadSetup]);

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
          requestError instanceof Error ? requestError.message : "Failed to load rookie draft workspace.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [refresh]);

  const draft = room?.draft ?? setup?.draft ?? null;
  const isSetupView = !draft || draft.status === "NOT_STARTED";
  const teamOptions = setup?.teams ?? [];
  const currentPickTeamName = room?.viewer.currentPickTeamName ?? room?.currentPick?.selectingTeam.name ?? "the team on the clock";
  const viewerIsOnTheClock = Boolean(room?.viewer.isOnTheClock);
  const viewerIsCommissionerOverride = Boolean(room?.viewer.isCommissionerOverride);
  const viewerIsWaiting =
    Boolean(room?.currentPick) && !viewerIsOnTheClock && !viewerIsCommissionerOverride && draft?.status !== "COMPLETED";
  const roomStatusTitle =
    draft?.status === "COMPLETED"
      ? "Draft complete"
      : viewerIsOnTheClock
        ? "You are on the clock"
        : viewerIsWaiting
          ? `${currentPickTeamName} is on the clock`
          : viewerIsCommissionerOverride
            ? `${currentPickTeamName} on the clock`
            : room?.currentPick
              ? `${room.currentPick.selectingTeam.name} on the clock`
        : draft?.status === "IN_PROGRESS"
          ? "Waiting for the next pick"
          : "Draft board ready";
  const roomStatusCopy =
    draft?.status === "COMPLETED"
      ? "All rookie draft slots have been resolved."
      : room?.currentPick
        ? null
        : "The room is live, but the next pick has not synced yet. Refresh the room to confirm the latest state.";
  const roomActionHeading = room?.permissions.canForfeit
    ? "Commissioner room controls"
    : room?.permissions.canPass
      ? "Current pick actions"
      : "Room tools";
  const roomActionCopy = room?.permissions.canForfeit
    ? "Commissioners can forfeit the current slot here when the room needs intervention."
    : room?.permissions.canPass
      ? "The selecting team can pass this pick or make the selection from the rookie-only prospect pool below."
      : "Refresh the room to confirm the latest pick and board status.";
  const hasSecondaryRoomActions = Boolean(room?.permissions.canForfeit);
  const roomStatusEyebrow =
    draft?.status === "COMPLETED"
      ? "Draft complete"
      : viewerIsOnTheClock
        ? "Your pick"
        : viewerIsWaiting
          ? "Waiting"
          : viewerIsCommissionerOverride
            ? "Commissioner view"
            : room?.currentPick
              ? "On the clock"
        : "Room status";
  const roomStatusEmphasisCopy =
    draft?.status === "COMPLETED"
      ? "All rookie draft slots have been resolved."
      : viewerIsOnTheClock
        ? "You are on the clock. Make the selection from the decision panel below, or pass the slot if no rookie should be drafted."
        : viewerIsWaiting
          ? `You are not on the clock. Review prospects while ${currentPickTeamName} selects. The draft action will unlock when your team is up.`
          : viewerIsCommissionerOverride
            ? `Commissioner action is available while ${currentPickTeamName} is on the clock. You can still review the room before intervening.`
            : room?.currentPick
              ? "The active selection happens from the rookie prospect pool below. Keep this card pinned as the live pick context while the room is open."
        : roomStatusCopy;
  const availablePlayers = useMemo(() => room?.availablePlayers ?? [], [room?.availablePlayers]);
  const selectedProspect = availablePlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const canDraftSelectedProspect = Boolean(
    selectedProspect && room?.permissions.canSelect && !selectedProspect.isRestricted && room?.currentPick,
  );
  const currentPickSlotLabel = room?.currentPick
    ? `${room.currentPick.round}.${room.currentPick.pickNumber}`
    : null;
  const activeRoomFilterRequest = useMemo(() => buildRoomFilterRequest(filters), [filters]);
  const activeRoomFilterKey = draft ? serializeRoomFilterRequest(draft.id, filters) : null;
  const roomMatchesActiveFilters = Boolean(
    room &&
      draft &&
      room.draft.id === draft.id &&
      room.filters.search === activeRoomFilterRequest.search &&
      room.filters.position === activeRoomFilterRequest.position &&
      room.filters.tier === activeRoomFilterRequest.tier &&
      room.filters.availableOnly === activeRoomFilterRequest.availableOnly &&
      room.filters.sortBy === activeRoomFilterRequest.sortBy &&
      room.filters.sortDir === activeRoomFilterRequest.sortDir,
  );
  const isUpdatingBoardFilters = Boolean(activeRoomFilterKey && pendingRoomFilterKey === activeRoomFilterKey);
  const roomStatusCardClass =
    draft?.status === "COMPLETED"
      ? "border-slate-800 bg-slate-950/80"
      : viewerIsOnTheClock
        ? "border-emerald-400/40 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_42%),linear-gradient(155deg,rgba(2,6,23,0.98),rgba(6,78,59,0.92))] shadow-[0_24px_80px_rgba(16,185,129,0.16)]"
        : viewerIsCommissionerOverride
          ? "border-amber-400/35 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_42%),linear-gradient(155deg,rgba(2,6,23,0.98),rgba(69,26,3,0.9))] shadow-[0_24px_80px_rgba(245,158,11,0.14)]"
          : room?.currentPick
            ? "border-slate-700/90 bg-[linear-gradient(155deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] shadow-[0_18px_60px_rgba(2,6,23,0.28)]"
            : "border-slate-800 bg-slate-950/80";
  const decisionPanelToneClass = viewerIsOnTheClock
    ? "border-emerald-500/30 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),transparent_46%),rgba(2,6,23,0.76)]"
    : viewerIsCommissionerOverride
      ? "border-amber-500/25 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),transparent_46%),rgba(2,6,23,0.74)]"
      : viewerIsWaiting
        ? "border-slate-700/80 bg-slate-950/60"
        : "border-slate-800/80 bg-slate-950/70";
  const decisionStateLabel = viewerIsOnTheClock
    ? "Your pick"
    : viewerIsWaiting
      ? `Waiting on ${currentPickTeamName}`
      : viewerIsCommissionerOverride
        ? "Commissioner action"
        : "Review prospects";
  const decisionStateCopy = viewerIsOnTheClock
    ? "You are on the clock. Make the selection from the decision panel."
    : viewerIsWaiting
      ? `You are not on the clock. Review prospects while ${currentPickTeamName} selects.`
      : viewerIsCommissionerOverride
        ? `${currentPickTeamName} is on the clock. Commissioner action is available if the room needs intervention.`
        : "Review prospects and keep the board context in view.";
  const decisionStateBadgeClass = viewerIsOnTheClock
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
    : viewerIsWaiting
      ? "border-slate-700 bg-slate-900/80 text-slate-200"
      : viewerIsCommissionerOverride
        ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
        : "border-slate-700 bg-slate-900/80 text-slate-300";
  const decisionActionCardClass = viewerIsOnTheClock
    ? "rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-4 shadow-[0_18px_48px_rgba(16,185,129,0.12)]"
    : viewerIsCommissionerOverride
      ? "rounded-xl border border-amber-500/30 bg-amber-950/15 p-4"
      : viewerIsWaiting
        ? "rounded-xl border border-slate-700/90 bg-slate-950/80 p-4"
        : "rounded-xl border border-slate-800 bg-slate-900/70 p-4";
  const primaryActionButtonClass = viewerIsOnTheClock
    ? "w-full rounded-lg border border-emerald-600 bg-emerald-950/35 px-4 py-2.5 text-sm font-medium text-emerald-50 transition enabled:hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500"
    : viewerIsCommissionerOverride
      ? "w-full rounded-lg border border-amber-600 bg-amber-950/25 px-4 py-2.5 text-sm font-medium text-amber-50 transition enabled:hover:border-amber-400 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500"
      : "w-full rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-100 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500";
  const selectedProspectActionLabel = !selectedProspect
    ? viewerIsOnTheClock
      ? "Select a rookie to make the pick"
      : viewerIsWaiting
        ? `Waiting on ${currentPickTeamName}`
        : viewerIsCommissionerOverride
          ? "Commissioner action available"
          : "Select a rookie prospect"
    : selectedProspect.isRestricted
      ? "Prospect unavailable"
      : viewerIsOnTheClock && canDraftSelectedProspect
        ? `Make Pick: ${selectedProspect.name}${currentPickSlotLabel ? ` at ${currentPickSlotLabel}` : ""}`
        : viewerIsCommissionerOverride && canDraftSelectedProspect
          ? `Commissioner Pick: ${selectedProspect.name}${currentPickSlotLabel ? ` at ${currentPickSlotLabel}` : ""}`
        : draft?.status === "COMPLETED"
          ? "Draft complete"
          : viewerIsWaiting
            ? `Waiting on ${currentPickTeamName}`
            : "Selection unavailable";
  const selectedProspectActionCopy = !selectedProspect
    ? viewerIsOnTheClock
      ? "You are on the clock. Select a rookie to activate the draft action, or pass the slot below if no rookie should be drafted."
      : viewerIsWaiting
        ? `You are not on the clock. Review prospects while ${currentPickTeamName} selects. The draft action will unlock when your team is up.`
        : viewerIsCommissionerOverride
          ? `Commissioner action is available while ${currentPickTeamName} is on the clock. Review prospects here if the room needs intervention.`
          : "Click any rookie in the prospect pool to open the decision panel."
    : selectedProspect.isRestricted
      ? `${selectedProspect.name} is currently restricted and cannot be selected from this rookie room.`
      : viewerIsOnTheClock && canDraftSelectedProspect
        ? `Make the pick for ${room?.currentPick?.selectingTeam.name ?? "the team on the clock"} directly from this panel, or pass the slot below if no rookie should be drafted.`
        : viewerIsCommissionerOverride && canDraftSelectedProspect
          ? `Commissioner action is active while ${currentPickTeamName} is on the clock. You can make the selection from this panel or pass the slot below if the room needs intervention.`
          : viewerIsWaiting
            ? `You are not on the clock. Review ${selectedProspect.name} while ${currentPickTeamName} selects. The draft action will unlock when your team is up.`
          : "The room is waiting for the next live pick to sync before a selection can be made.";
  const hasActiveProspectFilters =
    filters.search.trim().length > 0 ||
    filters.position !== DEFAULT_FILTERS.position ||
    filters.tier !== DEFAULT_FILTERS.tier ||
    filters.availability !== DEFAULT_FILTERS.availability;

  const boardRows = useMemo(() => {
    if (room) {
      return room.board;
    }

    return (
      setup?.entries.map((entry) => ({
        id: entry.id,
        pickNumber: entry.pickNumber,
        round: entry.round,
        status: entry.draftPick?.status ?? "PENDING",
        selectingTeam: entry.selectingTeam,
        owningTeam: entry.owningTeam,
        originalTeam: entry.originalTeam,
        futurePick: entry.futurePick
          ? {
              ...entry.futurePick,
              isUsed: false,
            }
          : null,
        selection: null,
      })) ?? []
    );
  }, [room, setup]);

  const setupWarnings = setup?.warnings ?? [];
  const roomWarnings = room?.warnings ?? [];

  const flowRailPicks = useMemo(() => boardRows.filter((pick) => pick.round <= 2), [boardRows]);
  const currentFlowRailIndex = useMemo(() => {
    if (!room?.currentPick || draft?.status === "COMPLETED") {
      return -1;
    }

    return flowRailPicks.findIndex((pick) => pick.id === room.currentPick?.id);
  }, [draft?.status, flowRailPicks, room?.currentPick]);

  useEffect(() => {
    if (availablePlayers.length === 0) {
      setSelectedPlayerId(null);
      return;
    }

    setSelectedPlayerId((current) =>
      current && availablePlayers.some((player) => player.id === current) ? current : availablePlayers[0]?.id ?? null,
    );
  }, [availablePlayers]);

  useEffect(() => {
    if (!draft || isSetupView || !activeRoomFilterKey || roomMatchesActiveFilters) {
      return;
    }

    if (pendingRoomFilterKey === activeRoomFilterKey) {
      return;
    }

    const requestKey = activeRoomFilterKey;
    const delayMs = room?.filters.search !== activeRoomFilterRequest.search ? 180 : 0;
    const timeoutId = window.setTimeout(() => {
      setError(null);
      void loadRoom(draft.id, filters).catch((requestError) => {
        if (latestRoomRequestKeyRef.current !== requestKey) {
          return;
        }

        setError(
          requestError instanceof Error ? requestError.message : "Failed to update rookie board filters.",
        );
      });
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeRoomFilterKey,
    activeRoomFilterRequest.search,
    draft,
    filters,
    isSetupView,
    loadRoom,
    pendingRoomFilterKey,
    room?.filters.search,
    roomMatchesActiveFilters,
  ]);

  const runSetup = useCallback(
    async (regenerate: boolean) => {
      setBusyLabel(regenerate ? "Regenerating Board" : "Generating Board");
      setError(null);
      try {
        const payload = await requestJson<DraftSetupResponse>(
          "/api/drafts/setup",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              draftId: setup?.draft?.id ?? null,
              title: draftTitle,
              regenerate,
            }),
          },
          "Failed to prepare rookie draft board.",
        );
        setSetup(payload.setup);
        setCorrections(buildCorrectionState(payload.setup));
        if (payload.setup.draft && payload.setup.draft.status !== "NOT_STARTED") {
          await loadRoom(payload.setup.draft.id, filters);
        } else {
          setRoom(null);
        }
      } finally {
        setBusyLabel(null);
      }
    },
    [draftTitle, filters, loadRoom, setup?.draft?.id],
  );

  const startDraft = useCallback(async () => {
    if (!setup?.draft) {
      return;
    }

    setBusyLabel("Starting Draft");
    setError(null);
    try {
      await requestJson<RookieDraftActionResponse>(
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
        "Failed to start rookie draft.",
      );
      await refresh();
    } finally {
      setBusyLabel(null);
    }
  }, [refresh, setup?.draft]);

  const submitCorrection = useCallback(
    async (entryId: string) => {
      if (!setup?.draft) {
        return;
      }

      const correction = corrections[entryId];
      if (!correction) {
        return;
      }

      setBusyLabel(`Saving Pick ${entryId}`);
      setError(null);
      try {
        const payload = await requestJson<DraftOrderEntryCorrectionResponse>(
          `/api/drafts/${setup.draft.id}/order-entries/${entryId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(correction),
          },
          "Failed to correct rookie draft order.",
        );
        setSetup(payload.setup);
        setCorrections(buildCorrectionState(payload.setup));
      } finally {
        setBusyLabel(null);
      }
    },
    [corrections, setup?.draft],
  );

  const runRoomAction = useCallback(
    async (label: string, path: string, body?: Record<string, unknown>) => {
      if (!draft) {
        return;
      }

      setBusyLabel(label);
      setError(null);
      try {
        await requestJson<RookieDraftActionResponse>(
          path,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(body ?? {}),
          },
          `Failed to ${label.toLowerCase()}.`,
        );
        await refresh();
      } finally {
        setBusyLabel(null);
      }
    },
    [draft, refresh],
  );

  if (error && !setup) {
    return (
      <CanonicalRouteState
        eyebrow="Picks & Draft"
        title="Rookie Draft Workspace"
        description="Review the generated order, correct slots when needed, and manage the live rookie room from one workspace."
        tone="error"
        message="Rookie Draft Workspace could not load."
        safetyCopy={`${error} Existing draft order and room records are unchanged. Refresh to retry, or return to Picks & Draft.`}
        actionHref="/draft"
        actionLabel="Back to Picks & Draft"
        testId="rookie-draft-route-state"
      />
    );
  }

  if (!setup) {
    return (
      <CanonicalRouteState
        eyebrow="Picks & Draft"
        title="Rookie Draft Workspace"
        description="Review the generated order, correct slots when needed, and manage the live rookie room from one workspace."
        tone="loading"
        message="Loading rookie draft setup, generated order, and room status."
        safetyCopy="Existing draft setup and room records stay unchanged while the workspace loads."
        testId="rookie-draft-route-state"
      />
    );
  }

  return (
    <div className="space-y-3 md:space-y-4" data-testid="rookie-draft-workspace">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Picks & Draft</p>
            <h2 className="mt-1 text-[1.85rem] font-semibold text-slate-100 md:text-[1.95rem]">Rookie Draft Workspace</h2>
            <p className="mt-1 text-sm text-slate-400">
              {draft
                ? `${draft.title} · ${formatStatus(draft.status)} · Pick ${draft.progress.currentPickNumber ?? "-"} of ${draft.progress.totalPicks}`
                : `${setup.defaultTitle} · Create a rookie draft session, generate the board, then start the room.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/draft"
              className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-sm text-slate-200 hover:border-slate-500"
            >
              Back to Picks & Draft
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {busyLabel ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2 text-sm text-slate-300">
          {busyLabel}...
        </div>
      ) : null}

      {/* On the clock banner — shown at the top whenever the draft is live */}
      {draft?.status === "IN_PROGRESS" && room?.currentPick && (
        <div
          className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 ${
            viewerIsOnTheClock
              ? "border-emerald-500/50 bg-[radial-gradient(circle_at_left,rgba(16,185,129,0.18),transparent_60%),rgba(2,6,23,0.9)] shadow-[0_8px_32px_rgba(16,185,129,0.14)]"
              : "border-amber-500/30 bg-amber-950/20"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`text-lg ${viewerIsOnTheClock ? "text-emerald-300" : "text-amber-300"}`}>
              {viewerIsOnTheClock ? "🟢" : "⏳"}
            </span>
            <div>
              <p className={`text-sm font-semibold ${viewerIsOnTheClock ? "text-emerald-100" : "text-amber-100"}`}>
                {viewerIsOnTheClock
                  ? "You are on the clock"
                  : `${currentPickTeamName} is on the clock`}
              </p>
              <p className="text-xs text-slate-400">
                Pick {room.currentPick.round}.{room.currentPick.pickNumber}
                {viewerIsOnTheClock
                  ? " — Select a rookie from the prospect pool below or pass the slot."
                  : " — You can review prospects while they pick."}
              </p>
            </div>
          </div>
          {viewerIsOnTheClock && (
            <span className="shrink-0 animate-pulse rounded-full border border-emerald-500/60 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-200">
              Your pick
            </span>
          )}
        </div>
      )}

      {isSetupView ? (
        <div className="space-y-3 md:space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 md:p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Generated order setup</p>
            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-xl flex-1">
                <label className="text-sm font-medium text-slate-200" htmlFor="rookie-draft-title">
                  Session Title
                </label>
                <input
                  id="rookie-draft-title"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder={setup.defaultTitle}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {setup.permissions.canManage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => runSetup(false)}
                      className="rounded-lg border border-sky-700 bg-sky-950/40 px-4 py-2 text-sm font-medium text-sky-100 hover:border-sky-500"
                      data-testid="rookie-draft-generate-board-btn"
                    >
                      {setup.status.needsDraftCreation
                        ? "Create Draft & Generate Board"
                        : setup.status.needsBoardGeneration
                          ? "Generate Board"
                          : "Refresh Board"}
                    </button>
                    {setup.entries.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => runSetup(true)}
                        className="rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-100 hover:border-amber-500"
                      >
                        Regenerate Board
                      </button>
                    ) : null}
                    {setup.draft && setup.entries.length > 0 ? (
                      <button
                        type="button"
                        onClick={startDraft}
                        className="rounded-lg border border-emerald-700 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-500"
                      >
                        Start Rookie Draft
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Commissioner setup controls only. Managers can review the generated order once the room is live.
                  </p>
                )}
              </div>
            </div>

            {setupWarnings.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {setupWarnings.map((warning) => (
                  <li
                    key={warning.code}
                    className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
                  >
                    {warning.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Draft order</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-100">Generated Draft Order</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Review the generated order and apply commissioner corrections when league context requires it.
                </p>
              </div>
              <p className="text-sm text-slate-400" data-testid="rookie-draft-slot-count">{setup.entries.length} slots generated</p>
            </div>

            {setup.entries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No rookie board slots are generated yet. Create or regenerate the board to populate the draft order.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Pick</th>
                      <th className="px-3 py-2 text-left font-medium">Current Owner</th>
                      <th className="px-3 py-2 text-left font-medium">Selecting Team</th>
                      <th className="px-3 py-2 text-left font-medium">Future Pick</th>
                      <th className="px-3 py-2 text-left font-medium">Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.entries.map((entry) => {
                      const correction = corrections[entry.id] ?? {
                        selectingTeamId: entry.selectingTeam.id,
                        owningTeamId: entry.owningTeam.id,
                        reason: entry.overrideReason ?? "",
                      };

                      return (
                        <tr key={entry.id} className="border-b border-slate-800/70 last:border-b-0">
                          <td className="px-3 py-3 text-slate-200">
                            R{entry.round}.{entry.pickNumber}
                          </td>
                          <td className="px-3 py-3 text-slate-200">
                            {entry.owningTeam.abbreviation ?? entry.owningTeam.name}
                          </td>
                          <td className="px-3 py-3 text-slate-200">
                            {entry.selectingTeam.abbreviation ?? entry.selectingTeam.name}
                          </td>
                          <td className="px-3 py-3 text-slate-400">
                            {entry.futurePick
                              ? `${entry.futurePick.seasonYear} R${entry.futurePick.round}${entry.futurePick.overall ? ` (#${entry.futurePick.overall})` : ""}`
                              : "Manual slot"}
                          </td>
                          <td className="px-3 py-3">
                            {setup.permissions.canCorrectOrder ? (
                              <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
                                <select
                                  value={correction.owningTeamId}
                                  onChange={(event) =>
                                    setCorrections((current) => ({
                                      ...current,
                                      [entry.id]: {
                                        ...correction,
                                        owningTeamId: event.target.value,
                                      },
                                    }))
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                                >
                                  {teamOptions.map((team) => (
                                    <option key={`${entry.id}-own-${team.id}`} value={team.id}>
                                      {team.abbreviation ?? team.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={correction.selectingTeamId}
                                  onChange={(event) =>
                                    setCorrections((current) => ({
                                      ...current,
                                      [entry.id]: {
                                        ...correction,
                                        selectingTeamId: event.target.value,
                                      },
                                    }))
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                                >
                                  {teamOptions.map((team) => (
                                    <option key={`${entry.id}-sel-${team.id}`} value={team.id}>
                                      {team.abbreviation ?? team.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={correction.reason}
                                  onChange={(event) =>
                                    setCorrections((current) => ({
                                      ...current,
                                      [entry.id]: {
                                        ...correction,
                                        reason: event.target.value,
                                      },
                                    }))
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                                  placeholder="Reason for correction"
                                />
                                <button
                                  type="button"
                                  onClick={() => submitCorrection(entry.id)}
                                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:border-slate-500"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500">Read-only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          <section className={`grid gap-3 ${hasSecondaryRoomActions ? "xl:grid-cols-[1.65fr_0.95fr]" : ""}`}>
            <div
              className={`relative overflow-hidden rounded-[28px] border p-4 ${roomStatusCardClass}`}
              data-testid="rookie-draft-room-status"
            >
              <div className="absolute -right-20 top-0 h-52 w-52 rounded-full bg-sky-400/10 blur-3xl" aria-hidden />
              <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-sky-200/75">{roomStatusEyebrow}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {viewerIsOnTheClock ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-50">
                        <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                        Your pick
                      </span>
                    ) : viewerIsCommissionerOverride ? (
                      <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-50">
                        Commissioner action
                      </span>
                    ) : viewerIsWaiting ? (
                      <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-200">
                        Review while waiting
                      </span>
                    ) : room?.currentPick && draft?.status !== "COMPLETED" ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-100">
                        <span className="h-2 w-2 rounded-full bg-sky-300 animate-pulse" />
                        Live pick
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                        {formatStatus(draft?.status ?? "NOT_STARTED")}
                      </span>
                    )}
                    {room?.currentPick?.selectingTeam.abbreviation ? (
                      <span className="inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-200">
                        {room.currentPick.selectingTeam.abbreviation}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2.5 text-[1.65rem] font-semibold tracking-tight text-white md:text-[2rem]">
                    {roomStatusTitle}
                  </h3>
                  {roomStatusEmphasisCopy ? (
                    <p className="mt-1.5 max-w-2xl text-sm leading-5 text-slate-300">
                      {roomStatusEmphasisCopy}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {room?.currentPick && draft?.status !== "COMPLETED" ? (
                    <a
                      href="#rookie-prospect-pool"
                      className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-400/10 px-3.5 py-1.5 text-sm font-medium text-sky-100 transition hover:border-sky-300 hover:bg-sky-400/15"
                    >
                      Review Prospect Pool
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => refresh()}
                    className="inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/70 px-3.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                  >
                    Refresh Room
                  </button>
                </div>
              </div>
              {room?.currentPick && draft?.status !== "COMPLETED" ? (
                <div className="relative mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-sky-400/20 bg-slate-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Team on clock</p>
                    <p className="mt-1.5 text-lg font-semibold text-white">{room.currentPick.selectingTeam.name}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Round</p>
                    <p className="mt-1.5 text-3xl font-semibold text-white">{room.currentPick.round}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Current pick</p>
                    <p className="mt-1.5 text-3xl font-semibold text-white">{room.currentPick.pickNumber}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Salary slot</p>
                    <p className="mt-1.5 text-3xl font-semibold text-white">
                      {formatMoney(room.currentPick.salaryPreview)}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Future pick{" "}
                      {room.currentPick.futurePick?.overall
                        ? `#${room.currentPick.futurePick.overall}`
                        : "manual slot"}
                    </p>
                  </div>
                </div>
              ) : null}
              {!hasSecondaryRoomActions && roomWarnings.length > 0 ? (
                <ul className="relative mt-3 space-y-2">
                  {roomWarnings.map((warning) => (
                    <li
                      key={warning.code}
                      className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
                    >
                      {warning.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {hasSecondaryRoomActions ? (
              <div
                className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 shadow-[0_12px_40px_rgba(2,6,23,0.18)]"
                data-testid="rookie-draft-room-actions"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Room tools</p>
                <h3 className="mt-1.5 text-lg font-semibold text-slate-100">{roomActionHeading}</h3>
                <p className="mt-2 text-sm leading-5 text-slate-400">{roomActionCopy}</p>
                <div className="mt-3 grid gap-2">
                  {room?.permissions.canForfeit ? (
                    <button
                      type="button"
                      onClick={() => runRoomAction("Forfeiting Pick", `/api/drafts/${draft?.id}/actions/forfeit`)}
                      className="rounded-lg border border-red-700/70 bg-red-950/20 px-4 py-2.5 text-sm text-red-100 transition hover:border-red-500"
                    >
                      Forfeit Pick
                    </button>
                  ) : null}
                </div>
                {roomWarnings.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {roomWarnings.map((warning) => (
                      <li
                        key={warning.code}
                        className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
                      >
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>

          {flowRailPicks.length > 0 && (
            <section
              className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5"
              data-testid="rookie-draft-flow-context"
            >
              <div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Draft flow</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-100">Rounds 1-2 flow</h3>
                </div>

                <div className="mt-2.5 -mx-1 overflow-x-auto pb-1">
                  <ul className="flex min-w-max gap-2 px-1">
                    {flowRailPicks.map((pick, index) => {
                      const flowOffset = currentFlowRailIndex >= 0 ? index - currentFlowRailIndex : null;
                      const isCurrentPick =
                        room?.currentPick?.id === pick.id && draft?.status !== "COMPLETED";
                      const flowBadgeLabel = isCurrentPick
                        ? "On the clock"
                        : flowOffset === -1
                          ? "Last pick"
                          : flowOffset === -2
                            ? "Two ago"
                            : flowOffset !== null && flowOffset < -2
                              ? "Previous"
                              : flowOffset === 1
                                ? "On deck"
                                : flowOffset === 2
                                  ? "Two away"
                                  : flowOffset !== null && flowOffset > 2
                                    ? "Upcoming"
                                    : pick.selection
                                      ? "Made"
                                      : "Pending";

                      return (
                        <li
                          key={`flow-${pick.id}`}
                          className={`w-[15.5rem] shrink-0 rounded-xl px-3 py-2.5 ${
                            isCurrentPick
                              ? "border border-emerald-500/35 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),transparent_50%),rgba(2,6,23,0.88)] shadow-[0_16px_32px_rgba(16,185,129,0.12)]"
                              : "border border-slate-800 bg-slate-900/80"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-semibold ${isCurrentPick ? "text-white" : "text-slate-100"}`}>
                              R{pick.round}.{pick.pickNumber}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                                isCurrentPick
                                  ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                                  : "border border-slate-700 bg-slate-950 text-slate-400"
                              }`}
                            >
                              {flowBadgeLabel}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            <div>
                              <p className={`text-[10px] uppercase tracking-[0.16em] ${isCurrentPick ? "text-emerald-200/70" : "text-slate-500"}`}>
                                Team
                              </p>
                              <p className={`mt-1 text-sm font-medium ${isCurrentPick ? "text-white" : "text-slate-100"}`}>
                                {formatTeamLabel(pick.selectingTeam)}
                              </p>
                            </div>

                            <div>
                              <p className={`text-[10px] uppercase tracking-[0.16em] ${isCurrentPick ? "text-emerald-200/70" : "text-slate-500"}`}>
                                {pick.selection?.playerName ? "Player" : "Status"}
                              </p>
                              <p className={`mt-1 text-sm ${isCurrentPick ? "font-medium text-emerald-50" : "text-slate-200"}`}>
                                {isCurrentPick
                                  ? "Selecting now"
                                  : pick.selection?.playerName
                                    ? pick.selection.playerName
                                    : pick.selection
                                      ? formatStatus(pick.selection.outcome)
                                      : flowBadgeLabel}
                              </p>
                            </div>

                            <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs ${isCurrentPick ? "text-emerald-100/75" : "text-slate-500"}`}>
                              {pick.selection?.playerPosition ? <span>{pick.selection.playerPosition}</span> : null}
                              {pick.selection?.salary != null ? <span>{formatMoney(pick.selection.salary)}</span> : null}
                              {!pick.selection ? (
                                <span>{pick.futurePick ? formatFuturePickLabel(pick.futurePick) : "Manual slot"}</span>
                              ) : null}
                              {pick.owningTeam.id !== pick.selectingTeam.id ? (
                                <span>Owner {formatTeamLabel(pick.owningTeam)}</span>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <section
            id="rookie-prospect-pool"
            className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 scroll-mt-20"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Rookie prospects</p>
                <h3 className="mt-1.5 text-lg font-semibold text-slate-100 md:text-xl">Rookie Prospect Pool</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  Review only rookie-eligible players, then make the current selection from the live room.
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.7fr_repeat(4,minmax(0,0.9fr))_auto]">
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Find prospect</label>
                  <input
                    value={filters.search}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, search: event.target.value }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
                    placeholder="Search rookie board"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Position</label>
                  <select
                    value={filters.position}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, position: event.target.value }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
                  >
                    <option value="ALL">All positions</option>
                    <option value="QB">QB</option>
                    <option value="RB">RB</option>
                    <option value="WR">WR</option>
                    <option value="TE">TE</option>
                    <option value="K">K</option>
                    <option value="DST">DST</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Tier</label>
                  <select
                    value={filters.tier}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, tier: event.target.value }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
                  >
                    <option value="ALL">All tiers</option>
                    <option value="1">Tier 1</option>
                    <option value="2">Tier 2</option>
                    <option value="3">Tier 3</option>
                    <option value="4">Tier 4</option>
                    <option value="5_PLUS">Tier 5+</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Draftability</label>
                  <select
                    value={filters.availability}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        availability: event.target.value as PlayerFilters["availability"],
                      }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
                  >
                    <option value="ALL">All rookies</option>
                    <option value="AVAILABLE_ONLY">Draftable only</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Board order</label>
                  <select
                    value={filters.boardOrder}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        boardOrder: event.target.value as PlayerFilters["boardOrder"],
                      }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
                  >
                    <option value="BEST_RANK">Best rank first</option>
                    <option value="BEST_TIER">Best tier first</option>
                    <option value="LATER_RANK">Later rank first</option>
                  </select>
                </div>
                <div className="flex items-end">
                  {isUpdatingBoardFilters ? (
                    <p aria-live="polite" className="text-xs font-medium text-sky-200">
                      Updating board...
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_21rem] xl:items-start">
              <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/50">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Player</th>
                        <th className="px-3 py-2 text-right font-medium">Rank</th>
                        <th className="px-3 py-2 text-right font-medium">Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availablePlayers.map((player) => {
                        const isSelected = player.id === selectedProspect?.id;

                        return (
                          <tr
                            key={player.id}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            aria-label={`Select ${player.name}, ${player.position}, ${player.nflTeam ?? "free agent"}${player.isRestricted ? ", restricted" : ""}${isSelected ? ", currently selected" : ""}`}
                            onClick={() => setSelectedPlayerId(player.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedPlayerId(player.id);
                              }
                            }}
                            className={`cursor-pointer border-b border-slate-800/70 align-top transition last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400/70 focus-visible:-outline-offset-2 ${
                              isSelected
                                ? "bg-[linear-gradient(90deg,rgba(14,165,233,0.22),rgba(8,47,73,0.72)_12%,rgba(15,23,42,0.96)_100%)] shadow-[inset_4px_0_0_rgba(125,211,252,0.95),inset_0_1px_0_rgba(56,189,248,0.22),inset_0_-1px_0_rgba(56,189,248,0.16),0_12px_28px_rgba(8,145,178,0.12)]"
                                : "hover:bg-slate-900/70 focus-visible:bg-slate-900/70"
                            } ${player.isRestricted ? "opacity-75" : ""}`}
                          >
                            <th scope="row" className="px-3 py-3 text-left">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className={isSelected ? "font-semibold text-sky-50" : "font-medium text-slate-100"}>
                                    {player.name}
                                  </div>
                                  <div
                                    className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${
                                      isSelected ? "text-sky-100/80" : "text-slate-400"
                                    }`}
                                  >
                                    {player.position} · {player.nflTeam ?? "FA"}
                                    {player.isRestricted ? (
                                      <span className="rounded-full border border-amber-700/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-200">
                                        Restricted
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                {isSelected ? (
                                  <span className="rounded-full border border-sky-300/60 bg-sky-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-50 shadow-[0_0_0_1px_rgba(14,165,233,0.12),0_10px_24px_rgba(14,165,233,0.12)]">
                                    Selected
                                  </span>
                                ) : null}
                              </div>
                            </th>
                            <td className={`px-3 py-3 text-right ${isSelected ? "font-semibold text-sky-50" : "text-slate-200"}`}>
                              {player.draftRank ?? "-"}
                            </td>
                            <td className={`px-3 py-3 text-right ${isSelected ? "font-semibold text-sky-50" : "text-slate-200"}`}>
                              {player.draftTier ?? "-"}
                            </td>
                          </tr>
                        );
                      })}
                      {availablePlayers.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                            {hasActiveProspectFilters
                              ? "No rookie-eligible prospects match the current filters. Clear the filters to retry. If the list stays empty, no rookie pool is loaded for this season yet."
                              : "No rookie-eligible prospects are available for this room yet. This workspace only lists confirmed rookie-eligible players, so the pool will stay empty until a rookie pool is loaded."}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside
                className={`rounded-2xl border p-4 xl:sticky xl:top-20 ${decisionPanelToneClass}`}
                data-testid="rookie-prospect-decision-panel"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Decision panel</p>
                <div className="mt-2.5 rounded-xl border border-slate-800/80 bg-slate-950/65 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${decisionStateBadgeClass}`}
                    >
                      {decisionStateLabel}
                    </span>
                    {room?.currentPick?.selectingTeam.abbreviation ? (
                      <span className="inline-flex rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">
                        {room.currentPick.selectingTeam.abbreviation}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm leading-5 text-slate-300">{decisionStateCopy}</p>
                </div>
                {selectedProspect ? (
                  <div className="mt-3 space-y-4">
                    <div className="rounded-2xl border border-sky-800/40 bg-sky-950/20 p-3.5">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200/70">Selected prospect</p>
                      <h4 className="mt-1.5 text-[1.65rem] font-semibold text-white">{selectedProspect.name}</h4>
                      <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-slate-100">
                          {selectedProspect.position}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-slate-100">
                          {selectedProspect.nflTeam ?? "FA"}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-slate-300">
                          {selectedProspect.ownerTeam?.abbreviation ?? selectedProspect.ownerTeam?.name ?? "Free agent"}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Rank</p>
                        <p className="mt-1.5 text-3xl font-semibold text-white">{selectedProspect.draftRank ?? "-"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Tier</p>
                        <p className="mt-1.5 text-3xl font-semibold text-white">{selectedProspect.draftTier ?? "-"}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Current pick context</p>
                      <p className="mt-1.5 text-sm font-medium text-slate-100">
                        {room?.currentPick
                          ? `${room.currentPick.selectingTeam.name} selecting at R${room.currentPick.round}.${room.currentPick.pickNumber}`
                          : "Waiting for the next pick"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Salary slot{" "}
                        {room?.currentPick ? formatMoney(room.currentPick.salaryPreview) : "-"}
                      </p>
                    </div>

                    <div className={decisionActionCardClass}>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Draft action</p>
                      <p className="mt-1.5 text-sm leading-5 text-slate-300">{selectedProspectActionCopy}</p>
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          disabled={!canDraftSelectedProspect}
                          onClick={() =>
                            runRoomAction(
                              `Selecting ${selectedProspect.name}`,
                              `/api/drafts/${draft?.id}/actions/select`,
                              { playerId: selectedProspect.id },
                            )
                          }
                          className={primaryActionButtonClass}
                        >
                          {selectedProspectActionLabel}
                        </button>
                        {room?.permissions.canPass ? (
                          <button
                            type="button"
                            onClick={() => runRoomAction("Passing Pick", `/api/drafts/${draft?.id}/actions/pass`)}
                            className="w-full rounded-lg border border-slate-700/80 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                          >
                            Pass Pick
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-4 rounded-2xl border p-6 text-center ${
                      viewerIsOnTheClock
                        ? "border-emerald-500/30 bg-emerald-950/15"
                        : viewerIsWaiting
                          ? "border-slate-700 bg-slate-900/60"
                          : viewerIsCommissionerOverride
                            ? "border-amber-500/25 bg-amber-950/15"
                            : "border-slate-800 bg-slate-900/60"
                    }`}
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-400">
                      <span className="text-lg">+</span>
                    </div>
                    <p className="mt-4 text-sm font-medium text-slate-200">No prospect selected</p>
                    <p className="mt-2 text-xs leading-6 text-slate-400">
                      {selectedProspectActionCopy}
                    </p>
                    {room?.permissions.canPass ? (
                      <button
                        type="button"
                        onClick={() => runRoomAction("Passing Pick", `/api/drafts/${draft?.id}/actions/pass`)}
                        className="mt-4 inline-flex rounded-lg border border-slate-700/80 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                      >
                        Pass Pick
                      </button>
                    ) : null}
                  </div>
                )}
              </aside>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Live board</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-100">Live Rookie Board</h3>
              </div>
              <p className="text-sm text-slate-400">{boardRows.length} board slots</p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Pick</th>
                    <th className="px-3 py-2 text-left font-medium">Selecting Team</th>
                    <th className="px-3 py-2 text-left font-medium">Asset</th>
                    <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {boardRows.map((pick) => (
                    <tr key={pick.id} className="border-b border-slate-800/70 last:border-b-0">
                      <td className="px-3 py-3 text-slate-200">
                        R{pick.round}.{pick.pickNumber}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-100">
                          {pick.selectingTeam.abbreviation ?? pick.selectingTeam.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          Owner {pick.owningTeam.abbreviation ?? pick.owningTeam.name}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-400">
                        {pick.futurePick
                          ? `${pick.futurePick.seasonYear} R${pick.futurePick.round}${pick.futurePick.overall ? ` (#${pick.futurePick.overall})` : ""}`
                          : "Manual slot"}
                      </td>
                      <td className="px-3 py-3">
                        {pick.selection ? (
                          <div>
                            <div className="font-medium text-slate-100">
                              {pick.selection.playerName ?? formatStatus(pick.selection.outcome)}
                            </div>
                            <div className="text-xs text-slate-400">
                              {formatStatus(pick.selection.outcome)} · {formatMoney(pick.selection.salary)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">
                            {draft?.status === "COMPLETED"
                              ? "Unresolved at close"
                              : room?.currentPick?.id === pick.id
                                ? "On the clock"
                                : formatStatus(pick.status)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
