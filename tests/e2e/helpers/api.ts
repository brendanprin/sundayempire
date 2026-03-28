import { expect, request } from "@playwright/test";

export const COMMISSIONER_EMAIL = "commissioner@local.league";
export const OWNER_EMAIL = "owner01@local.league";
export const READ_ONLY_EMAIL = "readonly@local.league";

export type TeamRow = {
  id: string;
  name: string;
};

export type LeagueRow = {
  id: string;
  name: string;
};

export type PickRow = {
  id: string;
  seasonYear: number;
  round: number;
  overall: number | null;
  isUsed: boolean;
};

type DraftListItem = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
};

type CapturedMagicLinkPayload = {
  magicLink: {
    email: string;
    url: string;
    expiresAt: string;
    createdAt: string;
  };
};

type CapturedLeagueInvitePayload = {
  invite: {
    email: string;
    leagueId: string;
    leagueName: string;
    teamName: string | null;
    url: string;
    inviteId: string | null;
    expiresAt: string;
    createdAt: string;
  };
};

export async function apiContext(
  baseURL: string,
  email = COMMISSIONER_EMAIL,
  leagueId?: string,
) {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-dynasty-user-email": email,
      "content-type": "application/json",
      ...(leagueId ? { "x-dynasty-league-id": leagueId } : {}),
    },
  });
}

const RETRYABLE_NETWORK_ERROR_SNIPPETS = ["ECONNRESET", "ECONNREFUSED", "socket hang up"];

function isRetryableNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return RETRYABLE_NETWORK_ERROR_SNIPPETS.some((snippet) => error.message.includes(snippet));
}

async function getWithRetry(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  path: string,
  maxAttempts = 3,
) {
  const attempts = Math.max(1, maxAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await ctx.get(path);
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }

  throw new Error(`Failed to request ${path}`);
}

export async function getTeams(ctx: Awaited<ReturnType<typeof apiContext>>) {
  const response = await getWithRetry(ctx, "/api/teams");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.teams as TeamRow[];
}

export async function getLeagues(ctx: Awaited<ReturnType<typeof apiContext>>) {
  const response = await getWithRetry(ctx, "/api/leagues");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.leagues as LeagueRow[];
}

export async function getCapturedMagicLink(
  baseURL: string,
  email: string,
  options: {
    returnTo?: string;
  } = {},
) {
  const ctx = await request.newContext({
    baseURL,
  });

  try {
    const params = new URLSearchParams({
      email,
    });
    if (options.returnTo) {
      params.set("returnTo", options.returnTo);
    }
    const response = await ctx.get(
      `/api/auth/magic-link/test?${params.toString()}`,
    );
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as CapturedMagicLinkPayload;
    return payload.magicLink;
  } finally {
    await ctx.dispose();
  }
}

export async function getCapturedLeagueInvite(
  baseURL: string,
  email: string,
  options: {
    leagueId?: string;
  } = {},
) {
  const ctx = await request.newContext({
    baseURL,
  });

  try {
    const params = new URLSearchParams({
      email,
    });
    if (options.leagueId) {
      params.set("leagueId", options.leagueId);
    }

    const response = await ctx.get(`/api/league/invites/test?${params.toString()}`);
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as CapturedLeagueInvitePayload;
    return payload.invite;
  } finally {
    await ctx.dispose();
  }
}

export async function getPrimaryLeagueId(ctx: Awaited<ReturnType<typeof apiContext>>) {
  const leagues = await getLeagues(ctx);
  expect(leagues.length).toBeGreaterThan(0);
  return leagues[0].id;
}

