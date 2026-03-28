import {
  BASE_URL,
  COMMISSIONER_EMAIL,
  MEMBER_TEAM_EMAIL,
  MEMBER_NO_TEAM_EMAIL,
  activateLeagueContext,
  getActor,
  getPrimaryLeague,
  parsePortFromBaseUrl,
  requestJsonAllowError,
  requestJson,
  runNpmScript,
  runNpmScriptWithArgs,
  runStep,
} from "./mvp-harness";

const PHASE_SMOKES = ["1", "2", "3", "6", "7", "8", "9", "10", "11"] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJsonWithRetry<T>(
  path: string,
  input: Parameters<typeof requestJson<T>>[1],
  attempts = 3,
) {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await requestJson<T>(path, input);
    } catch (error) {
      lastError = error;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("fetch failed") || error.message.includes("ECONNRESET"));
      if (!isRetryable || index === attempts - 1) {
        throw error;
      }

      await sleep(250 * (index + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request retry failed.");
}

async function runWithFetchRetry<T>(action: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("fetch failed") || error.message.includes("ECONNRESET"));
      if (!isRetryable || index === attempts - 1) {
        throw error;
      }

      await sleep(250 * (index + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Fetch retry failed.");
}

type TeamDetailPayload = {
  detail: {
    team: {
      id: string;
      name: string;
    };
    roster: {
      starters: Array<{
        player: { id: string; name: string };
      }>;
      bench: Array<{
        player: { id: string; name: string };
      }>;
    };
    contracts: Array<{
      id: string;
      player: {
        id: string;
        name: string;
      };
    }>;
  };
};

async function verifyMemberDashboardAndPreviews(leagueId: string) {
  await activateLeagueContext(leagueId, MEMBER_TEAM_EMAIL);

  const dashboard = await requestJson<{
    viewer: {
      leagueRole: string;
      teamName: string | null;
    };
    leagueDashboard: {
      league: {
        id: string;
      };
      summary: {
        teamCount: number;
      };
    };
  }>("/api/league/dashboard", {
    email: MEMBER_TEAM_EMAIL,
    leagueId,
  });

  if (dashboard.viewer.leagueRole !== "MEMBER") {
    throw new Error(`Expected member dashboard context, received ${dashboard.viewer.leagueRole}.`);
  }
  if (dashboard.leagueDashboard.summary.teamCount < 1) {
    throw new Error("Expected dashboard summary to include teams.");
  }

  const actor = await getActor(MEMBER_TEAM_EMAIL, leagueId);
  if (!actor.teamId) {
    throw new Error("Expected member actor to resolve to a team.");
  }

  const detail = await requestJson<TeamDetailPayload>(`/api/teams/${actor.teamId}/detail`, {
    email: MEMBER_TEAM_EMAIL,
    leagueId,
  });

  const previewPlayer =
    detail.detail.roster.starters[0]?.player ??
    detail.detail.roster.bench[0]?.player ??
    null;
  if (!previewPlayer) {
    throw new Error("Expected a rostered player for detail preview rehearsal.");
  }

  const cutPreview = await requestJson<{
    preview: { action: string; legal: boolean; blockedReason: string | null };
  }>(
    `/api/teams/${actor.teamId}/preview/cut`,
    {
      email: MEMBER_TEAM_EMAIL,
      leagueId,
      method: "POST",
      body: { playerId: previewPlayer.id },
    },
  );
  if (cutPreview.preview.action !== "cut") {
    throw new Error("Expected cut preview to return the cut action.");
  }
  if (
    typeof cutPreview.preview.legal !== "boolean" ||
    typeof cutPreview.preview.blockedReason === "undefined"
  ) {
    throw new Error("Expected cut preview to expose legal/blockedReason fields.");
  }

  if (detail.detail.contracts.length === 0) {
    throw new Error("Expected at least one contract for contract preview rehearsal.");
  }

  let contractPreviewSucceeded = false;
  let contractPreviewSurfaceValidated = false;
  for (const contractPreviewCandidate of detail.detail.contracts.slice(0, 6)) {
    const franchisePreview = await requestJsonAllowError<{
      preview: { action: string; legal: boolean; blockedReason: string | null };
    }>(`/api/contracts/${contractPreviewCandidate.id}/preview/franchise-tag`, {
      email: MEMBER_TEAM_EMAIL,
      leagueId,
      method: "POST",
      body: {},
    });
    if (franchisePreview.ok && franchisePreview.payload.preview.action === "franchise_tag") {
      contractPreviewSucceeded = true;
      break;
    }
    if (franchisePreview.error?.code === "FRANCHISE_TAG_NOT_AVAILABLE") {
      contractPreviewSurfaceValidated = true;
    }

    const optionPreview = await requestJsonAllowError<{
      preview: { action: string; legal: boolean; blockedReason: string | null };
    }>(`/api/contracts/${contractPreviewCandidate.id}/preview/rookie-option`, {
      email: MEMBER_TEAM_EMAIL,
      leagueId,
      method: "POST",
      body: {},
    });
    if (optionPreview.ok && optionPreview.payload.preview.action === "rookie_option") {
      contractPreviewSucceeded = true;
      break;
    }
    if (
      optionPreview.error?.code === "ROOKIE_OPTION_NOT_AVAILABLE" ||
      optionPreview.error?.code === "CONTRACT_CONSTRAINT_VIOLATION"
    ) {
      contractPreviewSurfaceValidated = true;
    }
  }

  if (!contractPreviewSucceeded && !contractPreviewSurfaceValidated) {
    throw new Error("Expected contract preview routes to either succeed or fail safely.");
  }

}

async function verifyMemberNoTeamVisibility(leagueId: string) {
  await runWithFetchRetry(async () => {
    await activateLeagueContext(leagueId, MEMBER_NO_TEAM_EMAIL);
    const activity = await requestJsonWithRetry<{ feed: Array<{ id: string }> }>("/api/activity?limit=5", {
      email: MEMBER_NO_TEAM_EMAIL,
      leagueId,
    });

    if (activity.feed.length === 0) {
      throw new Error("Expected member no-team activity view to remain available.");
    }
  });
}

async function verifyActivityAndAuditVisibility(leagueId: string) {
  await runWithFetchRetry(async () => {
    await activateLeagueContext(leagueId, MEMBER_TEAM_EMAIL);
    const activity = await requestJsonWithRetry<{
      feed: Array<{ id: string }>;
    }>("/api/activity?limit=10", {
      email: MEMBER_TEAM_EMAIL,
      leagueId,
    });
    if (activity.feed.length === 0) {
      throw new Error("Expected activity feed to contain events after MVP rehearsal flows.");
    }

    await activateLeagueContext(leagueId, COMMISSIONER_EMAIL);
    const audit = await requestJsonWithRetry<{
      entries: Array<{ id: string }>;
    }>("/api/commissioner/audit?limit=10", {
      email: COMMISSIONER_EMAIL,
      leagueId,
    });
    if (audit.entries.length === 0) {
      throw new Error("Expected commissioner audit to contain entries after MVP rehearsal flows.");
    }
  });
}

async function main() {
  const league = await runStep("league-context", async () => {
    const currentLeague = await getPrimaryLeague(COMMISSIONER_EMAIL);
    await Promise.all([
      activateLeagueContext(currentLeague.id, COMMISSIONER_EMAIL),
      activateLeagueContext(currentLeague.id, MEMBER_TEAM_EMAIL),
      activateLeagueContext(currentLeague.id, MEMBER_NO_TEAM_EMAIL),
    ]);
    return currentLeague;
  });

  await runStep("member-dashboard-and-previews", () => verifyMemberDashboardAndPreviews(league.id));

  for (const phase of PHASE_SMOKES) {
    await runStep(`smoke:phase ${phase}`, async () => {
      runNpmScriptWithArgs("smoke:phase", [phase]);
    });
  }

  await runStep("activity-and-audit", () => verifyActivityAndAuditVisibility(league.id));
  await runStep("member-no-team-activity", () => verifyMemberNoTeamVisibility(league.id));

  await runStep("mvp-shadow-ui", async () => {
    runNpmScript("verify:mvp-shadow", {
      PLAYWRIGHT_BASE_URL: BASE_URL,
      PORT: parsePortFromBaseUrl(),
      NEW_LIFECYCLE_ENGINE: process.env.NEW_LIFECYCLE_ENGINE ?? "1",
    });
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        leagueId: league.id,
        rehearsed: [
          "dashboard -> team detail -> previews",
          ...PHASE_SMOKES.map((phase) => `smoke:phase ${phase}`),
          "activity and audit",
          "member no-team activity",
          "mvp shadow ui",
        ],
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Sprint 12 MVP dress rehearsal failed.");
  process.exitCode = 1;
});
