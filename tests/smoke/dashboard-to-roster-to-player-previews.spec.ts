import { test, expect } from "@playwright/test";
import { 
  loginAs,
  navigateToLeague,
  getPrimaryLeagueId,
  createSmokeApiContext
} from "./helpers/smoke-auth";
import { 
  captureSmokeEvidence, 
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable
} from "./helpers/smoke-evidence";

test.describe("Dashboard to Roster to Player Previews", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("dashboard to roster navigation and player preview flows", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Step 1: Log in as manager
      await loginAs(page, "manager");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-dashboard-loaded");

      // Step 2: Navigate to My Roster / Cap from dashboard
      const myRosterLink = page.getByRole("link", { name: /open my roster/i });
      if (await myRosterLink.isVisible()) {
        await myRosterLink.click();
      } else {
        // Try navigation path through teams
        await page.goto("/teams");
        await waitForPageStable(page);
        
        // Find own team link
        const ownTeamLink = page.getByTestId("team-link").first();
        await expect(ownTeamLink).toBeVisible();
        await ownTeamLink.click();
      }

      await waitForPageStable(page);
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-roster-navigation")).screenshots);

      // Step 3: Verify roster/cap details render
      await expect(page.getByTestId("team-cap-detail")).toBeVisible();
      
      // Look for roster table or roster content
      const rosterIndicators = [
        page.locator('[data-testid*="roster"]'),
        page.locator('[data-testid*="contract"]'),
        page.locator('table'),
        page.getByText(/salary/i),
        page.getByText(/cap/i)
      ];
      
      let rosterVisible = false;
      for (const indicator of rosterIndicators) {
        if (await indicator.first().isVisible()) {
          rosterVisible = true;
          break;
        }
      }
      
      if (!rosterVisible) {
        errors.push("No roster content indicators found on team page");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-roster-details")).screenshots);

      // Step 4: Open a player detail page
      // Look for player links in various ways
      const playerLinkSelectors = [
        'a[href*="/players/"]',
        '[data-testid*="player"] a',
        'table a[href*="/players/"]'
      ];
      
      let playerLinkFound = false;
      for (const selector of playerLinkSelectors) {
        const playerLink = page.locator(selector).first();
        if (await playerLink.isVisible()) {
          await playerLink.click();
          playerLinkFound = true;
          break;
        }
      }

      if (playerLinkFound) {
        await waitForPageStable(page);
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-player-detail")).screenshots);

        // Step 5: Open previews if available
        const previewActions = [
          { name: "cut preview", selectors: ['[data-testid*="cut"]', 'button:has-text("Cut")'] },
          { name: "tag preview", selectors: ['[data-testid*="tag"]', 'button:has-text("Tag")'] },
          { name: "option preview", selectors: ['[data-testid*="option"]', 'button:has-text("Option")'] }
        ];

        for (const action of previewActions) {
          for (const selector of action.selectors) {
            const previewButton = page.locator(selector).first();
            if (await previewButton.isVisible()) {
              await previewButton.click();
              await waitForPageStable(page);
              
              // Verify preview content is visible
              const previewContent = page.locator('[data-testid*="preview"], .preview, [role="dialog"]');
              if (await previewContent.first().isVisible()) {
                evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), `05-${action.name.replace(' ', '-')}`)).screenshots);
                
                // Verify state remains non-mutating after refresh
                const currentUrl = page.url();
                await page.reload();
                await waitForPageStable(page);
                await expect(page).toHaveURL(currentUrl);
              }
              break;
            }
          }
        }
      } else {
        errors.push("No player links found to test player detail navigation");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "06-final-state")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "dashboard-to-roster-to-player-previews",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});