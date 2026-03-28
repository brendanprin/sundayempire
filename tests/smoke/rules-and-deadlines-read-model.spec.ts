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

test.describe("Rules and Deadlines Read Model", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("rules and deadlines backend state display", async ({ page, baseURL }) => {
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

      // Step 2: Navigate to Rules & Deadlines
      const rulesLink = page.getByRole("link", { name: /rules|deadlines|guidelines/i });
      if (await rulesLink.isVisible()) {
        await rulesLink.click();
      } else {
        // Try direct navigation
        await page.goto("/rules");
      }

      await waitForPageStable(page);
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-rules-page-loaded")).screenshots);

      // Step 3: Verify current phase and deadlines render from backend state
      const phaseIndicators = [
        page.getByText(/current phase/i),
        page.getByText(/preseason|regular season|playoffs|offseason/i),
        page.getByTestId("current-phase"),
        page.locator('[data-testid*="phase"]')
      ];

      let phaseVisible = false;
      for (const indicator of phaseIndicators) {
        if (await indicator.first().isVisible()) {
          phaseVisible = true;
          break;
        }
      }
      
      if (!phaseVisible) {
        errors.push("No current phase indicators found on rules page");
      }

      // Verify deadline information is displayed
      const deadlineIndicators = [
        page.getByText(/deadline/i),
        page.getByText(/due/i),
        page.getByText(/upcoming/i),
        page.locator('[data-testid*="deadline"]'),
        page.locator('table'),
        page.locator('.deadline, .due-date')
      ];

      let deadlinesVisible = false;
      for (const indicator of deadlineIndicators) {
        if (await indicator.first().isVisible()) {
          deadlinesVisible = true;
          break;
        }
      }

      if (!deadlinesVisible) {
        errors.push("No deadline information found on rules page");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-rules-content-verification")).screenshots);

      // Step 4: Verify content is not empty placeholder copy
      const content = await page.textContent('main, [role="main"], .content, .page-content');
      const hasRealContent = content && content.length > 100; // Reasonable minimum for non-placeholder content
      
      if (!hasRealContent) {
        errors.push("Rules page appears to have placeholder or minimal content");
      }

      // Look for specific rule-related content
      const ruleContentIndicators = [
        /roster/i,
        /salary cap/i,
        /trade/i,
        /draft/i,
        /waiver/i,
        /contract/i,
        /pick/i,
      ];

      let ruleContentFound = false;
      for (const pattern of ruleContentIndicators) {
        if (content && pattern.test(content)) {
          ruleContentFound = true;
          break;
        }
      }

      if (!ruleContentFound) {
        errors.push("No recognizable rule content found on rules page");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-final-rules-state")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "rules-and-deadlines-read-model",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("commissioner rules and deadlines access", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Log in as commissioner
      await loginAs(page, "commissioner");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-commissioner-dashboard");

      // Navigate to rules
      await page.goto("/rules");
      await waitForPageStable(page);
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-commissioner-rules-view")).screenshots);

      // Commissioners should see the same rules content as managers
      const content = await page.textContent('main, [role="main"]');
      if (!content || content.length < 100) {
        errors.push("Commissioner rules page appears to have insufficient content");
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "rules-and-deadlines-commissioner-access",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});