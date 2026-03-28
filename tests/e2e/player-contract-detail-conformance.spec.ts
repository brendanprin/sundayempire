import { expect, test } from "@playwright/test";
import {
  apiContext,
  getPrimaryLeagueId,
  getTeams,
  OWNER_EMAIL,
  READ_ONLY_EMAIL,
} from "./helpers/api";

async function activateLeagueContext(baseURL: string, email: string, leagueId: string) {
  const ctx = await apiContext(baseURL, email);
  const response = await ctx.post("/api/league/context", {
    data: {
      leagueId,
    },
  });
  expect(response.ok()).toBeTruthy();
  await ctx.dispose();
}

async function getOwnerPlayerContext(baseURL: string) {
  const api = await apiContext(baseURL, OWNER_EMAIL);
  const leagueId = await getPrimaryLeagueId(api);
  const teams = await getTeams(api);
  expect(teams.length).toBeGreaterThan(0);
  const teamId = teams[0].id;

  const detailResponse = await api.get(`/api/teams/${teamId}/detail`);
  expect(detailResponse.ok()).toBeTruthy();
  const detailPayload = (await detailResponse.json()) as {
    detail: {
      contracts: Array<{
        player: {
          id: string;
          name: string;
        };
      }>;
    };
  };

  expect(detailPayload.detail.contracts.length).toBeGreaterThan(0);
  const player = detailPayload.detail.contracts[0].player;

  await api.dispose();

  return {
    leagueId,
    playerId: player.id,
    playerName: player.name,
  };
}

test.describe("Player / Contract Detail conformance", () => {
  test("owner sees decision-first hierarchy with contract snapshot, action availability, and impact preview prominently", async ({
    page,
    baseURL,
  }) => {
    const { leagueId, playerId, playerName } = await getOwnerPlayerContext(baseURL as string);

    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto(`/players/${playerId}`);

    // Verify Sprint 18 language cleanup: "Player Detail" eyebrow, not "Player Decision Page"
    const pageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(pageContent?.toLowerCase()).not.toMatch(/player decision page|decision page|preview-backed|workflow|pilot|prototype/i);

    // Core structure
    await expect(page.getByTestId("player-contract-detail")).toBeVisible();
    await expect(page.getByRole("heading", { name: playerName })).toBeVisible();
    
    // Contract snapshot with status chips
    await expect(page.getByTestId("player-summary-strip")).toBeVisible();
    
    // Action availability prominently displayed
    await expect(page.getByTestId("player-preview-actions")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Action Availability" })).toBeVisible();
    
    // Impact preview connected to actions
    await expect(page.getByTestId("player-impact-preview")).toBeVisible();
    
    // Secondary context present but not prominent
    await expect(page.getByTestId("player-context-snapshot")).toBeVisible();
    await expect(page.getByTestId("player-secondary-context")).toBeVisible();

    // Decision-focused action buttons prominently displayed
    await expect(page.getByRole("button", { name: "Preview Cut Impact" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview Tag Impact" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview Option Impact" })).toBeVisible();

    // Verify action availability indicators
    await expect(page.getByText("Available")).toBeVisible();
    await expect(page.getByText("Action Availability")).toBeVisible();

    // Contract snapshot should show key metrics
    const summaryStrip = page.getByTestId("player-summary-strip");
    await expect(summaryStrip.getByText(/Current Team/)).toBeVisible();
    await expect(summaryStrip.getByText("Contract", { exact: true })).toBeVisible();
    await expect(summaryStrip.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(summaryStrip.getByText(/Dead Cap Risk/)).toBeVisible();
  });

  test("read-only viewers see blocked-action explanations with prominent availability indicators", async ({
    page,
    baseURL,
  }) => {
    const { leagueId, playerId } = await getOwnerPlayerContext(baseURL as string);

    await activateLeagueContext(baseURL as string, READ_ONLY_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": READ_ONLY_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto(`/players/${playerId}`);

    await expect(page.getByTestId("player-contract-detail")).toBeVisible();
    
    // Action buttons should be disabled
    await expect(page.getByRole("button", { name: "Preview Cut Impact" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Preview Tag Impact" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Preview Option Impact" })).toBeDisabled();
    
    // Should see "Blocked" indicators
    await expect(page.getByText("Blocked").first()).toBeVisible();
    
    // Should see blocking explanations
    await expect(
      page.getByText("Cut previews are limited to commissioners and the owning manager."),
    ).toBeVisible();
    await expect(
      page.getByText("Franchise-tag previews are limited to commissioners and the owning manager."),
    ).toBeVisible();
    await expect(
      page.getByText("Rookie-option previews are limited to commissioners and the owning manager."),
    ).toBeVisible();

    // Contract snapshot should still be visible
    await expect(page.getByTestId("player-summary-strip")).toBeVisible();
    await expect(page.getByTestId("player-preview-actions")).toBeVisible();
  });
});
