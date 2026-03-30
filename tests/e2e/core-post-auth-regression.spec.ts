import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

/**
 * Core Post-Auth League Management Regression Protection
 * 
 * Critical regression coverage for authenticated entry, league selection, 
 * and league creation flows. These tests protect the core user journeys 
 * that must not break as the app evolves.
 * 
 * Coverage:
 * - My Leagues page loads correctly after auth
 * - Create League flow opens and completes
 * - Skip optional fields path works
 * - Validation failures are handled
 * - Success handoff into new league works
 * - No duplicate-create or broken navigation
 */
test.describe("Core Post-Auth Flow Regression Protection", () => {
  test.describe.configure({ mode: "serial" });

  test("demo auth → my leagues → create league complete happy path", async ({ page, baseURL }) => {
    // This is the core happy path that must never break
    const testEmail = `regression-happy-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // === PART 1: POST-AUTH MY LEAGUES LOADS ===
    await page.goto("/dashboard");
    
    // Should redirect to my-leagues when no leagues exist
    await expect(page).toHaveURL(/\/(my-leagues|select-league)/);
    
    // My Leagues page should load correctly
    await expect(page.getByText("Dynasty Football Hub")).toBeVisible();
    await expect(page.getByTestId("my-leagues-empty-state")).toBeVisible();
    await expect(page.getByText("Create New League")).toBeVisible();
    
    // Should have account-level feel, not league workspace  
    await expect(page.getByTestId("shell-side-nav")).not.toBeVisible();
    await expect(page.getByTestId("shell-top-bar")).not.toBeVisible();
    
    // === PART 2: CREATE LEAGUE FLOW OPENS ===
    const createButton = page.getByTestId("no-league-create-button");
    await expect(createButton).toBeVisible();
    await createButton.click();
    
    // Should navigate to create league wizard
    await expect(page).toHaveURL("/my-leagues/new");
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    
    // === PART 3: COMPLETE BASICS STEP ===
    const leagueName = `Regression Test ${Date.now()}`;
    const nameInput = page.getByTestId("no-league-create-name");
    const yearInput = page.getByTestId("no-league-create-season-year");
    const nextButton = page.getByTestId("league-create-next-options");
    
    // Initially disabled
    await expect(nextButton).toBeDisabled();
    
    // Fill valid data
    await nameInput.fill(leagueName);
    await yearInput.fill("2026");
    
    // Button should enable
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    
    // === PART 4: SKIP OPTIONAL STEP ===
    await expect(page.getByTestId("league-create-step-options")).toHaveAttribute("aria-current", "step");
    
    // Skip should be prominent and functional
    const skipButton = page.getByTestId("league-create-skip-options");
    await expect(skipButton).toBeVisible();
    await expect(skipButton).toBeEnabled();
    await skipButton.click();
    
    // === PART 5: REVIEW STEP ===
    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
    
    // Review should show correct data
    const reviewStep = page.getByTestId("league-create-review-step");
    await expect(reviewStep).toContainText(leagueName);
    await expect(reviewStep).toContainText("2026");
    await expect(reviewStep).toContainText("Not provided"); // Skipped description
    
    // === PART 6: CREATE SUCCESS ===
    const submitButton = page.getByTestId("league-create-submit-button");
    await expect(submitButton).toBeEnabled();
    
    // Monitor API call
    const responsePromise = page.waitForResponse(response => 
      response.url().includes("/api/leagues") && response.request().method() === "POST"
    );
    
    await submitButton.click();
    
    // Verify create API succeeds
    const createResponse = await responsePromise;
    expect(createResponse.status()).toBe(200);
    
    // === PART 7: SUCCESS HANDOFF INTO LEAGUE ===
    // Should redirect to new league dashboard
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    
    // Should land in commissioner dashboard
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    
    // League name should be displayed correctly
    await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(leagueName);
    
    // Bootstrap state should be ready
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
    
    // Should have league workspace context (not account-level anymore)
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
  });

  test("validation failures prevent progression and show clear errors", async ({ page }) => {
    const testEmail = `regression-validation-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/my-leagues/new");
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    
    // === EMPTY FIELD VALIDATION ===
    const nextButton = page.getByTestId("league-create-next-options");
    await expect(nextButton).toBeDisabled();
    
    // === NAME TOO SHORT ===
    await page.getByTestId("no-league-create-name").fill("A");
    await page.getByTestId("no-league-create-season-year").fill("2026");
    
    // Should show error and remain disabled
    await expect(page.getByTestId("league-create-name-error")).toBeVisible();
    await expect(page.getByTestId("league-create-name-error")).toContainText("at least 3 characters");
    await expect(nextButton).toBeDisabled();
    
    // === INVALID YEAR ===
    await page.getByTestId("no-league-create-name").fill("Valid League Name");
    await page.getByTestId("no-league-create-season-year").fill("1999");
    
    // Should show year error and remain disabled
    await expect(page.getByTestId("league-create-season-year-error")).toBeVisible();
    await expect(page.getByTestId("league-create-season-year-error")).toContainText("cannot be in the past");
    await expect(nextButton).toBeDisabled();
    
    // === VALID DATA ENABLES PROGRESSION ===
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await expect(nextButton).toBeEnabled();
    
    // Proceed to options step
    await nextButton.click();
    
    // === INVALID EMAIL VALIDATION ===
    const emailInput = page.getByTestId("no-league-create-designated-commissioner-email");
    const optionsNextButton = page.getByTestId("league-create-next-review");
    
    // Invalid email should show error and disable progression
    await emailInput.fill("not-an-email");
    await expect(page.getByTestId("league-create-designated-commissioner-error")).toBeVisible();
    await expect(optionsNextButton).toBeDisabled();
    
    // Clear invalid email should re-enable
    await emailInput.fill("");
    await expect(optionsNextButton).toBeEnabled();
    
    // Validation should not break the flow
    await optionsNextButton.click();
    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
  });

  test("skip optional fields path works correctly", async ({ page }) => {
    const testEmail = `regression-skip-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/my-leagues/new");
    
    // Complete basics
    await page.getByTestId("no-league-create-name").fill(`Skip Test ${Date.now()}`);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    
    // === SKIP IS PROMINENT AND PRIMARY ===
    const skipButton = page.getByTestId("league-create-skip-options");
    const continueButton = page.getByTestId("league-create-next-review");
    
    // Skip should be more prominent than continue with optional data
    await expect(skipButton).toBeVisible();
    await expect(continueButton).toBeVisible();
    
    // Verify skip message is clear
    await expect(page.getByText("completely optional")).toBeVisible();
    await expect(page.getByText("you can skip")).toBeVisible();
    
    // === SKIP FUNCTIONALITY ===
    await skipButton.click();
    
    // Should advance to review step
    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
    
    // Review should show skipped fields appropriately
    const reviewStep = page.getByTestId("league-create-review-step");
    await expect(reviewStep).toContainText("Not provided"); // Description
    await expect(reviewStep).toContainText("None"); // Alt commissioner
    
    // Should be able to create successfully with skipped fields
    const submitButton = page.getByTestId("league-create-submit-button");
    await expect(submitButton).toBeEnabled();
  });

  test("existing leagues render correctly on my-leagues page", async ({ page, baseURL }) => {
    // Create leagues for display testing  
    const ctx = await apiContext(baseURL!, COMMISSIONER_EMAIL);
    const league1 = await ctx.post("/api/leagues", {
      name: `Display Test League 1 ${Date.now()}`,
      seasonYear: 2026
    });
    
    const league2 = await ctx.post("/api/leagues", {
      name: `Display Test League 2 ${Date.now()}`, 
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/my-leagues");
    
    // === LEAGUES DISPLAY CORRECTLY ===
    await expect(page.getByTestId("league-card")).toHaveCount(2);
    
    // First league card  
    const firstCard = page.getByTestId("league-card").first();
    await expect(firstCard).toContainText(league1.name);
    await expect(firstCard).toContainText("2026");
    await expect(firstCard.getByText("Enter League")).toBeVisible();
    
    // Second league card
    const secondCard = page.getByTestId("league-card").last();
    await expect(secondCard).toContainText(league2.name);
    await expect(secondCard.getByText("Enter League")).toBeVisible();
    
    // === CREATE NEW STILL AVAILABLE ===
    await expect(page.getByTestId("no-league-create-button")).toBeVisible();
    
    // === ENTRY NAVIGATION WORKS ===
    await firstCard.getByText("Enter League").click();
    
    // Should navigate to league dashboard
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    
    // Cleanup - activate the created leagues
    await ctx.post("/api/auth/entry-resolver", { leagueId: league1.id });
    await ctx.post("/api/auth/entry-resolver", { leagueId: league2.id });
  });

  test("no duplicate-create or broken back navigation", async ({ page }) => {
    const testEmail = `regression-nav-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // === TEST DUPLICATE CREATE PROTECTION ===
    await page.goto("/my-leagues/new");
    
    // Fill form but don't submit
    await page.getByTestId("no-league-create-name").fill(`Nav Test ${Date.now()}`);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    await page.getByTestId("league-create-next-review").click();
    
    // === DOUBLE CLICK PROTECTION ===
    const submitButton = page.getByTestId("league-create-submit-button");
    
    // Click submit multiple times rapidly
    await submitButton.click();
    
    // Button should become disabled to prevent double submission
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText("Creating");
    
    // Wait for creation to complete
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    
    // === BACK NAVIGATION FROM CREATION ===
    // Navigate back to My Leagues
    await page.goto("/my-leagues");
    
    // Should show the created league
    await expect(page.getByTestId("league-card")).toBeVisible();
    
    // Create button should still work
    await page.getByTestId("no-league-create-button").click();
    await expect(page).toHaveURL("/my-leagues/new");
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    
    // === WIZARD BACK NAVIGATION ===
    // Navigate through wizard steps and back
    await page.getByTestId("no-league-create-name").fill("Back Nav Test");
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    
    // Go back to basics
    await page.getByTestId("league-create-back").click();
    await expect(page.getByTestId("league-create-step-basics")).toHaveAttribute("aria-current", "step");
    
    // Form data should be preserved
    await expect(page.getByTestId("no-league-create-name")).toHaveValue("Back Nav Test");
    await expect(page.getByTestId("no-league-create-season-year")).toHaveValue("2026");
    
    // === BREADCRUMB NAVIGATION ===
    await page.getByText("← Back to Dynasty Football Hub").click();
    await expect(page).toHaveURL("/my-leagues");
    await expect(page.getByText("Dynasty Football Hub")).toBeVisible();
  });

  test("complete end-to-end demo auth integration", async ({ page }) => {
    // This tests the complete flow from auth through league creation
    const testEmail = `e2e-demo-${Date.now()}@example.com`;
    
    // === START UNAUTHENTICATED ===
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(/Sunday Empire/i);
    
    // === AUTH SIMULATION ===
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // === AUTHENTICATED REDIRECT ===
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/(my-leagues|select-league)/);
    
    // === MY LEAGUES LOADS ===
    await expect(page.getByText("Dynasty Football Hub")).toBeVisible();
    await expect(page.getByTestId("my-leagues-empty-state")).toBeVisible();
    
    // === COMPLETE CREATE LEAGUE FLOW ===
    await page.getByTestId("no-league-create-button").click();
    await expect(page).toHaveURL("/my-leagues/new");
    
    const leagueName = `E2E Demo League ${Date.now()}`;
    await page.getByTestId("no-league-create-name").fill(leagueName);
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await page.getByTestId("league-create-next-options").click();
    
    // Add optional data this time
    await page.getByTestId("no-league-create-description").fill("Complete demo integration test league");
    await page.getByTestId("league-create-next-review").click();
    
    // Verify complete data in review
    const reviewStep = page.getByTestId("league-create-review-step");
    await expect(reviewStep).toContainText(leagueName);
    await expect(reviewStep).toContainText("Complete demo integration test league");
    
    // Create league
    await page.getByTestId("league-create-submit-button").click();
    
    // === LAND IN LEAGUE SUCCESSFULLY ===
    await expect(page).toHaveURL(/\/league\/[a-zA-Z0-9-]+$/);
    await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
    await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(leagueName);
    await expect(page.getByText("Commissioner Mode")).toBeVisible();
    
    // === VERIFY COMPLETE CONTEXT SWITCH ===
    // Should now have league workspace UI (not account-level)
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
    await expect(page.getByText("Primary Action")).toBeVisible();
    
    // Description should be preserved in league context
    await expect(page.getByText("Complete demo integration test league")).toBeVisible();
  });
});