export async function getRoster(ctx: Awaited<ReturnType<typeof apiContext>>, teamId: string) {
  const response = await getWithRetry(ctx, `/api/teams/${teamId}/roster`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function createTrade(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  body: Record<string, unknown>,
) {
  const response = await ctx.post("/api/trades", {
    data: body,
  });

  const payload = await response.json();
  return { response, payload };
}

export async function createTradeProposal(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  body: Record<string, unknown>,
) {
  const response = await ctx.post("/api/trades/proposals", {
    data: body,
  });

  const payload = await response.json();
  return { response, payload };
}

export async function submitTradeProposal(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  proposalId: string,
) {
  const response = await ctx.post(`/api/trades/proposals/${proposalId}/submit`);
  const payload = await response.json();
  return { response, payload };
}

export async function evaluateTradeProposal(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  proposalId: string,
) {
  const response = await ctx.post(`/api/trades/proposals/${proposalId}/evaluate`);
  const payload = await response.json();
  return { response, payload };
}

export async function acceptTradeProposal(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  proposalId: string,
) {
  const response = await ctx.post(`/api/trades/proposals/${proposalId}/accept`);
  const payload = await response.json();
  return { response, payload };
}

export async function settleTradeProposal(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  proposalId: string,
) {
  const response = await ctx.post(`/api/commissioner/trades/${proposalId}/settle`);
  const payload = await response.json();
  return { response, payload };
}

export async function createLiveRookieDraft(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  title: string,
) {
  const listResponse = await ctx.get("/api/drafts?type=ROOKIE");
  const listPayload = await listResponse.json();
  const activeDraft = (listPayload as { drafts?: DraftListItem[] }).drafts?.find(
    (draft) => draft.status !== "COMPLETED",
  );

  let draftId = activeDraft?.id ?? null;
  let setupResponse: Awaited<ReturnType<typeof ctx.post>> | null = null;
  let startResponse: Awaited<ReturnType<typeof ctx.patch>> | null = null;

  if (!draftId || activeDraft?.status === "NOT_STARTED") {
    setupResponse = await ctx.post("/api/drafts/setup", {
      data: {
        type: "ROOKIE",
        draftId,
        title,
      },
    });
    const setupPayload = await setupResponse.json();
    draftId =
      draftId ??
      (setupPayload as { setup?: { draft?: { id?: string } | null } }).setup?.draft?.id ??
      null;
  }

  if (!draftId) {
    throw new Error("Expected rookie draft setup to provide a draft id.");
  }

  if (activeDraft?.status !== "IN_PROGRESS") {
    startResponse = await ctx.patch(`/api/drafts/${draftId}`, {
      data: {
        action: "START_DRAFT",
      },
    });
  }

  return {
    draftId,
    setupResponse,
    startResponse,
  };
}

export async function createLiveVeteranAuction(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  title: string,
) {
  const listResponse = await ctx.get("/api/drafts?type=VETERAN_AUCTION");
  const listPayload = await listResponse.json();
  const activeDraft = (listPayload as { drafts?: DraftListItem[] }).drafts?.find(
    (draft) => draft.status !== "COMPLETED",
  );

  let draftId = activeDraft?.id ?? null;
  let setupResponse: Awaited<ReturnType<typeof ctx.post>> | null = null;
  let startResponse: Awaited<ReturnType<typeof ctx.patch>> | null = null;

  if (!draftId || activeDraft?.status === "NOT_STARTED") {
    setupResponse = await ctx.post("/api/drafts/setup", {
      data: {
        type: "VETERAN_AUCTION",
        draftId,
        title,
      },
    });
    const setupPayload = await setupResponse.json();
    draftId =
      draftId ??
      (setupPayload as { setup?: { draft?: { id?: string } | null } }).setup?.draft?.id ??
      null;
  }

  if (!draftId) {
    return {
      draftId: null,
      setupResponse,
      startResponse,
    };
  }

  if (activeDraft?.status !== "IN_PROGRESS") {
    startResponse = await ctx.patch(`/api/drafts/${draftId}`, {
      data: {
        action: "START_DRAFT",
      },
    });
  }

  return {
    draftId,
    setupResponse,
    startResponse,
  };
}

export async function reviewTradeProposal(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  proposalId: string,
  input: {
    decision: "approve" | "reject";
    reason: string;
  },
) {
  const response = await ctx.post(`/api/commissioner/trades/${proposalId}/review`, {
    data: input,
  });
  const payload = await response.json();
  return { response, payload };
}

function extractTradeFindingCodes(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return new Set<string>();
  }

  const error = (payload as { error?: { code?: string; context?: { findings?: unknown } } }).error;
  if (!error || error.code !== "TRADE_NOT_LEGAL") {
    return new Set<string>();
  }

  const findings = error.context?.findings;
  if (!Array.isArray(findings)) {
    return new Set<string>();
  }

  const codes = new Set<string>();
  findings.forEach((finding) => {
    if (!finding || typeof finding !== "object") {
      return;
    }
    const code = (finding as { code?: string }).code;
    if (typeof code === "string" && code.trim().length > 0) {
      codes.add(code);
    }
  });

  return codes;
}

function isRetryableTradeSeedFailure(codes: Set<string>) {
  const retryableCodes = new Set(["PICK_OWNERSHIP_INVALID", "PICK_ALREADY_USED", "PICK_NOT_FOUND"]);

  for (const code of codes) {
    if (retryableCodes.has(code)) {
      return true;
    }
  }
  return false;
}

function needsCommissionerTeamNormalization(codes: Set<string>) {
  const normalizationCodes = new Set([
    "POST_TRADE_ROSTER_LIMIT_EXCEEDED",
    "POST_TRADE_SOFT_CAP_EXCEEDED",
    "POST_TRADE_HARD_CAP_EXCEEDED",
  ]);

  for (const code of codes) {
    if (normalizationCodes.has(code)) {
      return true;
    }
  }
  return false;
}

function selectPicksByAttempt(
  picks: Array<{ id: string; isUsed: boolean }>,
  count: number,
  attempt: number,
) {
  const available = picks.filter((pick) => !pick.isUsed);
  if (available.length < count || count < 1) {
    return null;
  }

  const reversed = [...available].reverse();
  const start = attempt % reversed.length;
  const selected: Array<{ id: string; isUsed: boolean }> = [];

  for (let offset = 0; offset < reversed.length && selected.length < count; offset += 1) {
    const pick = reversed[(start + offset) % reversed.length];
    if (!selected.some((candidate) => candidate.id === pick.id)) {
      selected.push(pick);
    }
  }

  if (selected.length < count) {
    return null;
  }

  return selected;
}

function selectContractsByAttempt(
  contracts: Array<{ id?: string; player?: { id?: string | null } | null }>,
  count: number,
  attempt: number,
) {
  const available = contracts.filter((contract) => typeof contract.player?.id === "string");
  if (available.length < count || count < 1) {
    return null;
  }

  const reversed = [...available].reverse();
  const start = attempt % reversed.length;
  const selected: Array<{ id?: string; player?: { id?: string | null } | null }> = [];

  for (let offset = 0; offset < reversed.length && selected.length < count; offset += 1) {
    const contract = reversed[(start + offset) % reversed.length];
    const playerId = contract.player?.id;
    if (
      typeof playerId === "string" &&
      !selected.some((candidate) => candidate.player?.id === playerId)
    ) {
      selected.push(contract);
    }
  }

  if (selected.length < count) {
    return null;
  }

  return selected;
}

export async function createPicksOnlyTradeWithRetry(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  input: {
    teamAId: string;
    teamBId: string;
    notesPrefix: string;
    teamAPickCount?: number;
    teamBPickCount?: number;
    maxAttempts?: number;
  },
) {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 6);
  const teamAPickCount = Math.max(1, input.teamAPickCount ?? 1);
  const teamBPickCount = Math.max(1, input.teamBPickCount ?? 1);
  let lastResult: { response: Awaited<ReturnType<typeof ctx.post>>; payload: unknown } | null = null;

  const formatFailure = (result: { response: Awaited<ReturnType<typeof ctx.post>>; payload: unknown }) => {
    const status = result.response.status();
    const payloadText =
      typeof result.payload === "string"
        ? result.payload
        : JSON.stringify(result.payload ?? null);
    return `Trade seed failed (status ${status}): ${payloadText}`;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [teamARoster, teamBRoster] = await Promise.all([
      getRoster(ctx, input.teamAId),
      getRoster(ctx, input.teamBId),
    ]);

    const teamAPicks = selectPicksByAttempt(
      teamARoster.picks as Array<{ id: string; isUsed: boolean }>,
      teamAPickCount,
      attempt,
    );
    const teamBPicks = selectPicksByAttempt(
      teamBRoster.picks as Array<{ id: string; isUsed: boolean }>,
      teamBPickCount,
      attempt,
    );

    if (!teamAPicks || !teamBPicks) {
      throw new Error("Expected available picks for retryable trade seed.");
    }

    const result = await createTrade(ctx, {
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      notes: `${input.notesPrefix}-${Date.now()}-attempt-${attempt + 1}`,
      teamAAssets: teamAPicks.map((pick) => ({
        assetType: "PICK",
        futurePickId: pick.id,
      })),
      teamBAssets: teamBPicks.map((pick) => ({
        assetType: "PICK",
        futurePickId: pick.id,
      })),
    });

    lastResult = result;
    if (result.response.ok()) {
      return result;
    }

    const codes = extractTradeFindingCodes(result.payload);
    if (codes.has("TRADE_WINDOW_CLOSED")) {
      await ctx.post("/api/commissioner/season/phase", {
        data: {
          phase: "REGULAR_SEASON",
        },
      });
      continue;
    }

    if (needsCommissionerTeamNormalization(codes)) {
      await Promise.all([
        ctx.post("/api/commissioner/override/fix-team", {
          data: {
            teamId: input.teamAId,
            targetCapType: "soft",
            dryRun: false,
          },
        }),
        ctx.post("/api/commissioner/override/fix-team", {
          data: {
            teamId: input.teamBId,
            targetCapType: "soft",
            dryRun: false,
          },
        }),
      ]);
      continue;
    }

    if (!isRetryableTradeSeedFailure(codes)) {
      throw new Error(formatFailure(result));
    }
  }

  if (lastResult) {
    throw new Error(formatFailure(lastResult));
  }

  throw new Error("Trade seed attempts exhausted without any request result.");
}

