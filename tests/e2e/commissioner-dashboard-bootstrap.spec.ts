import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

/**
 * Commissioner Dashboard Bootstrap Behavior Tests
 * 
 * Covers targeted scenarios for newly created leagues landing on 
 * the commissioner dashboard with proper bootstrap state.
 * 
 * Focus: Empty states, false alerts, and foundational setup presentation
 */
test.describe("Commissioner Dashboard Bootstrap", () => {
  test.describe.configure({ mode: "serial" });

  test("bootstrap dashboard shows correct empty states for new league", async ({ page, baseURL }) => {
    // Create a fresh league via API for consistent state
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const newLeague = await ctx.post("/api/leagues", {
      name: `Bootstrap Empty States Test ${Date.now()}`,
      seasonYear: 2026,
      description: "Testing bootstrap empty states"
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);

    // === PRIMARY BOOTSTRAP COMPONENTS PRESENT ===
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByTestId("bootstrap-dashboard-eyebrow")).toContainText("New League Setup");
    await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(`Bootstrap Empty States Test`);

    // === EMPTY STATE VALIDATION ===
    // Components that should NOT be visible on a fresh league
    await expect(page.getByTestId("dashboard-roster-summary")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-waiver-claims")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-trade-offers")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-draft-picks-summary")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-deadline-alerts")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-season-schedule")).not.toBeVisible();
    await expect(page.getByTestId("dashboard-standings-preview")).not.toBeVisible();

    // === APPROPRIATE EMPTY MESSAGING ===
    // Should show helpful setup guidance, not "no data" messages
    await expect(page).toContainText("Let's get your dynasty football league operational");
    await expect(page).toContainText("Complete these essential steps");
    
    // Should NOT show empty state messages for features not yet applicable
    await expect(page.getByText("No trades available")).not.toBeVisible();
    await expect(page.getByText("No roster moves")).not.toBeVisible();
    await expect(page.getByText("No draft picks assigned")).not.toBeVisible();
    await expect(page.getByText("No waivers pending")).not.toBeVisible();
  });

  test("no false overdue alerts on new league", async ({ page, baseURL }) => {
    // Test that brand new leagues don't trigger false deadline warnings
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const newLeague = await ctx.post("/api/leagues", {
      name: `No False Alerts Test ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);

    // === ALERT STRIP VALIDATION ===
    const alertStrip = page.getByTestId("bootstrap-dashboard-alert-strip");
    
    // If alerts exist, they must be appropriate for a new league
    if (await alertStrip.isVisible()) {
      const alertText = await alertStrip.textContent();
      
      // Explicitly prohibited alert content for new leagues
      expect(alertText).not.toMatch(/(overdue|deadline.*passed|urgent.*deadline|critical.*deadline)/i);
      expect(alertText).not.toMatch(/(late|behind schedule|time.*expired)/i);
      expect(alertText).not.toMatch(/(action.*required.*immediately|fix.*now)/i);
      
      // Should not contain warning or error tone language
      expect(alertText).not.toMatch(/(warning|error|failed|problem)/i);
    }

    // === NO DEADLINE-BASED ALERTS ===
    // New leagues should not have deadline-based components showing
    await expect(page.getByTestId("deadline-countdown-timer")).not.toBeVisible();
    await expect(page.getByTestId("overdue-tasks-summary")).not.toBeVisible();
    await expect(page.getByTestId("compliance-deadline-warning")).not.toBeVisible();
    await expect(page.getByTestId("draft-deadline-pressure")).not.toBeVisible();

    // === POSITIVE SETUP MESSAGING ===
    // Should show encouraging setup progress messaging instead
    await expect(page.getByText("Welcome to")).toBeVisible();
    await expect(page.getByText(/setup tasks complete/)).toBeVisible();
    await expect(page.getByText("Primary Action")).toBeVisible();
    
    // Status indicators should be neutral or positive, not alarming
    const statusElements = page.locator("[data-testid*='status'], [data-testid*='progress']");
    const statusCount = await statusElements.count();
    
    for (let i = 0; i < statusCount; i++) {
      const element = statusElements.nth(i);
      const classList = await element.getAttribute("class");
      
      // Should not have urgent/error styling classes
      expect(classList).not.toMatch(/(bg-red|border-red|text-red-600|bg-orange|border-orange)/);
    }
  });

  test("founder setup shown as primary action without duplication", async ({ page, baseURL }) => {
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const newLeague = await ctx.post("/api/leagues", {
      name: `Founder Primary Action Test ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);

    // === SINGLE FOUNDER SETUP SECTION ===
    const founderSections = page.getByTestId("bootstrap-founder-team-setup");
    await expect(founderSections).toHaveCount(1);
    
    // === PRIMARY ACTION DESIGNATION ===
    await expect(founderSections).toContainText("Primary Action");
    await expect(founderSections).toContainText("Set Up Your Founder Team");
    
    // Only one "Primary Action" label should exist
    const primaryActionLabels = page.getByText("Primary Action");
    await expect(primaryActionLabels).toHaveCount(1);
    
    // === FOUNDER STATUS CLARITY ===
    await expect(page.getByTestId("bootstrap-founder-status")).toHaveText("Required");
    await expect(page.getByTestId("bootstrap-founder-status")).toHaveCount(1);
    
    // === FORM COMPONENTS PRESENT ===
    // All three founder setup options should be available
    await expect(page.getByText("Create New Team")).toBeVisible();
    await expect(page.getByText("Claim Existing Team")).toBeVisible();
    await expect(page.getByText("Skip For Now")).toBeVisible();
    
    // Form inputs should be functional
    await expect(page.getByTestId("bootstrap-founder-name-input")).toBeVisible();
    await expect(page.getByTestId("bootstrap-founder-abbr-input")).toBeVisible();
    await expect(page.getByTestId("bootstrap-founder-division-input")).toBeVisible();
    
    // === NO COMPETING SETUP PROMPTS ===
    // Should not see multiple conflicting setup calls-to-action
    const setupTexts = page.getByText("Set Up", { exact: false });
    const setupCount = await setupTexts.count();
    
    // Should have the main founder setup call and possibly league setup section
    expect(setupCount).toBeLessThanOrEqual(2);
  });

  test("mature modules properly deferred on new league", async ({ page, baseURL }) => {
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const newLeague = await ctx.post("/api/leagues", {
      name: `Mature Modules Deferred Test ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);

    // === ADVANCED COMMISSIONER FEATURES DEFERRED ===
    // These should not be prominently visible on a new league
    await expect(page.getByTestId("commissioner-compliance-dashboard")).not.toBeVisible();
    await expect(page.getByTestId("commissioner-audit-trail")).not.toBeVisible();
    await expect(page.getByTestId("commissioner-financial-controls")).not.toBeVisible();
    await expect(page.getByTestId("commissioner-advanced-settings")).not.toBeVisible();
    await expect(page.getByTestId("commissioner-data-export")).not.toBeVisible();
    
    // === OPERATIONAL WORKFLOWS DEFERRED ===
    await expect(page.getByTestId("trade-approval-queue")).not.toBeVisible();
    await expect(page.getByTestId("waiver-claim-processing")).not.toBeVisible();
    await expect(page.getByTestId("roster-compliance-checker")).not.toBeVisible();
    await expect(page.getByTestId("salary-cap-violations")).not.toBeVisible();
    
    // === IN-SEASON FEATURES DEFERRED ===
    await expect(page.getByTestId("weekly-lineup-review")).not.toBeVisible();
    await expect(page.getByTestId("scoring-adjustments")).not.toBeVisible();
    await expect(page.getByTestId("injury-reports")).not.toBeVisible();
    
    // === PROGRESSIVE DISCLOSURE VALIDATION ===
    // Only foundational setup should be prominent
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-league-setup")).toBeVisible();
    
    // Page should focus on setup language, not operational language
    const pageText = await page.textContent("body");
    expect(pageText).toMatch(/(setup|configure|create|build|prepare)/i);
    expect(pageText).not.toMatch(/(manage|process|review|approve|adjust|monitor)/i);
  });

  test("bootstrap state persists through navigation", async ({ page, baseURL }) => {
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const newLeague = await ctx.post("/api/leagues", {
      name: `Navigation Persistence Test ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);

    // === CAPTURE INITIAL BOOTSTRAP STATE ===
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    const initialProgress = await page.getByTestId("bootstrap-progress-overview").textContent();
    const initialFounderStatus = await page.getByTestId("bootstrap-founder-status").textContent();
    
    // Verify we're in bootstrap mode
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();

    // === NAVIGATE AWAY ===
    // Go to a different route
    await page.goto("/dashboard");
    
    // === NAVIGATE BACK ===
    await page.goto(`/league/${newLeague.id}`);

    // === VERIFY STATE CONSISTENCY ===
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    
    const returnedProgress = await page.getByTestId("bootstrap-progress-overview").textContent();
    const returnedFounderStatus = await page.getByTestId("bootstrap-founder-status").textContent();
    
    expect(returnedProgress).toBe(initialProgress);
    expect(returnedFounderStatus).toBe(initialFounderStatus);
    
    // Primary action should still be founder setup
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toContainText("Primary Action");
    
    // Should not have advanced to an operational dashboard state
    await expect(page.getByTestId("operational-commissioner-dashboard")).not.toBeVisible();
  });

  test("visual styling appropriate for bootstrap state", async ({ page, baseURL }) => {
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const newLeague = await ctx.post("/api/leagues", {
      name: `Visual Styling Test ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${newLeague.id}`);

    // === VISUAL HIERARCHY VALIDATION ===
    // Primary action (founder setup) should have prominent styling
    const founderSection = page.getByTestId("bootstrap-founder-team-setup");
    const founderClasses = await founderSection.getAttribute("class");
    
    // Should have accent/highlight styling for primary action
    expect(founderClasses).toMatch(/(border.*amber|bg.*amber|shadow)/);
    
    // === SETUP PROGRESS INDICATORS ===
    const progressSection = page.getByTestId("bootstrap-progress-overview");
    await expect(progressSection).toBeVisible();
    
    // Should not have alarming colors for initial state
    const progressClasses = await progressSection.getAttribute("class");
    expect(progressClasses).not.toMatch(/(bg-red|border-red|text-red)/);
    
    // === SEMANTIC COLOR USAGE ===
    // Success states should be green, pending should be neutral, not red/orange
    const statusElements = page.locator("[data-testid*='status'], [data-testid*='checklist']");
    const statusCount = await statusElements.count();
    
    for (let i = 0; i < statusCount; i++) {
      const element = statusElements.nth(i);
      const classList = await element.getAttribute("class");
      
      // New league should not have error/warning colors prominently
      expect(classList).not.toMatch(/(bg-red-[5-9]|border-red-[5-9]|text-red-[6-9])/);
      expect(classList).not.toMatch(/(bg-orange-[5-9]|border-orange-[5-9]|text-orange-[6-9])/);
    }
    
    // === APPROPRIATE VISUAL TONE ===
    // Should feel welcoming and constructive, not urgent or problematic
    await expect(page.getByText("Welcome to")).toBeVisible();
    await expect(page.getByText("Let's get your dynasty football league operational")).toBeVisible();
    
    // Should not have visual indicators of problems or urgency
    await expect(page.locator(".bg-red-500, .border-red-500, .text-red-500")).toHaveCount(0);
    await expect(page.locator(".bg-orange-500, .border-orange-500, .text-orange-500")).toHaveCount(0);
  });
});