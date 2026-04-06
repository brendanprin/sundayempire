import { test, expect } from "@playwright/test";
import { loginAs, setupSmokeFixtures, captureSmokeEvidence, waitForPageStable } from "./helpers/smoke-fixtures";
import { getCapturedMagicLink } from "../e2e/helpers/api";

/**
 * Critical path smoke tests for authentication and entry flow.
 * These tests validate the core vertical slice: login → league selection → role-based landing.
 * 
 * Runs sequentially in CI to catch regressions in the primary user journeys.
 */

test.describe.serial("Auth Entry Flow - Smoke Tests", () => {
  
  test.beforeAll(async () => {
    await setupSmokeFixtures();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === "failed") {
      await captureSmokeEvidence(page, testInfo.title);
    }
  });

  test("SMOKE: Public landing → Auth → League Selection → Role Landing", async ({ page }) => {
    // Step 1: Unauthenticated user sees landing page
    await page.goto("/");
    await waitForPageStable(page);
    
    await expect(page.locator("h1")).toContainText(/Sunday Empire/i);
    await expect(page.locator('button:has-text("Sign in"), a:has-text("Sign in")').first()).toBeVisible();

    // Step 2: Navigate to auth
    const signInButton = page.locator('button:has-text("Sign in"), a:has-text("Sign in")').first();
    await signInButton.click();
    await waitForPageStable(page);
    
    await expect(page).toHaveURL("/login");
    await expect(page.locator("h1")).toContainText(/Sign in/i);

    // Step 3: Complete authentication (demo or magic-link)
    const demoTrigger = page.locator('[data-testid="login-show-demo-section"]');
    const isDemoVisible = await demoTrigger.isVisible();

    if (isDemoVisible) {
      // Use demo auth for faster smoke test
      await demoTrigger.click();
      await page.locator('[data-testid="login-role-option-commissioner"]').click();
      await page.locator('button:has-text("Use Demo Identity")').click();
    } else {
      // Use magic link flow
      await page.locator('input[type="email"]').fill("commissioner@local.league");
      await page.locator('button[type="submit"]').click();
      
      // Verify confirmation state
      await expect(page.locator("h2")).toContainText(/check your email/i);
      
      // Get and visit magic link
      const magicLink = await getCapturedMagicLink(page.url(), "commissioner@local.league");
      await page.goto(magicLink);
    }
    
    await waitForPageStable(page);

    // Step 4: Handle league selection or auto-entry
    const isOnSelection = page.url().includes("/select-league");
    
    if (isOnSelection) {
      await expect(page.locator("h1")).toContainText(/Select a League/i);
      
      // Select first league
      const firstLeague = page.locator('[data-testid="league-selection-card"]').first();
      await expect(firstLeague).toBeVisible();
      await firstLeague.click();
      await waitForPageStable(page);
    }

    // Step 5: Verify role-based landing
    await page.waitForURL(url => !url.includes("/select-league") && !url.includes("/login"));
    
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(commissioner|teams|league)/);
    
    // Verify we have proper authenticated shell
    await expect(page.locator("nav").or(page.locator("header")).first()).toBeVisible();
    
    console.log(`✅ SMOKE: Complete auth flow landed on: ${currentUrl}`);
  });

  test("SMOKE: Role-based routing - Commissioner", async ({ page }) => {
    await loginAs(page, "COMMISSIONER");
    await waitForPageStable(page);
    
    // Should land on commissioner operations
    await expect(page).toHaveURL("/commissioner");
    await expect(page.locator("h1")).toContainText(/Commissioner/i);
    
    console.log("✅ SMOKE: Commissioner role routes correctly");
  });

  test("SMOKE: Role-based routing - Team Manager", async ({ page }) => {
    await loginAs(page, "MEMBER_WITH_TEAM");
    await waitForPageStable(page);
    
    // Should land on team workspace
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/teams\/[^\/]+$/);
    
    console.log(`✅ SMOKE: Manager role routes to team workspace: ${currentUrl}`);
  });

  test("SMOKE: Role-based routing - No Team Member", async ({ page }) => {
    await loginAs(page, "MEMBER_NO_TEAM");
    await waitForPageStable(page);
    
    // Should land on teams directory 
    await expect(page).toHaveURL("/teams");
    await expect(page.locator("h1")).toContainText(/Teams/i);
    
    console.log("✅ SMOKE: No-team member routes to teams directory");
  });

  test("SMOKE: Authentication state protection", async ({ page }) => {
    // Start authenticated
    await loginAs(page, "MEMBER_WITH_TEAM");
    await waitForPageStable(page);
    
    // Try to visit public landing page
    await page.goto("/");
    await waitForPageStable(page);
    
    // Should redirect authenticated users away from public page
    const currentUrl = page.url();
    expect(currentUrl).not.toBe("/");
    expect(currentUrl).toMatch(/\/(dashboard|teams|commissioner|league)/);
    
    console.log(`✅ SMOKE: Authenticated users redirected from public page to: ${currentUrl}`);
  });

  test("SMOKE: League selection multi-league scenario", async ({ page }) => {
    // Use demo auth to get multi-league user
    await page.goto("/login");
    
    const demoTrigger = page.locator('[data-testid="login-show-demo-section"]');
    const isDemoVisible = await demoTrigger.isVisible();

    if (isDemoVisible) {
      await demoTrigger.click();
      await page.locator('[data-testid="login-role-option-commissioner"]').click();
      await page.locator('button:has-text("Use Demo Identity")').click();
      await waitForPageStable(page);
      
      // If on league selection, verify it works
      if (page.url().includes("/select-league")) {
        await expect(page.locator("h1")).toContainText(/Select a League/i);
        await expect(page.locator('[data-testid="league-selection-grid"]')).toBeVisible();
        
        const leagueCards = page.locator('[data-testid="league-selection-card"]');
        const cardCount = await leagueCards.count();
        expect(cardCount).toBeGreaterThan(0);
        
        // Select first league and verify navigation
        await leagueCards.first().click();
        await waitForPageStable(page);
        await page.waitForURL(url => !url.includes("/select-league"));
        
        console.log(`✅ SMOKE: League selection works with ${cardCount} leagues`);
      } else {
        console.log("✅ SMOKE: Single league auto-entry working (bypassed selection)");
      }
    } else {
      console.log("⚠️  SMOKE: Demo auth not available, skipping multi-league test");
    }
  });

  test("SMOKE: Magic link error states show specific messages and recovery completes", async ({ page }) => {
    // --- Expired link ---
    await page.goto("/login?error=magic_link_expired");
    await waitForPageStable(page);

    // Error banner must be visible with the right title
    await expect(page.getByText("Expired Sign-In Link")).toBeVisible();
    // Sign-in form must be hidden while error is shown
    await expect(page.getByTestId("login-email-input")).not.toBeVisible();

    // "Try again" button must be present for resendable errors
    const tryAgainButton = page.getByRole("button", { name: /try again/i });
    await expect(tryAgainButton).toBeVisible();

    // Clicking it clears the error and restores the sign-in form
    await tryAgainButton.click();
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
    await expect(page.getByText("Expired Sign-In Link")).not.toBeVisible();

    console.log("✅ SMOKE: Expired magic link — error shown, recovery restores sign-in form");

    // --- Used link ---
    await page.goto("/login?error=magic_link_used");
    await waitForPageStable(page);

    await expect(page.getByText("Already Used")).toBeVisible();
    await expect(page.getByTestId("login-email-input")).not.toBeVisible();

    console.log("✅ SMOKE: Used magic link — error shown correctly");

    // --- Invalid link ---
    await page.goto("/login?error=magic_link_invalid");
    await waitForPageStable(page);

    await expect(page.getByText("Invalid Sign-In Link")).toBeVisible();
    // Invalid links have no resend — "Try again" button should NOT appear
    await expect(page.getByRole("button", { name: /try again/i })).not.toBeVisible();
    // But the email input must NOT be shown either (error takes over the form area)
    await expect(page.getByTestId("login-email-input")).not.toBeVisible();

    console.log("✅ SMOKE: Invalid magic link — correct error, no misleading resend CTA");
  });

});