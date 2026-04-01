"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { TradeDecisionWorkspace } from "@/components/trades/trade-decision-workspace";
import { requestJson } from "@/lib/client-request";
import type {
  TradeBuilderContextResponse,
  TradeProposalDetailResponse,
} from "@/types/trade-workflow";

type SelectionState = {
  proposerPlayers: Set<string>;
  proposerPicks: Set<string>;
  counterpartyPlayers: Set<string>;
  counterpartyPicks: Set<string>;
};

function emptySelectionState(): SelectionState {
  return {
    proposerPlayers: new Set<string>(),
    proposerPicks: new Set<string>(),
    counterpartyPlayers: new Set<string>(),
    counterpartyPicks: new Set<string>(),
  };
}

function toggleInSet(previous: Set<string>, id: string) {
  const next = new Set(previous);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

function buildSelectionsFromDetail(detail: TradeProposalDetailResponse | null): SelectionState {
  const next = emptySelectionState();
  if (!detail) {
    return next;
  }

  detail.proposal.assets.forEach((asset) => {
    if (asset.fromTeamId === detail.proposal.proposerTeam.id) {
      if (asset.assetType === "PLAYER" && asset.player) {
        next.proposerPlayers.add(asset.player.id);
      }
      if (asset.assetType === "PICK" && asset.futurePick) {
        next.proposerPicks.add(asset.futurePick.id);
      }
      return;
    }

    if (asset.assetType === "PLAYER" && asset.player) {
      next.counterpartyPlayers.add(asset.player.id);
    }
    if (asset.assetType === "PICK" && asset.futurePick) {
      next.counterpartyPicks.add(asset.futurePick.id);
    }
  });

  return next;
}

function TradeBuilderPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get("proposalId");
  const [context, setContext] = useState<TradeBuilderContextResponse | null>(null);
  const [detail, setDetail] = useState<TradeProposalDetailResponse | null>(null);
  const [proposerTeamId, setProposerTeamId] = useState("");
  const [counterpartyTeamId, setCounterpartyTeamId] = useState("");
  const [selectionState, setSelectionState] = useState<SelectionState>(emptySelectionState);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = proposalId ? `?proposalId=${encodeURIComponent(proposalId)}` : "";
    const contextPromise = requestJson<TradeBuilderContextResponse>(
      `/api/trades/builder${query}`,
      undefined,
      "Failed to load trade builder context.",
    );
    const detailPromise = proposalId
      ? requestJson<TradeProposalDetailResponse>(
          `/api/trades/proposals/${proposalId}`,
          undefined,
          "Failed to load trade draft.",
        )
      : Promise.resolve(null);

    const [nextContext, nextDetail] = await Promise.all([contextPromise, detailPromise]);
    setContext(nextContext);
    setDetail(nextDetail);

    const defaultProposerTeamId =
      nextDetail?.proposal.proposerTeam.id ||
      nextContext.viewer.teamId ||
      nextContext.teams[0]?.id ||
      "";
    const defaultCounterpartyTeamId =
      nextDetail?.proposal.counterpartyTeam.id ||
      nextContext.teams.find((team) => team.id !== defaultProposerTeamId)?.id ||
      "";

    setProposerTeamId(defaultProposerTeamId);
    setCounterpartyTeamId(defaultCounterpartyTeamId);
    setSelectionState(buildSelectionsFromDetail(nextDetail));
  }, [proposalId]);

  useEffect(() => {
    let mounted = true;
    load()
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
            : "Failed to load trade builder context.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [load]);

  const normalizedCounterpartyTeamId = useMemo(() => {
    if (counterpartyTeamId && counterpartyTeamId !== proposerTeamId) {
      return counterpartyTeamId;
    }

    return (
      context?.teams.find((team) => team.id !== proposerTeamId)?.id ??
      ""
    );
  }, [context?.teams, counterpartyTeamId, proposerTeamId]);

  useEffect(() => {
    if (normalizedCounterpartyTeamId !== counterpartyTeamId) {
      setCounterpartyTeamId(normalizedCounterpartyTeamId);
    }
  }, [counterpartyTeamId, normalizedCounterpartyTeamId]);

  const buildPayload = useCallback(() => {
    return {
      proposerTeamId,
      counterpartyTeamId: normalizedCounterpartyTeamId,
      proposerAssets: [
        ...Array.from(selectionState.proposerPlayers).map((playerId) => ({
          assetType: "PLAYER" as const,
          playerId,
        })),
        ...Array.from(selectionState.proposerPicks).map((futurePickId) => ({
          assetType: "PICK" as const,
          futurePickId,
        })),
      ],
      counterpartyAssets: [
        ...Array.from(selectionState.counterpartyPlayers).map((playerId) => ({
          assetType: "PLAYER" as const,
          playerId,
        })),
        ...Array.from(selectionState.counterpartyPicks).map((futurePickId) => ({
          assetType: "PICK" as const,
          futurePickId,
        })),
      ],
    };
  }, [counterpartyTeamId, normalizedCounterpartyTeamId, proposerTeamId, selectionState]);

  const saveDraft = useCallback(async () => {
    const payload = buildPayload();
    const method = detail?.proposal.id ? "PUT" : "POST";
    const url = detail?.proposal.id
      ? `/api/trades/proposals/${detail.proposal.id}`
      : "/api/trades/proposals";
    const saved = await requestJson<TradeProposalDetailResponse>(
      url,
      {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      "Failed to save trade draft.",
    );

    setDetail(saved);
    setSelectionState(buildSelectionsFromDetail(saved));
    if (!proposalId || proposalId !== saved.proposal.id) {
      router.replace(`/trades/new?proposalId=${saved.proposal.id}`);
    }
    setMessage("Draft saved.");
    return saved;
  }, [buildPayload, detail?.proposal.id, proposalId, router]);

  const runWithBusy = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setBusyLabel(label);
      setError(null);
      setMessage(null);
      try {
        await action();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Trade builder request failed.",
        );
      } finally {
        setBusyLabel(null);
      }
    },
    [],
  );

  if (error && !context) {
    return (
      <CanonicalRouteState
        eyebrow="Trade Builder"
        title="Trade Builder"
        description="Build a proposal from team assets, review validation, and submit your trade."
        tone="error"
        message="Trade Builder could not load."
        safetyCopy={`${error} Existing proposal data is unchanged. Refresh to retry, or return to Trades.`}
        actionHref="/trades"
        actionLabel="Open Trades"
        testId="trade-builder-route-state"
      />
    );
  }

  if (!context) {
    return (
      <CanonicalRouteState
        eyebrow="Trade Builder"
        title="Trade Builder"
        description="Build a proposal from team assets, review validation, and submit your trade."
        tone="loading"
        message="Loading team assets, proposal details, and validation context."
        safetyCopy="Existing trade proposals remain unchanged while the builder loads."
        testId="trade-builder-route-state"
      />
    );
  }

  return (
    <TradeDecisionWorkspace
      context={context}
      detail={detail}
      proposerTeamId={proposerTeamId}
      counterpartyTeamId={normalizedCounterpartyTeamId}
      selectionState={selectionState}
      busyLabel={busyLabel}
      error={error}
      message={message}
      onChangeProposerTeam={(teamId) => {
        setProposerTeamId(teamId);
        setSelectionState(emptySelectionState());
      }}
      onChangeCounterpartyTeam={(teamId) => {
        setCounterpartyTeamId(teamId);
        setSelectionState(emptySelectionState());
      }}
      onToggleProposerPlayer={(playerId) =>
        setSelectionState((previous) => ({
          ...previous,
          proposerPlayers: toggleInSet(previous.proposerPlayers, playerId),
        }))
      }
      onToggleProposerPick={(pickId) =>
        setSelectionState((previous) => ({
          ...previous,
          proposerPicks: toggleInSet(previous.proposerPicks, pickId),
        }))
      }
      onToggleCounterpartyPlayer={(playerId) =>
        setSelectionState((previous) => ({
          ...previous,
          counterpartyPlayers: toggleInSet(previous.counterpartyPlayers, playerId),
        }))
      }
      onToggleCounterpartyPick={(pickId) =>
        setSelectionState((previous) => ({
          ...previous,
          counterpartyPicks: toggleInSet(previous.counterpartyPicks, pickId),
        }))
      }
      onSaveDraft={() =>
        runWithBusy("save", async () => {
          await saveDraft();
        })
      }
      onValidate={() =>
        runWithBusy("validate", async () => {
          const saved = await saveDraft();
          const evaluated = await requestJson<TradeProposalDetailResponse>(
            `/api/trades/proposals/${saved.proposal.id}/evaluate`,
            {
              method: "POST",
            },
            "Failed to evaluate trade draft.",
          );
          setDetail(evaluated);
          setSelectionState(buildSelectionsFromDetail(evaluated));
          setMessage("Trade draft evaluated.");
        })
      }
      onSubmit={() =>
        runWithBusy("submit", async () => {
          const saved = await saveDraft();
          const submitted = await requestJson<TradeProposalDetailResponse>(
            `/api/trades/proposals/${saved.proposal.id}/submit`,
            {
              method: "POST",
            },
            "Failed to submit trade proposal.",
          );
          setDetail(submitted);
          router.push(`/trades/${submitted.proposal.id}`);
        })
      }
    />
  );
}

function TradeBuilderPageFallback() {
  return (
    <CanonicalRouteState
      eyebrow="Trade Builder"
      title="Trade Builder"
      description="Build a proposal from team assets, review validation, and submit your trade."
      tone="loading"
      message="Loading team assets, proposal details, and validation context."
      safetyCopy="Existing trade proposals remain unchanged while the builder loads."
      testId="trade-builder-route-state"
    />
  );
}

export default function TradeBuilderPage() {
  return (
    <Suspense fallback={<TradeBuilderPageFallback />}>
      <TradeBuilderPageContent />
    </Suspense>
  );
}
