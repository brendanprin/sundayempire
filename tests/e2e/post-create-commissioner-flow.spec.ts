import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Post-Create Commissioner Flow", () => {
  test.describe.configure({ mode: "serial" });

  test("create league → commissioner home handoff with correct bootstrap state", async ({ page, baseURL }) => {
    // Test user starts with no leagues and goes through create flow
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    
    // === PHASE 1: INITIAL STATE - Should redirect to selection/create ===
    await page.goto("/dashboard");
    
    // Should be redirected to league selection/creation flow since no leagues exist
    await expect(page).toHaveURL(/\/(select-league|my-leagues)/);
    
    // === PHASE 2: LEAGUE CREATION HAPPY PATH ===
    // Navigate to create new league if not already there
    if (await page.getByTestId("no-league-create-button").isVisible()) {
      await page.getByTestId("no-league-create-button").click();
    } else {
      await page.goto("/my-leagues/new");
    }
    
    // Complete league creation wizard - FULL FLOW
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    await expect(page.getByTestId("league-create-step-basics")).toHaveAttribute("aria-current", "step");
    
    // Fill in basic league details
    const leagueName = `E2E Test League ${Date.now()}`;
    await page.getByTestId("no-league-create-name").fill(leagueName);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    
    // Progress through wizard steps
    await page.getByTestId("league-create-next-options").click();
    await expect(page.getByTestId("league-create-step-options")).toHaveAttribute("aria-current", "step");
    
    // Optional fields - description
    await page.getByTestId("no-league-create-description").fill("Comprehensive post-create flow test");
    
    // Go to review
    await page.getByTestId("league-create-next-review").click();
    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
    
    // Verify review step shows correct data
    await expect(page.getByTestId("league-create-review-step")).toContainText(leagueName);
    await expect(page.getByTestId("league-create-review-step")).toContainText("2026");
    
    // Submit league creation
    await page.getByTestId("league-create-submit-button").click();
    
    // === PHASE 3: REDIRECT VALIDATION ===
    // Should redirect to the new league's commissioner home
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    
    // Extract league ID from URL for later validation
    const currentUrl = page.url();
    const leagueId = currentUrl.match(/\/league\/([^\/]+)$/)?.[1];
    expect(leagueId).toBeTruthy();
    
    // === PHASE 4: COMMISSIONER ROLE & CONTEXT VALIDATION ===
    // Verify user has commissioner role in this league  
    await expect(page.getByTestId("role-context-role")).toHaveText("Commissioner");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    
    // === PHASE 5: BOOTSTRAP DASHBOARD STATE ===
    // Primary setup checklist should be visible and showing 0% completion
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    
    // Verify the new-league checklist component shows correct initial state
    const checklistProgress = page.getByTestId("bootstrap-progress-overview");
    await expect(checklistProgress).toBeVisible();
    
    // Should show 0% or minimal completion on a brand new league
    const progressText = await checklistProgress.textContent();
    expect(progressText).toMatch(/0[%\s]*[Cc]omplete|[Cc]omplete.*0/);
    
    // === PHASE 6: FOUNDER SETUP AS PRIMARY ACTION ===
    // Founder team setup should be prominently displayed as the main action
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    
    // Verify founder setup is marked as primary action and incomplete
    const founderSection = page.getByTestId("bootstrap-founder-team-setup");
    await expect(founderSection).toContainText("Primary Action");
    await expect(founderSection).toContainText("Set Up Your Founder Team");
    
    // Founder status should show as Required (not postponed or complete)
    await expect(page.getByTestId("bootstrap-founder-status")).toHaveText("Required");
    
    // === PHASE 7: EMPTY STATES RENDERED TRUTHFULLY ===
    // Verify that empty states are appropriate for a new league
    
    // Dashboard should NOT show mature features yet
    await expect(page.getByTestId("dashboard-trades-summary")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-draft-status")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-weekly-checklist")).not.toBeVisible();
    
    // === PHASE 8: MATURE MODULES DEFERRED APPROPRIATELY ===
    // Verify advanced commissioner features are not prominently displayed
    
    // Should not see complex operational displays
    await expect(page.getByTestId("commissioner-compliance-alerts")).not.toBeVisible();
    await expect(page.getByTestId("commissioner-lifecycle-controls")).not.toBeVisible();
    await expect(page.getByTestId("commissioner-audit-summary")).not.toBeVisible();
    
    // === PHASE 9: NO FALSE OVERDUE ALERTS ===
    // Critical: New league should not show false deadline warnings
    
    // Check that no critical alerts are shown for a brand new league
    const alertStrip = page.getByTestId("bootstrap-dashboard-alert-strip");
    if (await alertStrip.isVisible()) {
      const alertText = await alertStrip.textContent();
      
      // Should not contain overdue/urgent language for a new league
      expect(alertText).not.toMatch(/(overdue|urgent|critical|deadline.*passed)/i);
      
      // If any alerts exist, they should be informational, not error/warning tones
      const alertItems = page.getByTestId(/bootstrap-dashboard-alert-\d+/);
      const alertCount = await alertItems.count();
      
      for (let i = 0; i < alertCount; i++) {
        const alert = alertItems.nth(i);
        const alertClasses = await alert.getAttribute("class");
        
        // Should not have error or warning visual styling
        expect(alertClasses).not.toMatch(/(bg-red|bg-orange|border-red|border-orange|text-red|text-orange)/);
      }
    }
    
    // === PHASE 10: VISUAL & FUNCTIONAL ASSERTIONS ===
    // Verify key interactive elements are present and functional
    
    // Founder setup form should be interactive
    await expect(page.getByText("Create New Team")).toBeVisible();
    await expect(page.getByText("Claim Existing Team")).toBeVisible();
    await expect(page.getByText("Skip For Now")).toBeVisible();
    
    // Team/invite setup sections should be present but not active yet
    await expect(page.getByText("Build Your League")).toBeVisible();
    
    // === PHASE 11: END-TO-END STATE CONSISTENCY ===
    // Verify the page state is internally consistent
    
    // Page should have league context properly loaded
    await expect(page.getByText("New League Setup")).toBeVisible();
    
    // League name should be displayed in the context
    await expect(page).toContainText(leagueName);
    
    // URL should remain stable (no additional redirects)
    await expect(page).toHaveURL(currentUrl);
  });

  test("duplicate founder prompts regression protection", async ({ page, baseURL }) => {
    // Create a league via API to test specific bootstrap state
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const leagues = await ctx.get("/api/leagues");
    
    let testLeagueId: string;
    
    if (leagues.length === 0) {
      // Create league for this test
      const newLeague = await ctx.post("/api/leagues", {
        name: "Bootstrap Regression Test League",
        seasonYear: 2026
      });
      testLeagueId = newLeague.id;
    } else {
      testLeagueId = leagues[0].id;
    }
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${testLeagueId}`);
    
    // === DUPLICATE FOUNDER PROMPT PROTECTION ===
    // Should only see ONE founder setup prompt, not multiple
    const founderSections = page.getByTestId("bootstrap-founder-team-setup");
    await expect(founderSections).toHaveCount(1);
    
    // Should only see ONE primary action designation
    const primaryActionLabels = page.getByText("Primary Action");
    await expect(primaryActionLabels).toHaveCount(1);
    
    // === CONSISTENCY CHECK ===
    // The NewLeagueChecklist component should be the canonical source
    const checklistComponent = page.getByTestId("bootstrap-progress-overview");
    await expect(checklistComponent).toBeVisible();
    
    // Should not have competing progress indicators
    const progressIndicators = page.locator("[data-testid*='progress']");
    const progressCount = await progressIndicators.count();
    
    // Allow for one main progress indicator (the canonical one)
    expect(progressCount).toBeLessThanOrEqual(2); // One main, possibly one summary
    
    // Verify no duplicate setup guidance
    const setupTexts = page.getByText("Setup", { exact: false });
    const keySetupTexts = [
      "Set Up Your Founder Team",
      "Add Teams & Members", 
      "New League Setup"
    ];
    
    for (const setupText of keySetupTexts) {
      const matchingElements = page.getByText(setupText, { exact: false });
      await expect(matchingElements).toHaveCount(1);
    }
  });

  test("bootstrap state persists across navigation", async ({ page, baseURL }) => {
    // Test that bootstrap state is stable when navigating away and back
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const leagues = await ctx.get("/api/leagues");
    
    const testLeagueId = leagues[0]?.id;
    if (!testLeagueId) {
      test.skip("No league available for navigation test");
    }
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${testLeagueId}`);
    
    // === INITIAL STATE CAPTURE ===
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    
    const initialProgressText = await page.getByTestId("bootstrap-progress-overview").textContent();
    const initialFounderStatus = await page.getByTestId("bootstrap-founder-status").textContent();
    
    // === NAVIGATE AWAY AND RETURN ===
    // Navigate to a different page
    await page.goto("/dashboard");
    
    // Navigate back to league
    await page.goto(`/league/${testLeagueId}`);
    
    // === STATE CONSISTENCY CHECK ===
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    
    const returnProgressText = await page.getByTestId("bootstrap-progress-overview").textContent();
    const returnFounderStatus = await page.getByTestId("bootstrap-founder-status").textContent();
    
    // Progress and status should be consistent
    expect(returnProgressText).toBe(initialProgressText);
    expect(returnFounderStatus).toBe(initialFounderStatus);
    
    // Founder setup should still be the primary action
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toContainText("Primary Action");
  });

  test("new league shows appropriate commissioner guidance", async ({ page, baseURL }) => {
    // Test that new leagues show helpful guidance without overwhelm
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    
    // Create fresh league
    const newLeague = await ctx.post("/api/leagues", {
      name: "Commissioner Guidance Test League",
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);
    
    // === GUIDANCE PRESENCE ===
    // Should see clear next steps
    await expect(page.getByText("Set Up Your Founder Team")).toBeVisible();
    await expect(page.getByText("Build Your League")).toBeVisible();
    
    // Should see explanatory text for new commissioners
    await expect(page.getByText("As league commissioner")).toBeVisible();
    
    // === GUIDANCE APPROPRIATENESS ===
    // Should not overwhelm with advanced features
    await expect(page.getByText(/advanced.*commissioner/i)).not.toBeVisible();
    await expect(page.getByText(/complex.*operations/i)).not.toBeVisible();
    
    // Should focus on foundational setup
    const pageText = await page.textContent("body");
    expect(pageText).toMatch(/setup|founder|team|member|invite/i);
    
    // === PROGRESSIVE DISCLOSURE ===
    // Advanced features should not be prominently visible
    await expect(page.getByText("Compliance")).not.toBeVisible();
    await expect(page.getByText("Audit Trail")).not.toBeVisible();
    await expect(page.getByText("Data Export")).not.toBeVisible();
  });

  test("league creation wizard validation and error handling", async ({ page, baseURL }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/my-leagues/new");
    
    // === WIZARD PRESENCE AND INITIAL STATE ===
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    await expect(page.getByTestId("league-create-step-basics")).toHaveAttribute("aria-current", "step");
    
    // Should start with disabled next button
    await expect(page.getByTestId("league-create-next-options")).toBeDisabled();
    
    // === VALIDATION TESTING ===
    // Test name validation
    await page.getByTestId("no-league-create-name").fill("A");  // Too short
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await expect(page.getByTestId("league-create-name-error")).toBeVisible();
    await expect(page.getByTestId("league-create-next-options")).toBeDisabled();
    
    // Test season year validation
    await page.getByTestId("no-league-create-name").fill("Valid League Name");
    await page.getByTestId("no-league-create-season-year").fill("1999");  // Too old
    await expect(page.getByTestId("league-create-season-year-error")).toBeVisible();
    await expect(page.getByTestId("league-create-next-options")).toBeDisabled();
    
    // === SUCCESSFUL FORM PROGRESSION ===
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await expect(page.getByTestId("league-create-next-options")).toBeEnabled();
    
    // Progress to options step
    await page.getByTestId("league-create-next-options").click();
    await expect(page.getByTestId("league-create-step-options")).toHaveAttribute("aria-current", "step");
    
    // Test designated commissioner email validation
    await page.getByTestId("no-league-create-designated-commissioner-email").fill("not-an-email");
    await expect(page.getByTestId("league-create-designated-commissioner-error")).toBeVisible();
    await expect(page.getByTestId("league-create-next-review")).toBeDisabled();
    
    // Clear invalid email
    await page.getByTestId("no-league-create-designated-commissioner-email").fill("");
    await expect(page.getByTestId("league-create-next-review")).toBeEnabled();
    
    // === REVIEW STEP VERIFICATION ===
    await page.getByTestId("league-create-next-review").click();
    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("league-create-review-step")).toContainText("Valid League Name");
    await expect(page.getByTestId("league-create-review-step")).toContainText("2026");
    
    // Submit button should be focussed and enabled
    await expect(page.getByTestId("league-create-submit-button")).toBeFocused();
    await expect(page.getByTestId("league-create-submit-button")).toBeEnabled();
  });

  test("post-create redirect handles edge cases", async ({ page, baseURL }) => {
    // Test different entry points leading to the same post-create outcome
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    
    // === ENTRY POINT 1: Direct wizard access ===
    await page.goto("/my-leagues/new");
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    
    // Complete minimal form
    const timestamp = Date.now();
    await page.getByTestId("no-league-create-name").fill(`Redirect Test ${timestamp}`);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    await page.getByTestId("league-create-submit-button").click();
    
    // Should redirect to league dashboard, not an intermediate page
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    
    // Verify it's not a generic success page but the actual league dashboard
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    
    // League name should be reflected correctly
    await expect(page).toContainText(`Redirect Test ${timestamp}`);
    
    // Should have commissioner context immediately
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    
    // Should not show a loading state or intermediate redirect page
    await expect(page.getByText("Redirecting")).not.toBeVisible();
    await expect(page.getByText("Creating league")).not.toBeVisible();
    
    // Bootstrap state should be ready immediately
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
  });
});