export async function createPickForPickTradeWithRetry(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  input: {
    teamAId: string;
    teamBId: string;
    notesPrefix: string;
    maxAttempts?: number;
  },
) {
  return createPicksOnlyTradeWithRetry(ctx, {
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    notesPrefix: input.notesPrefix,
    maxAttempts: input.maxAttempts,
    teamAPickCount: 1,
    teamBPickCount: 1,
  });
}

export async function createPickForPickTradeProposalWithRetry(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  input: {
    proposerTeamId: string;
    counterpartyTeamId: string;
    maxAttempts?: number;
  },
) {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 6);
  let lastResult: { response: Awaited<ReturnType<typeof ctx.post>>; payload: unknown } | null = null;

  const formatFailure = (result: { response: Awaited<ReturnType<typeof ctx.post>>; payload: unknown }) => {
    const status = result.response.status();
    const payloadText =
      typeof result.payload === "string"
        ? result.payload
        : JSON.stringify(result.payload ?? null);
    return `Trade proposal seed failed (status ${status}): ${payloadText}`;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [proposerRoster, counterpartyRoster] = await Promise.all([
      getRoster(ctx, input.proposerTeamId),
      getRoster(ctx, input.counterpartyTeamId),
    ]);

    const proposerPick = selectPicksByAttempt(
      proposerRoster.picks as Array<{ id: string; isUsed: boolean }>,
      1,
      attempt,
    )?.[0];
    const counterpartyPick = selectPicksByAttempt(
      counterpartyRoster.picks as Array<{ id: string; isUsed: boolean }>,
      1,
      attempt,
    )?.[0];

    if (!proposerPick || !counterpartyPick) {
      throw new Error("Expected available picks for retryable trade proposal seed.");
    }

    const result = await createTradeProposal(ctx, {
      proposerTeamId: input.proposerTeamId,
      counterpartyTeamId: input.counterpartyTeamId,
      proposerAssets: [{ assetType: "PICK", futurePickId: proposerPick.id }],
      counterpartyAssets: [{ assetType: "PICK", futurePickId: counterpartyPick.id }],
    });

    lastResult = result;
    if (result.response.ok()) {
      return result;
    }

    const codes = extractTradeFindingCodes(result.payload);
    if (codes.has("TRADE_WINDOW_CLOSED")) {
      await ctx.post("/api/commissioner/season/phase", {
        data: {
          phase: "REGULAR_SEASON",
        },
      });
      continue;
    }

    if (needsCommissionerTeamNormalization(codes)) {
      await Promise.all([
        ctx.post("/api/commissioner/override/fix-team", {
          data: {
            teamId: input.proposerTeamId,
            targetCapType: "soft",
            dryRun: false,
          },
        }),
        ctx.post("/api/commissioner/override/fix-team", {
          data: {
            teamId: input.counterpartyTeamId,
            targetCapType: "soft",
            dryRun: false,
          },
        }),
      ]);
      continue;
    }

    if (!isRetryableTradeSeedFailure(codes)) {
      throw new Error(formatFailure(result));
    }
  }

  if (lastResult) {
    throw new Error(formatFailure(lastResult));
  }

  throw new Error("Trade proposal seed attempts exhausted without any request result.");
}

