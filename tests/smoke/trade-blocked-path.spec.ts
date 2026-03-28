import { test, expect } from "@playwright/test";
import { 
  loginAs,
  navigateToLeague,
  getPrimaryLeagueId,
  createSmokeApiContext
} from "./helpers/smoke-auth";
import { 
  setupSmokeFixtures,
  createSmokeTestTrade
} from "./helpers/smoke-fixtures";
import { 
  captureSmokeEvidence, 
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable
} from "./helpers/smoke-evidence";

test.describe("Trade Blocked Path", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("blocked trade validation and remediation guidance", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Step 1: Set up smoke fixtures
      const fixtures = await setupSmokeFixtures(baseURL as string);
      
      // Step 2: Log in as manager/owner  
      await loginAs(page, "manager");
      await navigateToLeague(page, fixtures.leagueId);
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-dashboard-loaded");

      // Step 3: Create or find a blocked trade scenario via API
      let blockedTradeId: string | null = null;
      const api = await createSmokeApiContext(baseURL as string, "manager");
      
      try {
        // Try to create an intentionally blocked trade
        const tradeResult = await createSmokeTestTrade(baseURL as string, fixtures, { shouldBlock: true });
        if (tradeResult.isBlocked && tradeResult.proposalId) {
          blockedTradeId = tradeResult.proposalId;
        }
        
        // Alternative: Create an invalid trade scenario by manipulating team cap
        if (!blockedTradeId) {
          const commissionerApi = await createSmokeApiContext(baseURL as string, "commissioner");
          
          try {
            // Put teams in cap violation state 
            for (const team of fixtures.teams.slice(0, 2)) {
              await commissionerApi.post("/api/commissioner/override/fix-team", {
                data: {
                  teamId: team.id,
                  targetCapType: "hard",
                  dryRun: false,
                  reason: "Smoke test cap violation setup"
                }
              });
            }
            
            // Now try to create a trade that would violate cap
            const violatingTrade = await createSmokeTestTrade(baseURL as string, fixtures);
            if (violatingTrade.isBlocked) {
              blockedTradeId = violatingTrade.proposalId;
            }
          } finally {
            await commissionerApi.dispose();
          }
        }
      } finally {
        await api.dispose();
      }

      // Step 4: Navigate to trades page
      await page.goto("/trades");
      await waitForPageStable(page);
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-trades-page")).screenshots);

      // Step 5: If we have a blocked trade, examine it
      if (blockedTradeId) {
        await page.goto(`/trades/${blockedTradeId}`);
        await waitForPageStable(page);
        
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-blocked-trade-detail")).screenshots);
      } else {
        // Try to create a blocked trade through the UI
        const buildTradeButton = page.getByRole("button", { name: /build|new|create|propose/i });
        if (await buildTradeButton.isVisible()) {
          await buildTradeButton.click();
          await waitForPageStable(page);
          
          // Try to build an invalid trade (e.g., trade with same team)
          const teamSelects = page.locator('select, [role="combobox"]');
          if (await teamSelects.first().isVisible() && await teamSelects.nth(1).isVisible()) {
            // Select same team for both sides (should be invalid)
            await teamSelects.first().click();
            const firstOption = page.locator('option').first();
            const optionValue = await firstOption.getAttribute('value');
            
            if (optionValue) {
              await teamSelects.first().selectOption(optionValue);
              await teamSelects.nth(1).selectOption(optionValue);
              
              // Try to validate - should show blocking
              const validateButton = page.getByRole("button", { name: /validate|check/i });
              if (await validateButton.isVisible()) {
                await validateButton.click();
                await waitForPageStable(page);
              }
            }
          }
        }
      }

      // Step 6: Assert blocked findings and remediation guidance are visible
      const blockingIndicators = [
        page.getByText(/blocked|invalid|violation|error/i),
        page.getByText(/cannot|not allowed|forbidden/i),
        page.locator('[data-testid*="blocked"]'),
        page.locator('[data-testid*="error"]'),
        page.locator('[data-testid*="violation"]'),
        page.locator('.error, .blocked, .violation')
      ];

      let blockingVisible = false;
      for (const indicator of blockingIndicators) {
        if (await indicator.first().isVisible()) {
          blockingVisible = true;
          break;
        }
      }

      if (!blockingVisible) {
        errors.push("No blocking/error indicators found - may not have successfully created blocked scenario");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-blocking-validation")).screenshots);

      // Step 7: Assert no misleading positive submit action is shown in blocked state
      const submitButtons = page.getByRole("button", { name: /submit|propose|send/i });
      const submitCount = await submitButtons.count();
      
      if (submitCount > 0) {
        // Check if submit buttons are properly disabled
        for (let i = 0; i < submitCount; i++) {
          const button = submitButtons.nth(i);
          const isEnabled = await button.isEnabled();
          if (isEnabled) {
            // This might be a problem - check if there are clear blocking messages
            const pageContent = await page.textContent('body');
            if (!pageContent || !/blocked|invalid|error/i.test(pageContent)) {
              errors.push("Submit button is enabled despite blocking conditions");
            }
          }
        }
      }

      // Look for remediation guidance
      const guidanceIndicators = [
        page.getByText(/fix|resolve|correct/i),
        page.getByText(/recommendation|suggestion/i),
        page.getByText(/try|consider|instead/i),
        page.locator('[data-testid*="guidance"]'),
        page.locator('[data-testid*="recommendation"]'),
        page.locator('.guidance, .help-text, .remediation')
      ];

      let guidanceVisible = false;
      for (const indicator of guidanceIndicators) {
        if (await indicator.first().isVisible()) {
          guidanceVisible = true;
          break;
        }
      }

      if (!guidanceVisible) {
        errors.push("No remediation guidance found for blocked trade");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "05-final-blocked-state")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "trade-blocked-path",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("trade validation error messaging clarity", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      await loginAs(page, "manager");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      
      await page.goto("/trades");
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-trade-validation-errors");

      // Look for any existing blocked trades or validation messages
      const pageContent = await page.textContent('body');
      
      if (pageContent) {
        const hasValidationContent = /validation|blocked|error|invalid/i.test(pageContent);
        
        if (!hasValidationContent) {
          errors.push("No validation or error messaging found on trades page");
        }
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "trade-validation-error-messaging",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});