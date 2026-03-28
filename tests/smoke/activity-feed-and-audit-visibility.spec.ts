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

      // Step 3: Verify readable manager-safe activity entries
      await expect(page.getByTestId("activity-feed")).toBeVisible();
      
      // Verify manager-safe activity label
      const visibilityLabel = page.getByTestId("activity-visibility-label");
      if (await visibilityLabel.isVisible()) {
        await expect(visibilityLabel).toContainText(/league.?visible|public|manager/i);
      } else {
        errors.push("No activity visibility label found");
      }

      // Verify no commissioner-only events are visible  
      const commissionerOnlyEvents = page.locator('[data-testid="activity-item"][data-event-type*="commissioner"]');
      const commissionerEventCount = await commissionerOnlyEvents.count();
      
      if (commissionerEventCount > 0) {
        errors.push(`Found ${commissionerEventCount} commissioner-only events in manager view`);
      }

      // Look for activity entries
      const activityItems = page.locator('[data-testid="activity-item"], .activity-item, .activity-entry');
      const itemCount = await activityItems.count();
      
      if (itemCount === 0) {
        errors.push("No activity items found in manager feed");
      }

      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "03-manager-activity-verification")).screenshots);

      // Step 4: Filter by type or team if available
      const filterButtons = page.locator('[data-testid*="filter"], button:has-text("Filter"), select');
      if (await filterButtons.first().isVisible()) {
        await filterButtons.first().click();
        await waitForPageStable(page);
        
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "04-activity-filters")).screenshots);
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

      // Step 2: Open audit view
      const auditPaths = [
        "/audit",
        "/commissioner/audit", 
        "/activity/audit",
        "/admin/audit"
      ];

      let auditFound = false;
      for (const path of auditPaths) {
        try {
          await page.goto(path);
          await waitForPageStable(page); 
          
          // Check for audit-specific content
          const auditIndicators = [
            page.getByText(/audit/i),
            page.getByText(/commissioner.?only/i),
            page.getByText(/administrative/i),
            page.locator('[data-testid*="audit"]'),
            page.locator('[data-testid*="commissioner"]')
          ];
          
          for (const indicator of auditIndicators) {
            if (await indicator.first().isVisible()) {
              auditFound = true;
              break;
            }
          }
          
          if (auditFound) break;
        } catch (e) {
          // Continue trying other paths
        }
      }

      if (!auditFound) {
        // Try finding audit via navigation
        const navLinks = page.locator('nav a, [role="navigation"] a');
        const navCount = await navLinks.count();
        
        for (let i = 0; i < Math.min(navCount, 10); i++) {
          const link = navLinks.nth(i);
          const text = await link.textContent();
          if (text && /audit|commissioner/i.test(text)) {
            await link.click();
            await waitForPageStable(page);
            auditFound = true;
            break;
          }
        }
      }

      if (auditFound) {
        evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-commissioner-audit-view")).screenshots);

        // Step 3: Verify richer rationale is visible in commissioner view
        const content = await page.textContent('body');
        if (content) {
          const hasRichContent = /reason|rationale|decision|ruling|override|compliance/i.test(content);
          if (!hasRichContent) {
            errors.push("No rich rationale content found in commissioner audit view");
          }
        }
      } else {
        errors.push("Could not find commissioner audit interface");
      }

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
      
      // Try to access commissioner audit paths
      const restrictedPaths = [
        "/audit",
        "/commissioner/audit",
        "/admin/audit", 
        "/commissioner"
      ];

      for (const path of restrictedPaths) {
        await page.goto(path);
        await waitForPageStable(page);
        
        // Check if access is properly denied
        const content = await page.textContent('body');
        if (content) {
          const hasForbiddenContent = /forbidden|access denied|not authorized|403/i.test(content);
          const hasAuditContent = /commissioner.?audit|administrative/i.test(content);
          
          if (hasAuditContent && !hasForbiddenContent) {
            errors.push(`Manager can inappropriately access ${path}`);
          }
        }
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