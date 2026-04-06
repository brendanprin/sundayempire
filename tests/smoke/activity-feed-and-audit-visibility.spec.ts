import { test, expect } from "@playwright/test";
import { 
  loginAs,
  navigateToLeague,
  getPrimaryLeagueId
} from "./helpers/smoke-auth";
import { 
  captureSmokeEvidence, 
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable
} from "./helpers/smoke-evidence";

test.describe("Activity Feed and Audit Visibility", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("manager activity feed visibility and safety", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Step 1: Log in as manager/owner
      await loginAs(page, "manager");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-manager-dashboard");

      // Step 2: Open League Activity as manager
      await page.goto("/activity");
      await waitForPageStable(page);
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-activity-feed-manager")).screenshots);

      // Step 3: Verify the activity feed shell rendered
      await expect(page.getByTestId("activity-feed")).toBeVisible();

      // Visibility label must show league-visible scope (exact text from component)
      const visibilityLabel = page.getByTestId("activity-visibility-label");
      await expect(visibilityLabel).toBeVisible();
      await expect(visibilityLabel).toHaveText("League-visible events only");

      // Feed list must be present
      await expect(page.getByTestId("activity-feed-list")).toBeVisible();

      // Filters must be present — confirms the interactive controls rendered
      await expect(page.getByTestId("activity-filter-season")).toBeVisible();
      await expect(page.getByTestId("activity-filter-team")).toBeVisible();
      await expect(page.getByTestId("activity-filter-type")).toBeVisible();

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-manager-activity-verification")).screenshots);

      // Step 4: Exercise the type filter — confirms it's interactive
      const typeFilter = page.getByTestId("activity-filter-type");
      const optionCount = await typeFilter.locator("option").count();
      if (optionCount > 1) {
        // Select the second option (first non-"All") and verify feed doesn't crash
        await typeFilter.selectOption({ index: 1 });
        await waitForPageStable(page);
        await expect(page.getByTestId("activity-feed")).toBeVisible();

        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-activity-filter-applied")).screenshots);
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "05-final-manager-activity")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "activity-feed-manager-visibility",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("commissioner audit view and access control", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Step 1: Log in as commissioner
      await loginAs(page, "commissioner");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-commissioner-dashboard");

      // Step 2: Navigate directly to the commissioner audit page
      await page.goto("/commissioner/audit");
      await waitForPageStable(page);

      // The audit feed shell must render
      const auditFeed = page.getByTestId("commissioner-audit-feed");
      if (!(await auditFeed.isVisible())) {
        errors.push("commissioner-audit-feed not visible on /commissioner/audit");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-commissioner-audit-view")).screenshots);

      // Step 3: Audit scope label confirms commissioner-only context
      await expect(page.getByText("Commissioner-only operational history")).toBeVisible();

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-commissioner-audit-content")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "commissioner-audit-view",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("manager cannot access commissioner audit", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Log in as manager
      await loginAs(page, "manager");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      
      // Attempt to access the commissioner audit page directly
      await page.goto("/commissioner/audit");
      await waitForPageStable(page);

      // Manager must be redirected away — either to /no-access or back to a non-audit page
      const currentUrl = page.url();
      const landedOnAudit = currentUrl.includes("/commissioner/audit");

      if (landedOnAudit) {
        // If still on the audit page, the audit feed must NOT have rendered
        const auditFeed = page.getByTestId("commissioner-audit-feed");
        if (await auditFeed.isVisible()) {
          errors.push("Manager can access commissioner-audit-feed — role gate missing on /commissioner/audit");
        }
      } else {
        // Redirected — verify landed on the no-access page or a safe destination
        const noAccessPage = page.getByTestId("no-access-page");
        const safeRedirect = !currentUrl.includes("/commissioner");
        if (!(await noAccessPage.isVisible()) && !safeRedirect) {
          errors.push(`Manager redirected to unexpected URL: ${currentUrl}`);
        }
      }

      evidence = await captureSmokeEvidence(page, test.info(), "01-manager-audit-redirect");

      // Also verify the commissioner main console is gated
      await page.goto("/commissioner");
      await waitForPageStable(page);

      const commissionerPage = page.getByTestId("commissioner-page");
      if (await commissionerPage.isVisible()) {
        errors.push("Manager can see commissioner-page content on /commissioner — role gate missing");
      }
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-manager-audit-access-test");

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "manager-audit-access-restriction",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});