export async function createSubmittedPickForPickTradeProposalWithRetry(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  input: {
    proposerTeamId: string;
    counterpartyTeamId: string;
    maxAttempts?: number;
  },
) {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 6);
  let lastResult: { response: Awaited<ReturnType<typeof ctx.post>>; payload: unknown } | null = null;

  const formatFailure = (result: { response: Awaited<ReturnType<typeof ctx.post>>; payload: unknown }) => {
    const status = result.response.status();
    const payloadText =
      typeof result.payload === "string"
        ? result.payload
        : JSON.stringify(result.payload ?? null);
    return `Submitted trade proposal seed failed (status ${status}): ${payloadText}`;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [proposerRoster, counterpartyRoster] = await Promise.all([
      getRoster(ctx, input.proposerTeamId),
      getRoster(ctx, input.counterpartyTeamId),
    ]);

    const proposerPlayer = selectContractsByAttempt(
      proposerRoster.contracts as Array<{ id?: string; player?: { id?: string | null } | null }>,
      1,
      attempt,
    )?.[0];
    const counterpartyPlayer = selectContractsByAttempt(
      counterpartyRoster.contracts as Array<{ id?: string; player?: { id?: string | null } | null }>,
      1,
      attempt,
    )?.[0];
    const proposerPick = selectPicksByAttempt(
      proposerRoster.picks as Array<{ id: string; isUsed: boolean }>,
      1,
      attempt,
    )?.[0];
    const counterpartyPick = selectPicksByAttempt(
      counterpartyRoster.picks as Array<{ id: string; isUsed: boolean }>,
      1,
      attempt,
    )?.[0];

    if (!proposerPlayer?.player?.id || !counterpartyPlayer?.player?.id || !proposerPick || !counterpartyPick) {
      throw new Error("Expected available player and pick assets for retryable submitted proposal seed.");
    }

    const draft = await createTradeProposal(ctx, {
      proposerTeamId: input.proposerTeamId,
      counterpartyTeamId: input.counterpartyTeamId,
      proposerAssets: [
        { assetType: "PLAYER", playerId: proposerPlayer.player.id },
        { assetType: "PICK", futurePickId: proposerPick.id },
      ],
      counterpartyAssets: [
        { assetType: "PLAYER", playerId: counterpartyPlayer.player.id },
        { assetType: "PICK", futurePickId: counterpartyPick.id },
      ],
    });

    if (!draft.response.ok()) {
      lastResult = draft;
      const codes = extractTradeFindingCodes(draft.payload);
      if (codes.has("TRADE_WINDOW_CLOSED")) {
        await ctx.post("/api/commissioner/season/phase", {
          data: {
            phase: "REGULAR_SEASON",
          },
        });
        continue;
      }

      if (needsCommissionerTeamNormalization(codes)) {
        await Promise.all([
          ctx.post("/api/commissioner/override/fix-team", {
            data: {
              teamId: input.proposerTeamId,
              targetCapType: "soft",
              dryRun: false,
            },
          }),
          ctx.post("/api/commissioner/override/fix-team", {
            data: {
              teamId: input.counterpartyTeamId,
              targetCapType: "soft",
              dryRun: false,
            },
          }),
        ]);
        continue;
      }

      if (!isRetryableTradeSeedFailure(codes)) {
        throw new Error(formatFailure(draft));
      }
      continue;
    }

    const proposalId = (draft.payload as { proposal: { id: string } }).proposal.id;
    const submitted = await submitTradeProposal(ctx, proposalId);
    lastResult = submitted;
    if (submitted.response.ok()) {
      return submitted;
    }

    const submitCode =
      typeof submitted.payload === "object" &&
      submitted.payload !== null &&
      "error" in submitted.payload &&
      typeof (submitted.payload as { error?: { code?: string } }).error?.code === "string"
        ? (submitted.payload as { error?: { code?: string } }).error?.code
        : null;

    if (submitCode === "TRADE_STATE_CONFLICT") {
      continue;
    }

    throw new Error(formatFailure(submitted));
  }

  if (lastResult) {
    throw new Error(formatFailure(lastResult));
  }

  throw new Error("Submitted trade proposal seed attempts exhausted without any request result.");
}

