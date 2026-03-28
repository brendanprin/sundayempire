import { expect, test, type Page } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getCapturedLeagueInvite,
  getCapturedMagicLink,
} from "../e2e/helpers/api";
import { setupSmokeTestPage } from "./helpers/smoke-evidence";

type LoginRole = "commissioner" | "owner" | "administrator";

type DraftType = "ROOKIE" | "VETERAN_AUCTION";

type LeagueListPayload = {
  leagues: Array<{
    id: string;
    name: string;
  }>;
};

type DraftListPayload = {
  drafts: Array<{
    id: string;
    title: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  }>;
};

type RookieDraftDetailPayload = {
  draft: {
    id: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progress: {
      picksMade: number;
      totalPicks: number;
      currentPickNumber: number | null;
    };
  };
};

type AuctionRoomPayload = {
  draft: {
    id: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progress: {
      picksMade: number;
      totalPicks: number;
    };
  };
  summary: {
    totalEntries: number;
    openMarketCount: number;
    activeBiddingCount: number;
    awardedCount: number;
    reviewRequiredCount: number;
  };
  boardRows: Array<{
    playerId: string;
    entryId: string;
    displayState: string;
    currentLeaderTeamName: string | null;
    leadingSalary: number | null;
    leadingYears: number | null;
    awardedTeamName: string | null;
    awardedSalary: number | null;
    awardedYears: number | null;
    timeLeftSeconds: number | null;
  }>;
};

type AuctionStatusSyncPayload = {
  ok: true;
  summary: {
    awardsCreated: number;
    expiredCount: number;
    reviewRequiredCount: number;
    completed: boolean;
  };
};

const TEAM_COUNT = 12;
const OPEN_BID_WINDOW_SECONDS = 5;
const RESET_WINDOW_SECONDS = 1;

function roleTestId(role: LoginRole) {
  if (role === "commissioner") {
    return "login-role-option-commissioner";
  }
  if (role === "owner") {
    return "login-role-option-member-team";
  }
  return "login-role-option-member-no-team";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function draftSessionPath(segment: "rookie" | "veteran-auction", draftId: string) {
  return `/draft/${segment}?session=${encodeURIComponent(draftId)}`;
}

async function loginThroughUi(
  page: Page,
  input: {
    role: LoginRole;
    email: string;
    returnTo: string;
    leagueId?: string;
    switchSession?: boolean;
  },
) {
  const params = new URLSearchParams({ returnTo: input.returnTo });
  if (input.switchSession) {
    params.set("switch", "1");
  }

  await page.goto(`/login?${params.toString()}`);
  const origin = new URL(page.url()).origin;
  await expect(
    page.getByRole("heading", {
      name: input.switchSession ? "Switch Account" : "Sign In",
      exact: true,
    }),
  ).toBeVisible();
  const demoPanel = page.getByTestId("login-demo-auth-panel");
  if (await demoPanel.isVisible().catch(() => false)) {
    await page.getByTestId(roleTestId(input.role)).click();
    await page.getByTestId("login-identity-select").selectOption(input.email);
    await page.getByTestId("login-demo-submit").click();
  } else if (input.role === "owner" && input.leagueId) {
    const invite = await getCapturedLeagueInvite(origin, input.email, {
      leagueId: input.leagueId,
    });
    const inviteUrl = new URL(invite.url);
    inviteUrl.searchParams.set("returnTo", input.returnTo);
    const inviteReturnTo = `${inviteUrl.pathname}${inviteUrl.search}`;

    await page.goto(inviteUrl.toString());
    await expect(page.getByTestId("invite-sign-in-link")).toBeVisible();
    await page.getByTestId("invite-sign-in-link").click();
    await expect(page.getByTestId("login-email-input")).toBeVisible();

    await page.getByTestId("login-email-input").fill(input.email);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(input.email);

    const magicLink = await getCapturedMagicLink(origin, input.email, {
      returnTo: inviteReturnTo,
    });
    await page.goto(magicLink.url);
    await expect(page.getByTestId("invite-accept-button")).toBeVisible();
    await page.getByTestId("invite-accept-button").click();
  } else {
    await page.getByTestId("login-email-input").fill(input.email);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(input.email);

    const magicLink = await getCapturedMagicLink(origin, input.email, {
      returnTo: input.returnTo,
    });
    await page.goto(magicLink.url);
  }
  await expect(page).toHaveURL(new RegExp(escapeRegExp(input.returnTo)));
}

async function inviteOwnerAndTeam(
  page: Page,
  input: {
    ownerName: string;
    ownerEmail: string;
    teamName: string;
    teamAbbreviation: string;
    divisionLabel: string;
    expectedTeamCount: number;
  },
) {
  await page.getByTestId("workspace-invite-owner-name").fill(input.ownerName);
  await page.getByTestId("workspace-invite-owner-email").fill(input.ownerEmail);
  await page.getByTestId("workspace-invite-team-name").fill(input.teamName);
  await page.getByTestId("workspace-invite-team-abbr").fill(input.teamAbbreviation);
  await page.getByTestId("workspace-invite-division").fill(input.divisionLabel);
  await page.getByTestId("workspace-invite-button").click();
  await expect(page.getByTestId("workspace-active-team-count")).toHaveText(String(input.expectedTeamCount), {
    timeout: 15_000,
  });
}

async function findLeagueIdByName(baseURL: string, leagueName: string) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL);
  try {
    const response = await commissioner.get("/api/leagues");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as LeagueListPayload;
    return payload.leagues.find((entry) => entry.name === leagueName)?.id ?? null;
  } finally {
    await commissioner.dispose();
  }
}

