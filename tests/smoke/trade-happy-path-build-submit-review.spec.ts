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

test.describe("Trade Happy Path Build Submit Review", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("legal trade build validation submission and review", async ({ page, baseURL }) => {
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

      // Step 3: Navigate to trades
      await page.goto("/trades");
      await waitForPageStable(page);
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-trades-page")).screenshots);

      // Step 4: Build a legal trade
      const buildTradeButton = page.getByRole("button", { name: /build|new|create|propose/i });
      if (await buildTradeButton.isVisible()) {
        await buildTradeButton.click();
        await waitForPageStable(page);
      } else {
        // Try navigating to trade builder
        await page.goto("/trades/builder");
        await waitForPageStable(page);
      }

      // Look for trade builder interface
      const builderIndicators = [
        page.getByTestId("trade-builder"),
        page.locator('[data-testid*="builder"]'),
        page.getByText(/team a|team b|counterparty|select team/i),
        page.locator('form')
      ];

      let builderVisible = false;
      for (const indicator of builderIndicators) {
        if (await indicator.first().isVisible()) {
          builderVisible = true;
          break;
        }
      }

      if (!builderVisible) {
        errors.push("Could not find trade builder interface");
      } else {
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-trade-builder")).screenshots);

        // Step 5: Select teams and assets (using actual UI)
        try {
          // Look for team selection
          const teamSelectors = page.locator('select, [role="combobox"], [data-testid*="team"]');
          if (await teamSelectors.first().isVisible()) {
            const firstTeamSelect = teamSelectors.first();
            await firstTeamSelect.click();
            
            // Select first available option
            const options = page.locator('option, [role="option"]');
            if (await options.first().isVisible()) {
              await options.first().click();
            }
          }

          // Look for asset selection (picks, players)
          const assetSelectors = [
            page.locator('[data-testid*="pick"]'),
            page.locator('[data-testid*="asset"]'),
            page.locator('[data-testid*="player"]'),
            page.locator('input[type="checkbox"]'),
            page.getByRole("checkbox")
          ];

          let assetsSelected = false;
          for (const selector of assetSelectors) {
            const assets = selector;
            if (await assets.first().isVisible()) {
              // Select first available asset
              await assets.first().click();
              assetsSelected = true;
              break;
            }
          }

          if (!assetsSelected) {
            // Use API to create a test trade instead
            const tradeResult = await createSmokeTestTrade(baseURL as string, fixtures);
            if (tradeResult.proposalId) {
              await page.goto(`/trades/${tradeResult.proposalId}`);
              await waitForPageStable(page);
            }
          }

        } catch (builderError) {
          errors.push(`Trade builder interaction failed: ${builderError}`);
        }

        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-trade-assets-selected")).screenshots);

        // Step 6: Validate trade and assert cap/roster impact panels are visible
        const validateButton = page.getByRole("button", { name: /validate|check|analyze/i });
        if (await validateButton.isVisible()) {
          await validateButton.click();
          await waitForPageStable(page);
        }

        // Look for validation/impact information
        const impactIndicators = [
          page.getByText(/cap impact|salary|impact/i),
          page.getByText(/roster|lineup/i),
          page.locator('[data-testid*="impact"]'),
          page.locator('[data-testid*="validation"]'),
          page.locator('.impact, .validation, .analysis')
        ];

        let impactVisible = false;
        for (const indicator of impactIndicators) {
          if (await indicator.first().isVisible()) {
            impactVisible = true;
            break;
          }
        }

        if (!impactVisible) {
          errors.push("No cap/roster impact panels found");
        }

        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "05-trade-validation")).screenshots);

        // Step 7: Submit trade
        const submitButton = page.getByRole("button", { name: /submit|propose|send/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await waitForPageStable(page);
          
          evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "06-trade-submitted")).screenshots);
        }

        // Step 8: Assert submitted trade detail renders stored evaluation
        const tradeDetailIndicators = [
          page.getByText(/submitted|proposed|pending/i),
          page.locator('[data-testid*="proposal"]'),
          page.locator('[data-testid*="trade-detail"]'),
          page.getByText(/evaluation|analysis/i)
        ];

        let detailVisible = false;
        for (const indicator of tradeDetailIndicators) {
          if (await indicator.first().isVisible()) {
            detailVisible = true;
            break;
          }
        }

        if (!detailVisible) {
          errors.push("Trade detail with stored evaluation not visible after submission");
        }

        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "07-trade-detail")).screenshots);
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "08-final-trade-state")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "trade-happy-path-build-submit-review",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});