export async function createSettlementReadyTradeProposalWithRetry(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  input: {
    proposerTeamId: string;
    counterpartyTeamId: string;
    maxAttempts?: number;
  },
) {
  const submitted = await createSubmittedPickForPickTradeProposalWithRetry(ctx, input);
  if (!submitted.response.ok()) {
    return submitted;
  }

  const proposalId = (submitted.payload as { proposal: { id: string } }).proposal.id;
  const submittedStatus = (submitted.payload as { proposal: { status: string } }).proposal.status;
  if (submittedStatus === "ACCEPTED" || submittedStatus === "REVIEW_APPROVED") {
    return submitted;
  }

  if (submittedStatus === "REVIEW_PENDING") {
    return reviewTradeProposal(ctx, proposalId, {
      decision: "approve",
      reason: `e2e settlement approval ${Date.now()}`,
    });
  }

  const accepted = await acceptTradeProposal(ctx, proposalId);
  if (!accepted.response.ok()) {
    return accepted;
  }

  const acceptedStatus = (accepted.payload as { proposal: { status: string } }).proposal.status;
  if (acceptedStatus === "REVIEW_PENDING") {
    return reviewTradeProposal(ctx, proposalId, {
      decision: "approve",
      reason: `e2e settlement approval ${Date.now()}`,
    });
  }

  return accepted;
}

export async function acceptTrade(ctx: Awaited<ReturnType<typeof apiContext>>, tradeId: string) {
  const response = await ctx.post(`/api/trades/${tradeId}/accept`);
  const payload = await response.json();
  return { response, payload };
}

export async function patchContract(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  contractId: string,
  body: Record<string, unknown>,
) {
  const response = await ctx.patch(`/api/contracts/${contractId}`, {
    data: body,
  });
  const payload = await response.json();
  return { response, payload };
}
