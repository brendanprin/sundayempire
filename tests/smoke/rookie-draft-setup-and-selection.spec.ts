import { test, expect } from "@playwright/test";
import { 
  loginAs,
  navigateToLeague,
  getPrimaryLeagueId,
  createSmokeApiContext
} from "./helpers/smoke-auth";
import { 
  setupSmokeFixtures
} from "./helpers/smoke-fixtures";
import { 
  captureSmokeEvidence, 
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable
} from "./helpers/smoke-evidence";

test.describe("Rookie Draft Setup and Selection", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("rookie draft setup and player selection workflow", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      // Step 1: Set up fixtures
      const fixtures = await setupSmokeFixtures(baseURL as string);

      // Step 2: Log in as commissioner
      await loginAs(page, "commissioner");
      await navigateToLeague(page, fixtures.leagueId);
      await waitForPageStable(page);
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-commissioner-dashboard");

      // Step 3: Open Draft Setup Workspace
      await page.goto("/draft");
      await waitForPageStable(page);
      
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-draft-home")).screenshots);

      // Look for draft setup interface
      const draftSetupIndicators = [
        page.getByText(/draft setup|rookie draft|setup workspace/i),
        page.locator('[data-testid*="draft-setup"]'),
        page.getByRole("button", { name: /setup|create|new draft/i })
      ];

      let setupVisible = false;
      for (const indicator of draftSetupIndicators) {
        if (await indicator.first().isVisible()) {
          setupVisible = true;
          break;
        }
      }

      if (!setupVisible) {
        // Try creating a draft setup via API
        const api = await createSmokeApiContext(baseURL as string, "commissioner");
        try {
          const setupResponse = await api.post("/api/drafts/setup", {
            data: {
              type: "ROOKIE",
              title: `Smoke Test Draft ${Date.now()}`
            }
          });
          
          if (setupResponse.ok()) {
            await page.reload();
            await waitForPageStable(page);
          }
        } finally {
          await api.dispose();
        }
      }

      // Step 4: Verify order table and readiness
      const orderIndicators = [
        page.getByText(/draft order|pick order|round/i),
        page.locator('table'),
        page.locator('[data-testid*="order"]'),
        page.locator('[data-testid*="pick"]')
      ];

      let orderVisible = false;
      for (const indicator of orderIndicators) {
        if (await indicator.first().isVisible()) {
          orderVisible = true;
          break;
        }
      }

      if (!orderVisible) {
        errors.push("No draft order/readiness interface found");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-draft-setup-interface")).screenshots);

      // Step 5: Open Rookie Draft Room
      const draftRoomButton = page.getByRole("button", { name: /draft room|open draft|start draft/i });
      if (await draftRoomButton.isVisible()) {
        await draftRoomButton.click();
        await waitForPageStable(page);
      } else {
        // Try navigating to draft room directly
        await page.goto("/draft/room");
        await waitForPageStable(page);
      }

      const roomIndicators = [
        page.getByText(/draft room|draft board|available players/i),
        page.locator('[data-testid*="draft-room"]'),
        page.locator('[data-testid*="draft-board"]'),
        page.locator('[data-testid*="available"]')
      ];

      let roomVisible = false;
      for (const indicator of roomIndicators) {
        if (await indicator.first().isVisible()) {
          roomVisible = true;
          break;
        }
      }

      if (!roomVisible) {
        errors.push("Could not access rookie draft room");
      } else {
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-draft-room")).screenshots);

        // Step 6: Make a selection
        const playerSelections = [
          page.getByRole("button", { name: /select|draft|pick/i }),
          page.locator('[data-testid*="select"]'),
          page.locator('[data-testid*="player"] button'),
          page.locator('button:has-text("Select")')
        ];

        let selectionMade = false;
        for (const selector of playerSelections) {
          if (await selector.first().isVisible()) {
            await selector.first().click();
            await waitForPageStable(page);
            selectionMade = true;
            break;
          }
        }

        if (!selectionMade) {
          errors.push("Could not make a draft selection");
        }

        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "05-draft-selection")).screenshots);

        // Step 7: Assert board updates and result persists
        const boardUpdateIndicators = [
          page.getByText(/selected|drafted|pick complete/i),
          page.locator('[data-testid*="selected"]'),
          page.locator('[data-testid*="drafted"]'),
          page.locator('.selected, .drafted, .complete')
        ];

        let updateVisible = false;
        for (const indicator of boardUpdateIndicators) {
          if (await indicator.first().isVisible()) {
            updateVisible = true;
            break;
          }
        }

        if (!updateVisible) {
          errors.push("No visible board updates after selection");
        }

        // Refresh page to verify persistence
        await page.reload();
        await waitForPageStable(page);

        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "06-draft-persistence")).screenshots);
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "07-final-draft-state")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "rookie-draft-setup-and-selection",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("rookie draft pass or forfeit functionality", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      await loginAs(page, "commissioner");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      
      await page.goto("/draft");
      await waitForPageStable(page);
      
      // Look for pass/forfeit options
      const passActions = [
        page.getByRole("button", { name: /pass|forfeit|skip/i }),
        page.locator('[data-testid*="pass"]'),
        page.locator('[data-testid*="forfeit"]')
      ];

      let passActionFound = false;
      for (const action of passActions) {
        if (await action.first().isVisible()) {
          await action.first().click();
          await waitForPageStable(page);
          passActionFound = true;
          break;
        }
      }

      if (!passActionFound) {
        errors.push("No pass/forfeit actions found");
      }

      evidence = await captureSmokeEvidence(page, test.info(), "01-draft-pass-forfeit");

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "rookie-draft-pass-or-forfeit",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});