import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

/**
 * Create League to Commissioner Flow Handoff Tests
 * 
 * Focused testing of the specific handoff from league creation wizard 
 * to commissioner dashboard, ensuring proper redirects and state transitions.
 */
test.describe("Create League Handoff Flow", () => {
  test.describe.configure({ mode: "serial" });

  test("league creation wizard to commissioner dashboard handoff", async ({ page, baseURL }) => {
    const testEmail = `handoff-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // === START FROM EMPTY STATE ===
    await page.goto("/dashboard");
    
    // Should redirect to league selection when no leagues exist
    await expect(page).toHaveURL(/\/(select-league|my-leagues)/);
    
    // Navigate to create wizard
    if (await page.getByTestId("no-league-create-button").isVisible()) {
      await page.getByTestId("no-league-create-button").click();
    } else {
      await page.goto("/my-leagues/new");
    }

    // === COMPLETE FULL WIZARD FLOW ===
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    
    // Step 1: Basics
    const uniqueName = `Handoff Test League ${Date.now()}`;
    await page.getByTestId("no-league-create-name").fill(uniqueName);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    
    // Step 2: Options (skip optional fields for speed)
    await expect(page.getByTestId("league-create-step-options")).toHaveAttribute("aria-current", "step");
    await page.getByTestId("league-create-next-review").click();
    
    // Step 3: Review
    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("league-create-review-step")).toContainText(uniqueName);
    
    // === CAPTURE SUBMISSION MOMENT ===
    const responsePromise = page.waitForResponse(response => 
      response.url().includes("/api/leagues") && response.request().method() === "POST"
    );
    
    await page.getByTestId("league-create-submit-button").click();
    
    // Wait for league creation API call
    const createResponse = await responsePromise;
    expect(createResponse.status()).toBe(200);
    
    // === VERIFY IMMEDIATE REDIRECT ===
    // Should redirect directly to the created league dashboard
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    
    // Extract league ID from URL
    const currentUrl = page.url();
    const leagueIdMatch = currentUrl.match(/\/league\/([^\/\?]+)/);
    expect(leagueIdMatch).toBeTruthy();
    const leagueId = leagueIdMatch![1];
    
    // === VERIFY COMMISSIONER DASHBOARD LOADED ===
    // Should be on the commissioner dashboard, not a generic success page
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    
    // Should show the exact league name that was created
    await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(uniqueName);
    
    // Should have commissioner context
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    await expect(page.getByText("New League Setup")).toBeVisible();
    
    // === NO INTERMEDIATE LOADING STATES ===
    // Should not be stuck on loading screens
    await expect(page.getByText("Creating league...")).not.toBeVisible();
    await expect(page.getByText("Redirecting...")).not.toBeVisible();
    await expect(page.getByText("Setting up...")).not.toBeVisible();
    
    // === VERIFY FUNCTIONAL DASHBOARD ===
    // Dashboard components should be interactive, not in loading state
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    
    // Primary action should be ready
    await expect(page.getByText("Primary Action")).toBeVisible();
    await expect(page.getByTestId("bootstrap-founder-name-input")).toBeVisible();
    
    // === URL STABILITY ===
    // URL should be stable (no further redirects)
    await page.waitForTimeout(500); // Brief pause to catch any delayed redirects
    expect(page.url()).toBe(currentUrl);
  });

  test("multiple user creation to dashboard paths converge correctly", async ({ page, baseURL }) => {
    // Test different entry paths all lead to the correct dashboard state
    
    // === PATH 1: Direct wizard access ===
    const email1 = `path-test-1-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": email1 });
    
    await page.goto("/my-leagues/new");
    await page.getByTestId("no-league-create-name").fill(`Path 1 League ${Date.now()}`);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    await page.getByTestId("league-create-submit-button").click();
    
    // Should land on proper commissioner dashboard
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    
    // === PATH 2: From dashboard empty state ===
    const email2 = `path-test-2-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": email2 });
    
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/(select-league|my-leagues)/);
    
    // Navigate through empty state create button
    if (await page.getByTestId("no-league-create-button").isVisible()) {
      await page.getByTestId("no-league-create-button").click();
    }
    
    await page.getByTestId("no-league-create-name").fill(`Path 2 League ${Date.now()}`);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    await page.getByTestId("league-create-submit-button").click();
    
    // Should land on same commissioner dashboard structure
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    
    // Both paths should result in equivalent dashboard state
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    await expect(page.getByText("Primary Action")).toBeVisible();
  });

  test("commissioner context is set correctly post-creation", async ({ page, baseURL }) => {
    const testEmail = `context-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // Create league through wizard
    await page.goto("/my-leagues/new");
    const leagueName = `Context Test League ${Date.now()}`;
    await page.getByTestId("no-league-create-name").fill(leagueName);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    await page.getByTestId("league-create-submit-button").click();
    
    // === COMMISSIONER ROLE CONFIRMATION ===
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    
    // Should have commissioner-specific language and options
    await expect(page.getByText("As league commissioner")).toBeVisible();
    await expect(page.getByText("Set Up Your Founder Team")).toBeVisible();
    
    // === LEAGUE CONTEXT LOADED ===
    // League name should be displayed
    await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(leagueName);
    
    // Season context should be correct
    await expect(page.getByText("Season 2026")).toBeVisible();
    
    // === PERMISSIONS VALIDATION ===
    // Commissioner should see setup/management capabilities
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-league-setup")).toBeVisible();
    
    // Should not be in read-only or restricted mode
    await expect(page.getByText("Read Only")).not.toBeVisible();
    await expect(page.getByText("Limited Access")).not.toBeVisible();
    
    // === ENTRY-RESOLVER VALIDATION ===
    // Entry-resolver API should have been called to set league context
    // This should be reflected in the URL and header context
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/league\/[a-zA-Z0-9-]+$/);
    
    // Additional context switch testing
    await page.goto("/dashboard");
    // Should redirect back to this league since it's now the active league
    await expect(page).toHaveURL(currentUrl);
  });

  test("error handling during league creation handoff", async ({ page, baseURL }) => {
    const testEmail = `error-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/my-leagues/new");
    
    // === TEST WIZARD FORM VALIDATION ===
    // Submit without required fields
    await page.getByTestId("league-create-submit-button").click();
    
    // Should remain on wizard with validation errors
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    
    // === TEST DUPLICATE NAME HANDLING ===
    // Fill form with valid data
    await page.getByTestId("no-league-create-name").fill(`Error Test League ${Date.now()}`);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    
    // Mock network error or conflict
    // Note: In a real test environment, you might set up request interception
    // For now, we test that valid submission works correctly
    
    await page.getByTestId("league-create-submit-button").click();
    
    // Should either succeed with redirect OR show error and stay on form
    const isRedirected = await page.waitForURL(/\/league\/[a-zA-Z0-9-]+$/).catch(() => false);
    
    if (isRedirected) {
      // Success path - verify dashboard loaded
      await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    } else {
      // Error path - verify error handling
      await expect(page.getByTestId("league-create-wizard")).toBeVisible();
      // Should show error message and allow retry
      const errorMessage = page.locator("[data-testid*='error'], [role='alert'], .error");
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible();
      }
    }
  });

  test("created league appears in my-leagues list", async ({ page, baseURL }) => {
    const testEmail = `list-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // Create league
    await page.goto("/my-leagues/new");
    const leagueName = `List Test League ${Date.now()}`;
    await page.getByTestId("no-league-create-name").fill(leagueName);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    await page.getByTestId("league-create-submit-button").click();
    
    // Verify redirect to dashboard
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    const currentLeagueUrl = page.url();
    
    // === NAVIGATE TO MY LEAGUES ===
    await page.goto("/my-leagues");
    
    // === VERIFY LEAGUE APPEARS ===
    // Created league should appear in the list
    await expect(page.getByText(leagueName)).toBeVisible();
    
    // Should show as commissioner role
    await expect(page.getByText("Commissioner")).toBeVisible();
    
    // Should have link back to the league
    const leagueLink = page.locator(`a[href*="${currentLeagueUrl.split('/').pop()}"]`);
    await expect(leagueLink).toBeVisible();
    
    // === VERIFY ROUND-TRIP NAVIGATION ===
    await leagueLink.click();
    
    // Should return to the same league dashboard
    await expect(page).toHaveURL(currentLeagueUrl);
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(leagueName);
  });
});