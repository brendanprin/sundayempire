"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { PlayerDecisionWorkspace } from "@/components/player/player-decision-workspace";
import { requestJson } from "@/lib/client-request";
import type {
  ContractImpactPreview,
  PlayerContractDetailProjection,
} from "@/types/detail";

type AuthMePayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    teamId: string | null;
  };
};

export default function PlayerDetailPage() {
  const params = useParams<{ playerId: string }>();
  const playerId = Array.isArray(params?.playerId) ? params.playerId[0] : params?.playerId;
  const [detail, setDetail] = useState<PlayerContractDetailProjection | null>(null);
  const [actor, setActor] = useState<AuthMePayload["actor"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContractImpactPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoadingLabel, setPreviewLoadingLabel] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!playerId) {
      return;
    }

    setPreview(null);
    setPreviewError(null);
    setPreviewLoadingLabel(null);

    const [detailPayload, authPayload] = await Promise.all([
      requestJson<PlayerContractDetailProjection>(
        `/api/players/${playerId}/contract-detail`,
        undefined,
        "Failed to load player contract detail.",
      ),
      requestJson<AuthMePayload>("/api/auth/me", undefined, "Failed to load viewer context."),
    ]);

    setDetail(detailPayload);
    setActor(authPayload.actor);
  }, [playerId]);

  useEffect(() => {
    let mounted = true;

    loadPage()
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
            : "Failed to load player contract detail.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [loadPage]);

  const runPreview = useCallback(
    async (label: string, url: string, body: Record<string, unknown>) => {
      setPreviewLoadingLabel(label);
      setPreviewError(null);
      try {
        const payload = await requestJson<{ preview: ContractImpactPreview }>(
          url,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
          `Failed to load ${label.toLowerCase()}.`,
        );
        setPreview(payload.preview);
      } catch (requestError) {
        setPreview(null);
        setPreviewError(
          requestError instanceof Error
            ? requestError.message
            : `Failed to load ${label.toLowerCase()}.`,
        );
      } finally {
        setPreviewLoadingLabel(null);
      }
    },
    [],
  );

  if (!playerId) {
    return (
      <CanonicalRouteState
        eyebrow="Player Detail"
        title="Player / Contract Detail"
        description="Contract details, available actions, and roster impact for this player."
        tone="error"
        message="This route is missing player context, so the contract detail page cannot open."
        safetyCopy="Existing player, contract, and preview data are unchanged. Reopen the player from a roster, trade, or player browse surface."
        actionHref="/players"
        actionLabel="Open Players Directory"
        testId="player-route-state"
      />
    );
  }

  if (error) {
    return (
      <CanonicalRouteState
        eyebrow="Player Detail"
        title="Player / Contract Detail"
        description="Contract details, available actions, and roster impact for this player."
        tone="error"
        message="Player / Contract Detail could not load."
        safetyCopy={`${error} Existing player and contract records are safe. Refresh to retry, or reopen the player from the directory.`}
        actionHref="/players"
        actionLabel="Open Players Directory"
        testId="player-route-state"
      />
    );
  }

  if (!detail || !actor) {
    return (
      <CanonicalRouteState
        eyebrow="Player Detail"
        title="Player / Contract Detail"
        description="Contract details, available actions, and roster impact for this player."
        tone="loading"
        message="Loading player details, contract status, and available actions."
        safetyCopy="Existing player and contract records stay unchanged while this page finishes loading."
        testId="player-route-state"
      />
    );
  }

  return (
    <PlayerDecisionWorkspace
      detail={detail}
      viewerRole={actor.leagueRole}
      viewerTeamId={actor.teamId}
      preview={preview}
      previewLoadingLabel={previewLoadingLabel}
      previewError={previewError}
      onPreviewCut={(teamId, targetPlayerId) =>
        runPreview("Cut Preview", `/api/teams/${teamId}/preview/cut`, {
          playerId: targetPlayerId,
        })
      }
      onPreviewFranchiseTag={(contractId) =>
        runPreview(
          "Franchise Tag Preview",
          `/api/contracts/${contractId}/preview/franchise-tag`,
          {},
        )
      }
      onPreviewRookieOption={(contractId) =>
        runPreview(
          "Rookie Option Preview",
          `/api/contracts/${contractId}/preview/rookie-option`,
          {},
        )
      }
    />
  );
}
