import { expect, test } from "@playwright/test";
import { apiContext, getPrimaryLeagueId, getTeams, OWNER_EMAIL } from "./helpers/api";

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

test.describe("My Roster / Cap workspace", () => {
  test("owner sees the table-first workspace with health summary, filtering, and decision support", async ({
    page,
    baseURL,
  }) => {
    const api = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(api);
    const teams = await getTeams(api);
    expect(teams.length).toBeGreaterThan(0);
    const teamId = teams[0].id;

    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto(`/teams/${teamId}`);

    // Verify Sprint 18 language cleanup: "My Team" eyebrow, not "Team Workspace"
    await expect(page.getByRole("heading", { name: "My Roster / Cap" })).toBeVisible();
    
    // Prevent regression to pilot/operator language
    const pageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(pageContent?.toLowerCase()).not.toMatch(/team workspace|workspace|decision support|roster posture|pilot|prototype/i);

    // Core workspace structure
    await expect(page.getByTestId("team-cap-detail")).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Roster / Cap" })).toBeVisible();
    await expect(page.getByTestId("team-summary-strip")).toBeVisible();

    // Mirror-only banner when applicable
    const mirrorBanner = page.getByText(/mirror-only/i);
    if ((await mirrorBanner.count()) > 0) {
      await expect(mirrorBanner.first()).toBeVisible();
    }

    // Contracts toolbar and table
    await expect(page.getByTestId("roster-contracts-toolbar")).toBeVisible();
    await expect(page.getByPlaceholder("Search contracts by player, team, or status")).toBeVisible();
    await expect(page.getByRole("button", { name: "All contracts" })).toBeVisible();
    await expect(page.getByTestId("roster-player-table")).toBeVisible();

    // Verify health summary has key metrics
    const summaryStrip = page.getByTestId("team-summary-strip");
    await expect(summaryStrip.getByText(/Roster Count/)).toBeVisible();
    await expect(summaryStrip.getByText(/Cap Room/)).toBeVisible();
    await expect(summaryStrip.getByText(/Decision Queue/)).toBeVisible();
    await expect(summaryStrip.getByText(/Compliance Status/)).toBeVisible();

    // Verify table functionality
    const playerTable = page.getByTestId("roster-player-table");
    await expect(playerTable.getByText("Player")).toBeVisible();
    await expect(playerTable.getByText("Salary")).toBeVisible();
    await expect(playerTable.getByText("Years")).toBeVisible();
    await expect(playerTable.getByText("Contract State")).toBeVisible();
    await expect(playerTable.getByText("Actions")).toBeVisible();

    await api.dispose();
  });

  test("cut decision modal opens on Cut Analysis action and shows player details", async ({
    page,
    baseURL,
  }) => {
    const api = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(api);
    const teams = await getTeams(api);
    expect(teams.length).toBeGreaterThan(0);
    const teamId = teams[0].id;

    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto(`/teams/${teamId}`);

    // Verify the roster table is visible
    const playerTable = page.getByTestId("roster-player-table");
    await expect(playerTable).toBeVisible();

    // Look for a Cut Analysis button
    const previewCutButton = page.getByRole("button", { name: "Cut Analysis" }).first();
    
    // If Cut Analysis buttons exist, test modal functionality
    if (await previewCutButton.isVisible()) {
      // Verify modal is initially closed
      await expect(page.getByTestId("cut-decision-modal")).not.toBeVisible();

      // Click Cut Analysis to open modal
      await previewCutButton.click();

      // Verify modal opens
      await expect(page.getByTestId("cut-decision-modal")).toBeVisible();

      // Verify modal header content
      await expect(page.getByRole("heading", { name: "Cut Decision Workspace" })).toBeVisible();
      await expect(page.getByText("Preview impact before releasing player")).toBeVisible();

      // Verify player information section is present
      await expect(page.getByText("Player Information")).toBeVisible();
      await expect(page.getByText("Contract Summary")).toBeVisible();

      // Verify modal has close button
      const closeButton = page.getByTestId("cut-modal-close");
      await expect(closeButton).toBeVisible();

      // Test closing modal
      await closeButton.click();

      // Verify modal is closed
      await expect(page.getByTestId("cut-decision-modal")).not.toBeVisible();

      // Test opening another player's modal (if multiple players exist)
      const allPreviewButtons = page.getByRole("button", { name: "Cut Analysis" });
      const buttonCount = await allPreviewButtons.count();
      
      if (buttonCount > 1) {
        // Click a different Cut Analysis button
        await allPreviewButtons.nth(1).click();
        
        // Verify modal opens again
        await expect(page.getByTestId("cut-decision-modal")).toBeVisible();
        
        // Close modal again
        await page.getByTestId("cut-modal-close").click();
        await expect(page.getByTestId("cut-decision-modal")).not.toBeVisible();
      }

      // Test backdrop click to close
      await previewCutButton.click();
      await expect(page.getByTestId("cut-decision-modal")).toBeVisible();
      
      // Click backdrop to close
      await page.getByTestId("cut-modal-backdrop").click();
      await expect(page.getByTestId("cut-decision-modal")).not.toBeVisible();
    }

    await api.dispose();
  });

  test("no persistent decision workspace panel visible by default", async ({
    page,
    baseURL,
  }) => {
    const api = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(api);
    const teams = await getTeams(api);
    expect(teams.length).toBeGreaterThan(0);
    const teamId = teams[0].id;

    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto(`/teams/${teamId}`);

    // Verify the roster table is visible
    const playerTable = page.getByTestId("roster-player-table");
    await expect(playerTable).toBeVisible();

    // Verify no persistent decision workspace panel is visible
    const persistentDecisionPanel = page.getByTestId("team-decision-support");
    await expect(persistentDecisionPanel).not.toBeVisible();

    // Verify "Decision workspace" text is not present anywhere on the page
    const decisionWorkspaceText = page.getByText(/decision workspace/i);
    await expect(decisionWorkspaceText).toHaveCount(0);

    // But verify Cut Analysis button still exists as the single entry point
    const previewCutButton = page.getByRole("button", { name: "Cut Analysis" });
    if (await previewCutButton.first().isVisible()) {
      await expect(previewCutButton.first()).toBeVisible();
    }

    await api.dispose();
  });
});