async function waitForLeagueIdByName(baseURL: string, leagueName: string) {
  let leagueId = "";
  await expect
    .poll(
      async () => {
        leagueId = (await findLeagueIdByName(baseURL, leagueName)) ?? "";
        return leagueId;
      },
      {
        timeout: 20_000,
        message: `Expected to find league named ${leagueName}.`,
      },
    )
    .not.toBe("");
  return leagueId;
}

async function findActiveDraftId(baseURL: string, leagueId: string, type: DraftType) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
  try {
    const response = await commissioner.get(`/api/drafts?type=${type}`);
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as DraftListPayload;
    return (
      payload.drafts.find((entry) => entry.status !== "COMPLETED")?.id ??
      payload.drafts[0]?.id ??
      null
    );
  } finally {
    await commissioner.dispose();
  }
}

async function waitForActiveDraftId(baseURL: string, leagueId: string, type: DraftType) {
  let draftId = "";
  await expect
    .poll(
      async () => {
        draftId = (await findActiveDraftId(baseURL, leagueId, type)) ?? "";
        return draftId;
      },
      {
        timeout: 20_000,
        message: `Expected an active ${type} draft.`,
      },
    )
    .not.toBe("");
  return draftId;
}

async function getRookieDraftDetail(baseURL: string, leagueId: string, draftId: string) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
  try {
    const response = await commissioner.get(`/api/drafts/${draftId}`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as RookieDraftDetailPayload;
  } finally {
    await commissioner.dispose();
  }
}

