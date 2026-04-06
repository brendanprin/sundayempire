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

test.describe("Commissioner Lifecycle Control", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("commissioner lifecycle management and phase transitions", async ({ page, baseURL }) => {
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

      // Step 2: Navigate to lifecycle control/commissioner area
      const commissionerPaths = [
        "/commissioner",
        "/admin",
        "/lifecycle",
        "/season",
        "/management"
      ];

      let lifecycleAccessFound = false;
      for (const path of commissionerPaths) {
        try {
          await page.goto(path);
          await waitForPageStable(page);
          
          // Check if we found the commissioner interface
          const commissionerIndicators = [
            page.getByText(/commissioner/i),
            page.getByText(/lifecycle/i),
            page.getByText(/phase/i),
            page.getByText(/season/i),
            page.locator('[data-testid*="commissioner"]'),
            page.locator('[data-testid*="lifecycle"]'),
            page.locator('[data-testid*="phase"]')
          ];
          
          for (const indicator of commissionerIndicators) {
            if (await indicator.first().isVisible()) {
              lifecycleAccessFound = true;
              break;
            }
          }
          
          if (lifecycleAccessFound) break;
        } catch (e) {
          // Continue trying other paths
        }
      }

      if (!lifecycleAccessFound) {
        // Try finding commissioner controls through navigation
        const navLinks = page.locator('nav a, [role="navigation"] a');
        const navCount = await navLinks.count();
        
        for (let i = 0; i < Math.min(navCount, 10); i++) {
          const link = navLinks.nth(i);
          const text = await link.textContent();
          if (text && /commissioner|admin|lifecycle|season|management/i.test(text)) {
            await link.click();
            await waitForPageStable(page);
            lifecycleAccessFound = true;
            break;
          }
        }
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-lifecycle-control-access")).screenshots);

      if (!lifecycleAccessFound) {
        errors.push("Could not find commissioner lifecycle control interface");
      } else {
        // Step 3: Verify current phase is displayed in the phase card
        const phaseCard = page.getByTestId("commissioner-routine-phase-card");
        if (!(await phaseCard.isVisible())) {
          errors.push("Phase card (commissioner-routine-phase-card) not visible");
        } else {
          const phaseText = await phaseCard.textContent();
          const hasPhaseInfo = /preseason|regular.?season|playoffs|offseason/i.test(phaseText ?? "");
          if (!hasPhaseInfo) {
            errors.push(`Phase card visible but contains no recognizable phase label. Got: "${phaseText?.trim()}"`);
          }
        }

        // Step 4: Attempt a safe phase transition using API
        const api = await createSmokeApiContext(baseURL as string, "commissioner");
        
        try {
          // Get current league state
          const leagueResponse = await api.get("/api/league");
          const leagueData = await leagueResponse.json();
          const currentPhase = leagueData.season?.phase;
          
          if (currentPhase) {
            // Attempt a phase transition to the same phase (safe operation)
            const phaseResponse = await api.post("/api/commissioner/season/phase", {
              data: {
                phase: currentPhase,
                reason: "Smoke test phase transition verification"
              }
            });
            
            if (phaseResponse.ok()) {
              // Refresh page to see if state updates persist
              await page.reload();
              await waitForPageStable(page);
              
              evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-after-phase-transition")).screenshots);
            } else {
              errors.push("Phase transition API call failed");
            }
          }
        } catch (apiError) {
          errors.push(`API operation failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
        } finally {
          await api.dispose();
        }
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-final-lifecycle-state")).screenshots);

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "commissioner-lifecycle-control",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("commissioner readiness and blocker validation", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] };
    const errors: string[] = [];

    try {
      await loginAs(page, "commissioner");
      const leagueId = await getPrimaryLeagueId(baseURL as string);
      await navigateToLeague(page, leagueId);
      
      // Assert commissioner console structural panels are present
      await page.goto("/commissioner");
      await waitForPageStable(page);

      const phaseCard = page.getByTestId("commissioner-routine-phase-card");
      const complianceCard = page.getByTestId("commissioner-routine-compliance-card");
      const remediationSection = page.getByTestId("commissioner-remediation-evidence");

      if (!(await phaseCard.isVisible())) {
        errors.push("commissioner-routine-phase-card not visible on /commissioner");
      }
      if (!(await complianceCard.isVisible())) {
        errors.push("commissioner-routine-compliance-card not visible on /commissioner");
      }
      if (!(await remediationSection.isVisible())) {
        errors.push("commissioner-remediation-evidence not visible on /commissioner");
      }

      // Phase card must show a named phase, not a loading placeholder
      const phaseText = await phaseCard.textContent();
      const hasNamedPhase = /preseason|regular.?season|playoffs|offseason/i.test(phaseText ?? "");
      if (!hasNamedPhase) {
        errors.push(`Phase card shows no named phase. Got: "${phaseText?.trim()}"`);
      }
      
      evidence = await captureSmokeEvidence(page, test.info(), "01-readiness-validation");

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "commissioner-readiness-validation", 
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});