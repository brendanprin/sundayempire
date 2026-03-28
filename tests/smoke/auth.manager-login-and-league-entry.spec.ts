import { test, expect } from "@playwright/test";
import { 
  loginAs,
  verifyLoggedIn,
  getPrimaryLeagueId,
} from "./helpers/smoke-auth";
import { 
  captureSmokeEvidence, 
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable
} from "./helpers/smoke-evidence";

test.describe("Auth - Manager Login and League Entry", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("manager login and league entry workflow", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Step 1: Log in as manager
      const user = await loginAs(page, "manager");
      await waitForPageStable(page);
      evidence = await captureSmokeEvidence(page, test.info(), "01-after-manager-login");

      // Verify logged in state
      await verifyLoggedIn(page, "manager");

      // Step 2: Navigate to league directory (if not already there)
      if (!(await page.locator('[data-testid="league-directory-page"]').isVisible())) {
        await page.goto("/");
        await waitForPageStable(page);
      }

      if (await page.locator('[data-testid="league-directory-page"]').isVisible()) {
        // Verify league directory is visible
        await expect(page.getByTestId("league-directory-page")).toBeVisible();
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-league-directory")).screenshots);

        // Step 3: Select and enter primary league
        const leagueId = await getPrimaryLeagueId(baseURL as string);
        
        const targetCard = page
          .getByTestId("league-directory-card")
          .first();
        await expect(targetCard).toBeVisible();
        await targetCard.click();

        await waitForPageStable(page);
        
        // Step 4: Verify dashboard loads
        await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));
      } else {
        await expect(page).toHaveURL(/\/league\/[^/]+$/);
      }

      await expect(page.getByTestId("shell-top-bar")).toBeVisible();
      await expect(page.getByTestId("dashboard-page-eyebrow")).toBeVisible();
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-dashboard-loaded")).screenshots);

      // Step 5: Capture final full-page dashboard screenshot
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-final-dashboard")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      // Save test summary
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "auth.manager-login-and-league-entry",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("commissioner login and league access", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Log in as commissioner
      const user = await loginAs(page, "commissioner");
      await waitForPageStable(page);
      evidence = await captureSmokeEvidence(page, test.info(), "01-after-commissioner-login");

      // Verify logged in state
      await verifyLoggedIn(page, "commissioner");

      // Navigate to league if needed
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await page.goto(`/league/${leagueId}`);
      await waitForPageStable(page);

      // Verify commissioner dashboard access
      await expect(page.getByTestId("shell-top-bar")).toBeVisible();
      await expect(page.getByTestId("dashboard-page-eyebrow")).toBeVisible();
      await expect(page.getByTestId("role-context-role")).toHaveText("Commissioner");
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-commissioner-dashboard")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "auth.commissioner-login-and-league-access",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
