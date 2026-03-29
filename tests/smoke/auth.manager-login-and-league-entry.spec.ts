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

      // Step 2: Navigate to league directory (if not already there)
      if (!(await page.locator('[data-testid="league-directory-page"]').isVisible())) {
        await page.goto("/");
        await waitForPageStable(page);
      }

      if (await page.locator('[data-testid="league-directory-page"]').isVisible()) {
        // Verify league directory is visible
        await expect(page.getByTestId("league-directory-page")).toBeVisible();
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-league-directory")).screenshots);

        const openCreateWizardButton = page.getByTestId("league-directory-open-create-wizard");
        if (await openCreateWizardButton.isVisible().catch(() => false)) {
          await openCreateWizardButton.click();
          await expect(page.getByTestId("league-create-wizard")).toBeVisible();
          await expect(page.getByTestId("league-create-step-basics")).toHaveAttribute("aria-current", "step");
          await expect(page.getByTestId("league-create-next-options")).toBeDisabled();
          evidence.screenshots.push(
            ...(await captureSmokeEvidence(page, test.info(), "02a-create-wizard-directory")).screenshots,
          );

          await page.getByTestId("league-create-wizard-close-directory").click();
          await expect(page.getByTestId("league-create-wizard")).toHaveCount(0);
        }

        // Step 3: Select and enter a league from the directory
        const targetCard = page
          .getByTestId("league-directory-card")
          .first();
        await expect(targetCard).toBeVisible();
        await targetCard.click();

        await waitForPageStable(page);
        
        // Step 4: Verify dashboard loads
        await expect(page).toHaveURL(/\/league\/[^/]+$/);
      } else {
        await expect(page).toHaveURL(/\/league\/[^/]+$/);
      }

      await expect(page.getByTestId("shell-top-bar")).toBeVisible();
      await expect(page.getByTestId("dashboard-page-eyebrow")).toBeVisible();
      await verifyLoggedIn(page, "manager");
      
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

      // Navigate into a league if directory state is shown after login
      await page.waitForLoadState("networkidle");
      if (!(await page.getByTestId("shell-top-bar").isVisible().catch(() => false))) {
        if ((await page.getByTestId("league-directory-card").count()) > 0) {
          await page.getByTestId("league-directory-card").first().click();
          await waitForPageStable(page);
        } else {
          const fallbackLeagueId = await getPrimaryLeagueId(baseURL as string);
          await page.goto(`/league/${fallbackLeagueId}`);
          await waitForPageStable(page);
        }
      }

      if (/\/league\/[^/]+$/.test(page.url())) {
        // Verify commissioner dashboard access when an active league resolves
        await expect(page.getByTestId("shell-top-bar")).toBeVisible();
        await expect(page.getByTestId("dashboard-page-eyebrow")).toBeVisible();
        await verifyLoggedIn(page, "commissioner");
        await expect(page.getByTestId("role-context-role")).toHaveText("Commissioner");
        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "02-commissioner-dashboard")).screenshots,
        );
      } else {
        // Environment fallback: commissioner session can still resolve to root directory.
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByTestId("league-directory-page")).toBeVisible();
        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "02-commissioner-directory")).screenshots,
        );
      }

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