async function getAuctionRoom(baseURL: string, leagueId: string, email: string, draftId: string) {
  const actor = await apiContext(baseURL, email, leagueId);
  try {
    const response = await actor.get(`/api/drafts/${draftId}/auction-room`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as AuctionRoomPayload;
  } finally {
    await actor.dispose();
  }
}

async function completeRemainingRookiePicksByForfeit(
  page: Page,
  baseURL: string,
  leagueId: string,
  draftId: string,
) {
  const initialDetail = await getRookieDraftDetail(baseURL, leagueId, draftId);
  const totalPicks = initialDetail.draft.progress.totalPicks;
  const startingPicksMade = initialDetail.draft.progress.picksMade;

  expect(totalPicks).toBe(TEAM_COUNT * 2);
  expect(startingPicksMade).toBeGreaterThan(0);

  for (let expectedPicksMade = startingPicksMade + 1; expectedPicksMade <= totalPicks; expectedPicksMade += 1) {
    const expectedStatus = expectedPicksMade === totalPicks ? "COMPLETED" : "IN_PROGRESS";
    const forfeitButton = page.getByRole("button", { name: "Forfeit Pick" });

    await expect(forfeitButton).toBeVisible({ timeout: 15_000 });
    await expect(forfeitButton).toBeEnabled();
    await forfeitButton.click();

    await expect
      .poll(
        async () => {
          const payload = await getRookieDraftDetail(baseURL, leagueId, draftId);
          return JSON.stringify({
            picksMade: payload.draft.progress.picksMade,
            status: payload.draft.status,
          });
        },
        {
          timeout: 20_000,
          message: `Expected rookie draft progress to advance to ${expectedPicksMade}/${totalPicks}.`,
        },
      )
      .toBe(
        JSON.stringify({
          picksMade: expectedPicksMade,
          status: expectedStatus,
        }),
      );
  }
}

test.describe.configure({ mode: "serial" });

test("manual bootstrap -> rookie draft -> veteran auction happy path", async ({ page, baseURL }) => {
  test.slow();
  test.setTimeout(360_000);

  const now = Date.now();
  const leagueName = `Manual E2E League ${now}`;
  const rookieDraftTitle = `${leagueName} Rookie Draft`;
  const veteranAuctionTitle = `${leagueName} Veteran Auction`;
  const ownerOneEmail = `manual-owner-01-${now}@example.test`;
  const ownerOneTeamName = "Manual Team 01";

  if (!baseURL) {
    throw new Error("Expected Playwright baseURL to be configured.");
  }

  await setupSmokeTestPage(page);

  let createdLeagueId = "";
  let rookieDraftId = "";
  let veteranAuctionId = "";
  let targetedAuctionPlayerId = "";
  let targetedAuctionPlayerName = "";

  await test.step("sign in as commissioner and create a clean workspace", async () => {
    await loginThroughUi(page, {
      role: "commissioner",
      email: COMMISSIONER_EMAIL,
      returnTo: "/commissioner",
    });

    await expect(page.getByTestId("commissioner-page")).toBeVisible();
    const advancedOperationsToggle = page.getByTestId("commissioner-advanced-operations-toggle");
    await advancedOperationsToggle.scrollIntoViewIfNeeded();
    if ((await advancedOperationsToggle.getAttribute("aria-expanded")) !== "true") {
      await advancedOperationsToggle.click();
    }
    await expect(page.getByTestId("workspace-create-button")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("workspace-create-name").fill(leagueName);
    await page.getByTestId("workspace-create-season").fill("2026");
    await page.getByTestId("workspace-create-description").fill(
      "Playwright manual E2E workspace covering bootstrap, rookie draft, and veteran auction.",
    );
    await page.getByTestId("workspace-create-button").click();

    await expect(page.getByTestId("workspace-active-name")).toHaveText(leagueName, { timeout: 15_000 });
    await expect(page.getByTestId("workspace-active-team-count")).toHaveText("0");

    createdLeagueId = await waitForLeagueIdByName(baseURL, leagueName);
  });

  await test.step("invite twelve owners and teams into the new league", async () => {
    for (let slot = 1; slot <= TEAM_COUNT; slot += 1) {
      const padded = String(slot).padStart(2, "0");
      await inviteOwnerAndTeam(page, {
        ownerName: `Manual Owner ${padded}`,
        ownerEmail: `manual-owner-${padded}-${now}@example.test`,
        teamName: `Manual Team ${padded}`,
        teamAbbreviation: `M${padded}`,
        divisionLabel: slot <= 6 ? "North" : "South",
        expectedTeamCount: slot,
      });
    }
  });

  await test.step("create and start the rookie draft from the UI", async () => {
    await page.goto("/draft/rookie");
    await expect(page.getByTestId("rookie-draft-workspace")).toBeVisible();

    await page.getByLabel("Session Title").fill(rookieDraftTitle);
    await page.getByRole("button", { name: /Create Draft & Generate Board|Generate Board/i }).click();

    await expect(page.getByText("Generated Draft Order")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Start Rookie Draft" })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole("button", { name: "Start Rookie Draft" }).click();

    rookieDraftId = await waitForActiveDraftId(baseURL, createdLeagueId, "ROOKIE");
    await expect
      .poll(
        async () => {
          const payload = await getRookieDraftDetail(baseURL, createdLeagueId, rookieDraftId);
          return payload.draft.status;
        },
        {
          timeout: 20_000,
          message: "Expected the rookie draft to enter IN_PROGRESS after starting from the UI.",
        },
      )
      .toBe("IN_PROGRESS");
    await page.goto(draftSessionPath("rookie", rookieDraftId));
    await expect(page.getByTestId("rookie-draft-room-status")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("make the first rookie selection and complete the rest of the rookie draft", async () => {
    await page.getByRole("link", { name: "Review Prospect Pool" }).click();

    const firstProspect = page.locator('[aria-label^="Select "]').first();
    await firstProspect.scrollIntoViewIfNeeded();
    await expect(firstProspect).toBeVisible({ timeout: 20_000 });
    await firstProspect.click();

    const makePickButton = page
      .getByRole("button", { name: /^(Make Pick:|Commissioner Pick:)/ })
      .first();
    await expect(makePickButton).toBeEnabled({ timeout: 10_000 });
    await makePickButton.click();

    await expect
      .poll(
        async () => {
          const payload = await getRookieDraftDetail(baseURL, createdLeagueId, rookieDraftId);
          return payload.draft.progress.picksMade;
        },
        {
          timeout: 20_000,
          message: "Expected the rookie draft to record one completed pick.",
        },
      )
      .toBe(1);

    await completeRemainingRookiePicksByForfeit(page, baseURL, createdLeagueId, rookieDraftId);

    await expect
      .poll(
        async () => {
          const payload = await getRookieDraftDetail(baseURL, createdLeagueId, rookieDraftId);
          return JSON.stringify({
            status: payload.draft.status,
            picksMade: payload.draft.progress.picksMade,
            totalPicks: payload.draft.progress.totalPicks,
            currentPickNumber: payload.draft.progress.currentPickNumber,
          });
        },
        {
          timeout: 20_000,
          message: "Expected the rookie draft to finish with every board slot resolved.",
        },
      )
      .toBe(
        JSON.stringify({
          status: "COMPLETED",
          picksMade: TEAM_COUNT * 2,
          totalPicks: TEAM_COUNT * 2,
          currentPickNumber: null,
        }),
      );

    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Draft & Generate Board" })).toBeVisible();
  });

  await test.step("create, finalize, and start a single-player veteran emergency auction", async () => {
    await page.goto("/draft/veteran-auction");
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();
    await expect(page.getByTestId("veteran-auction-setup-controls")).toBeVisible();

    await page.getByLabel("Draft Title").fill(veteranAuctionTitle);
    await page.getByLabel("Auction Mode").selectOption("EMERGENCY_FILL_IN");
    await page.getByLabel("Open Bid Window (seconds)").fill(String(OPEN_BID_WINDOW_SECONDS));
    await page.getByLabel("Bid Reset Window (seconds)").fill(String(RESET_WINDOW_SECONDS));

    await expect(page.getByRole("heading", { name: "Emergency Fill-In Pool" })).toBeVisible({ timeout: 20_000 });
    const emergencyCandidateCheckbox = page.getByRole("checkbox").first();
    await expect(emergencyCandidateCheckbox).toBeVisible({ timeout: 20_000 });
    await emergencyCandidateCheckbox.check();

    await page.getByRole("button", { name: /Create Auction & Generate Pool|Generate Auction Pool/i }).click();

    const finalizePoolButton = page.getByRole("button", { name: "Finalize Pool" });
    await expect(finalizePoolButton).toBeEnabled({ timeout: 30_000 });
    await finalizePoolButton.click();

    await expect(page.getByRole("button", { name: "Pool Finalized" })).toBeVisible({ timeout: 20_000 });
    const startAuctionButton = page.getByRole("button", { name: "Start Veteran Auction" });
    await expect(startAuctionButton).toBeEnabled({ timeout: 20_000 });
    await startAuctionButton.click();

    veteranAuctionId = await waitForActiveDraftId(baseURL, createdLeagueId, "VETERAN_AUCTION");
    await page.goto(draftSessionPath("veteran-auction", veteranAuctionId));
    await expect(page.getByTestId("auction-layout-desktop")).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(
        async () => {
          const room = await getAuctionRoom(baseURL, createdLeagueId, COMMISSIONER_EMAIL, veteranAuctionId);
          return JSON.stringify({
            status: room.draft.status,
            totalEntries: room.summary.totalEntries,
            openMarketCount: room.summary.openMarketCount,
            activeBiddingCount: room.summary.activeBiddingCount,
          });
        },
        {
          timeout: 20_000,
          message: "Expected the veteran emergency auction to start with one open market player.",
        },
      )
      .toBe(
        JSON.stringify({
          status: "IN_PROGRESS",
          totalEntries: 1,
          openMarketCount: 1,
          activeBiddingCount: 0,
        }),
      );
  });

  await test.step("log in as the first invited owner and place the opening auction bid", async () => {
    const roomBeforeBid = await getAuctionRoom(baseURL, createdLeagueId, COMMISSIONER_EMAIL, veteranAuctionId);
    expect(roomBeforeBid.summary.totalEntries).toBe(1);

    const openMarketRow = roomBeforeBid.boardRows.find((row) => row.displayState === "OPEN_MARKET");
    expect(openMarketRow, "Expected the emergency auction player to be open for bidding.").toBeTruthy();
    targetedAuctionPlayerId = openMarketRow!.playerId;
    targetedAuctionPlayerName = openMarketRow!.playerName;

    const veteranAuctionPath = draftSessionPath("veteran-auction", veteranAuctionId);
    await loginThroughUi(page, {
      role: "owner",
      email: ownerOneEmail,
      leagueId: createdLeagueId,
      returnTo: veteranAuctionPath,
      switchSession: true,
    });

    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();
    await expect(page.getByTestId(`auction-row-${targetedAuctionPlayerId}`)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`auction-row-${targetedAuctionPlayerId}`).click();

    const decisionOverlay = page
      .getByTestId("player-decision-overlay-desktop")
      .or(page.getByTestId("player-decision-overlay-mobile"));
    await expect(decisionOverlay).toBeVisible({ timeout: 10_000 });

    await decisionOverlay.getByTestId("auction-bid-salary-input").fill("1");
    await decisionOverlay.getByTestId("auction-bid-years-select").selectOption("1");

    const placeBidResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/api/drafts/${veteranAuctionId}/auction/open-bids`),
    );

    await decisionOverlay.getByTestId("auction-bid-submit-button").click();

    const placeBidResponse = await placeBidResponsePromise;
    expect(placeBidResponse.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const room = await getAuctionRoom(baseURL, createdLeagueId, ownerOneEmail, veteranAuctionId);
          const row = room.boardRows.find((entry) => entry.playerId === targetedAuctionPlayerId);
          return JSON.stringify({
            leader: row?.currentLeaderTeamName ?? null,
            salary: row?.leadingSalary ?? null,
            years: row?.leadingYears ?? null,
            state: row?.displayState ?? null,
          });
        },
        {
          timeout: 20_000,
          message: "Expected the opening bid to become the authoritative leading offer.",
        },
      )
      .toBe(
        JSON.stringify({
          leader: ownerOneTeamName,
          salary: 1,
          years: 1,
          state: "ACTIVE_BIDDING",
        }),
      );

    await expect
      .poll(
        async () => {
          const room = await getAuctionRoom(baseURL, createdLeagueId, ownerOneEmail, veteranAuctionId);
          const row = room.boardRows.find((entry) => entry.playerId === targetedAuctionPlayerId);
          if (!row?.openBidClosesAt) {
            return false;
          }

          return Date.now() >= new Date(row.openBidClosesAt).getTime() + 1_000;
        },
        {
          timeout: (OPEN_BID_WINDOW_SECONDS + 15) * 1000,
          message: "Expected the open bid window to expire before commissioner sync.",
        },
      )
      .toBe(true);
  });

  await test.step("switch back to commissioner, sync expired auction status, and verify award finalization", async () => {
    const veteranAuctionPath = draftSessionPath("veteran-auction", veteranAuctionId);
    await loginThroughUi(page, {
      role: "commissioner",
      email: COMMISSIONER_EMAIL,
      returnTo: veteranAuctionPath,
      switchSession: true,
    });

    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();
    const syncButton = page.getByTitle("Sync Status / Awards");
    await expect(syncButton).toBeVisible({ timeout: 15_000 });

    const syncResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/api/drafts/${veteranAuctionId}/auction/status/sync`),
    );

    await syncButton.click();

    const syncResponse = await syncResponsePromise;
    expect(syncResponse.ok()).toBeTruthy();
    const syncPayload = (await syncResponse.json()) as AuctionStatusSyncPayload;
    expect(syncPayload.summary.awardsCreated).toBe(1);
    expect(syncPayload.summary.reviewRequiredCount).toBe(0);
    expect(syncPayload.summary.completed).toBe(true);

    await expect
      .poll(
        async () => {
          const room = await getAuctionRoom(baseURL, createdLeagueId, COMMISSIONER_EMAIL, veteranAuctionId);
          const row = room.boardRows.find((entry) => entry.playerId === targetedAuctionPlayerId);
          return JSON.stringify({
            draftStatus: room.draft.status,
            totalEntries: room.summary.totalEntries,
            resolvedEntries: room.draft.progress.picksMade,
            awardedCount: room.summary.awardedCount,
            state: row?.displayState ?? null,
            team: row?.awardedTeamName ?? null,
            salary: row?.awardedSalary ?? null,
            years: row?.awardedYears ?? null,
          });
        },
        {
          timeout: 30_000,
          message: "Expected sync to award the player and complete the auction.",
        },
      )
      .toBe(
        JSON.stringify({
          draftStatus: "COMPLETED",
          totalEntries: 1,
          resolvedEntries: 1,
          awardedCount: 1,
          state: "AWARDED",
          team: ownerOneTeamName,
          salary: 1,
          years: 1,
        }),
      );

    await expect(page.getByRole("heading", { name: "Pool Generation and Start Controls" })).toBeVisible();
    await expect(page.getByRole("heading", { name: targetedAuctionPlayerName, exact: true })).toBeVisible();
    await expect(page.getByText("Already Awarded / Active Contract")).toBeVisible();
  });
});
