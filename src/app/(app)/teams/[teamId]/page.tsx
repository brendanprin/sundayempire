"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { requestJson } from "@/lib/client-request";
import { RosterCapWorkspace } from "@/components/team/roster-cap-workspace";
import type { ContractImpactPreview, TeamCapDetailProjection } from "@/types/detail";

type TeamDetailResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  detail: TeamCapDetailProjection;
};

type AuthMePayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    teamId: string | null;
  };
};

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = Array.isArray(params?.teamId) ? params.teamId[0] : params?.teamId;
  const [detail, setDetail] = useState<TeamCapDetailProjection | null>(null);
  const [actor, setActor] = useState<AuthMePayload["actor"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContractImpactPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoadingLabel, setPreviewLoadingLabel] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!teamId) {
      return;
    }

    setPreview(null);
    setPreviewError(null);
    setPreviewLoadingLabel(null);

    const [detailPayload, authPayload] = await Promise.all([
      requestJson<TeamDetailResponse>(
        `/api/teams/${teamId}/detail`,
        undefined,
        "Failed to load team cap detail.",
      ),
      requestJson<AuthMePayload>("/api/auth/me", undefined, "Failed to load viewer context."),
    ]);

    setDetail(detailPayload.detail);
    setActor(authPayload.actor);
  }, [teamId]);

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
        setError(requestError instanceof Error ? requestError.message : "Failed to load team detail.");
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

  if (!teamId) {
    return (
      <CanonicalRouteState
        eyebrow="My Team"
        title="My Roster / Cap"
        description="Current roster, contracts, salary cap, and compliance status for your team."
        tone="error"
        message="This route is missing team context, so My Roster / Cap cannot open."
        safetyCopy="Existing roster, cap, and contract records are unchanged. Return to the team directory and reopen the correct franchise."
        actionHref="/teams"
        actionLabel="Open Teams Directory"
        testId="team-route-state"
      />
    );
  }

  if (error) {
    return (
      <CanonicalRouteState
        eyebrow="My Team"
        title="My Roster / Cap"
        description="Current roster, contracts, salary cap, and compliance status for your team."
        tone="error"
        message="My Roster / Cap could not load."
        safetyCopy={`${error} Existing roster, cap, and contract records are safe. Refresh to retry, or reopen the team route from the directory.`}
        actionHref="/teams"
        actionLabel="Open Teams Directory"
        testId="team-route-state"
      />
    );
  }

  if (!detail || !actor) {
    return (
      <CanonicalRouteState
        eyebrow="My Team"
        title="My Roster / Cap"
        description="Current roster, contracts, salary cap, and compliance status for your team."
        tone="loading"
        message="Loading current roster, contracts, compliance, and team details."
        safetyCopy="Existing roster, cap, and contract records stay unchanged while the page finishes loading."
        testId="team-route-state"
      />
    );
  }

  return (
    <RosterCapWorkspace
      detail={detail}
      viewerRole={actor.leagueRole}
      viewerTeamId={actor.teamId}
      preview={preview}
      previewLoadingLabel={previewLoadingLabel}
      previewError={previewError}
      onPreviewCut={(playerId) =>
        runPreview("Cut Preview", `/api/teams/${teamId}/preview/cut`, { playerId })
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
