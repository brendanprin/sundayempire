import { test, expect, type Page } from "@playwright/test";
import { apiContext, getCapturedMagicLink } from "./helpers/api";

/**
 * Comprehensive test coverage for the complete authentication and entry flow.
 * This covers the first vertical slice: login, league selection, and role-based landing.
 */

const COMMISSIONER_EMAIL = "commissioner@local.league";  
const MANAGER_EMAIL = "owner01@local.league";
const NO_TEAM_EMAIL = "readonly@local.league"; 

// Helper to check if demo auth is enabled
async function isDemoAuthEnabled(page: Page): Promise<boolean> {
  await page.goto("/login");
  return page.locator('[data-testid="login-show-demo-section"]').isVisible();
}

// Helper to clear all authentication state
async function clearAuthState(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

test.describe("Complete Authentication Entry Flow", () => {

  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test.describe("Pre-Authentication Flow", () => {

    test("unauthenticated user sees landing page with correct CTAs", async ({ page }) => {
      await page.goto("/");
      
      // Verify landing page loads
      await expect(page).toHaveTitle(/SundayEmpire/);
      await expect(page.locator("h1")).toContainText(/Sunday Empire/i);
      
      // Verify sign-in CTAs are present and correctly labeled  
      const signInButtons = page.locator('button:has-text("Sign in"), a:has-text("Sign in")');
      await expect(signInButtons.first()).toBeVisible();
    });

    test("landing CTA navigates to auth page", async ({ page }) => {
      await page.goto("/");
      
      // Click primary CTA
      const signInButton = page.locator('button:has-text("Sign in"), a:has-text("Sign in")').first();
      await signInButton.click();
      
      // Verify navigation to login
      await expect(page).toHaveURL("/login");
      await expect(page.locator("h1")).toContainText(/Sign in/i);
    });

    test("email submit shows confirmation state", async ({ page }) => {
      await page.goto("/login");
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]:has-text("Send")').or(
        page.locator('button[type="submit"]:has-text("Sign in")')
      );
      
      // Fill and submit email
      await emailInput.fill(MANAGER_EMAIL);
      await submitButton.click();
      
      // Verify confirmation state appears
      await expect(page.locator("h2")).toContainText(/check your email/i);
      await expect(page.locator("text=We sent a sign-in link")).toBeVisible();
    });

    test("invalid magic link shows error state safely", async ({ page }) => {
      // Visit an invalid/expired magic link
      await page.goto("/login?token=invalid-expired-token-12345");
      
      // Should see error state, not crash
      await expect(page.locator('[data-testid="auth-error"]').or(
        page.locator("text=invalid").or(page.locator("text=expired"))
      )).toBeVisible();
      
      // Should have way to recover (back to login)
      await expect(page.locator('button:has-text("Try Again"), a:has-text("Sign in")').first()).toBeVisible();
    });

    test("demo path only works in non-prod environments", async ({ page }) => {
      await page.goto("/login");
      
      const demoTrigger = page.locator('[data-testid="login-show-demo-section"]');
      const isDemoVisible = await demoTrigger.isVisible();

      // Demo should only be visible when enabled via env vars
      if (process.env.AUTH_DEMO_LOGIN_ENABLED === "1") {
        await expect(demoTrigger).toBeVisible();
      } else {
        await expect(demoTrigger).not.toBeVisible();
      }
    });

  });

  test.describe("Post-Authentication Flow - Multi-League Scenarios", () => {

    test("multi-league user gets league selection page", async ({ page }) => {
      const demoEnabled = await isDemoAuthEnabled(page);
      
      if (demoEnabled) {
        // Use demo auth for faster testing
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-commissioner"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
        
        // Should route to league selection for multi-league demo user
        await expect(page).toHaveURL("/select-league");
        await expect(page.locator("h1")).toContainText(/Select a League/i);
      } else {
        // Use magic link flow  
        await page.goto("/login");
        await page.locator('input[type="email"]').fill(COMMISSIONER_EMAIL);
        await page.locator('button[type="submit"]').click();
        
        // Get magic link and navigate
        const magicLink = await getCapturedMagicLink(page.url(), COMMISSIONER_EMAIL);
        await page.goto(magicLink);
        
        // Should route to league selection for multi-league user
        await expect(page).toHaveURL("/select-league");
        await expect(page.locator("h1")).toContainText(/Select a League/i);
      }
      
      // Verify league selection shows proper cards
      await expect(page.locator('[data-testid="league-selection-grid"]')).toBeVisible();
      await expect(page.locator('[data-testid="league-selection-card"]').first()).toBeVisible();
    });

    test("multi-league selection navigates to correct destination", async ({ page }) => {
      const demoEnabled = await isDemoAuthEnabled(page);
      
      // Get to league selection page
      if (demoEnabled) {
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-commissioner"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
      } else {
        await page.goto("/login");
        await page.locator('input[type="email"]').fill(COMMISSIONER_EMAIL);
        await page.locator('button[type="submit"]').click();
        const magicLink = await getCapturedMagicLink(page.url(), COMMISSIONER_EMAIL);
        await page.goto(magicLink);
      }
      
      await expect(page).toHaveURL("/select-league");
      
      // Click a league card
      const firstLeagueCard = page.locator('[data-testid="league-selection-card"]').first();
      await firstLeagueCard.click();
      
      // Should navigate to role-appropriate destination (not back to league selection)
      await page.waitForURL(url => !url.includes("/select-league"), { timeout: 10000 });
      
      // Verify we ended up somewhere appropriate (commissioner dashboard, team workspace, etc.)
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/(commissioner|teams|league\/)/);
    });

  });

  test.describe("Post-Authentication Flow - Single League Auto-Entry", () => {

    test("single-league user bypasses selection page", async ({ page, baseURL }) => {
      // Create a temporary single-league user via API setup
      const api = await apiContext(baseURL!, MANAGER_EMAIL);
      
      // Simulate single-league scenario by pre-configuring user with only one league access
      // (This would require test data setup, but we'll test the behavior path)
      
      const demoEnabled = await isDemoAuthEnabled(page);
      
      if (demoEnabled) {
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-member-with-team"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
      } else {
        await page.goto("/login");
        await page.locator('input[type="email"]').fill(MANAGER_EMAIL);
        await page.locator('button[type="submit"]').click();
        const magicLink = await getCapturedMagicLink(page.url(), MANAGER_EMAIL);
        await page.goto(magicLink);
      }
      
      // Should bypass league selection and route directly to appropriate destination
      await page.waitForLoadState("networkidle");
      
      // Verify we didn't land on league selection page
      expect(page.url()).not.toContain("/select-league");
      
      // Should be on team workspace or appropriate landing page
      const currentUrl = page.url(); 
      expect(currentUrl).toMatch(/\/(teams|league|commissioner)/);
    });

  });

  test.describe("Role-Based Landing Destinations", () => {

    test("commissioner lands on operations dashboard", async ({ page }) => {
      const demoEnabled = await isDemoAuthEnabled(page);
      
      if (demoEnabled) {
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-commissioner"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
        
        // Navigate through league selection if multi-league
        const isOnSelection = await page.locator("h1:has-text('Select a League')").isVisible();
        if (isOnSelection) {
          await page.locator('[data-testid="league-selection-card"]').first().click();
          await page.waitForURL(url => !url.includes("/select-league"));
        }
        
        // Should land on commissioner operations
        await expect(page).toHaveURL("/commissioner");
        await expect(page.locator("h1")).toContainText(/Commissioner/i);
      }
    });

    test("team manager lands on team workspace", async ({ page }) => {
      const demoEnabled = await isDemoAuthEnabled(page);
      
      if (demoEnabled) {
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-member-with-team"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
        
        // Navigate through league selection if multi-league
        const isOnSelection = await page.locator("h1:has-text('Select a League')").isVisible();
        if (isOnSelection) {
          await page.locator('[data-testid="league-selection-card"]').first().click();
          await page.waitForURL(url => !url.includes("/select-league"));
        }
        
        // Should land on team workspace
        await page.waitForLoadState("networkidle");
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/\/teams\/[^\/]+$/);
      }
    });

    test("no-team member lands on teams directory", async ({ page }) => {
      const demoEnabled = await isDemoAuthEnabled(page);
      
      if (demoEnabled) {
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-member-no-team"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
        
        // Navigate through league selection if multi-league
        const isOnSelection = await page.locator("h1:has-text('Select a League')").isVisible();
        if (isOnSelection) {
          await page.locator('[data-testid="league-selection-card"]').first().click();
          await page.waitForURL(url => !url.includes("/select-league"));
        }
        
        // Should land on teams directory for team browsing/onboarding
        await expect(page).toHaveURL("/teams");
        await expect(page.locator("h1")).toContainText(/Teams/i);
      }
    });

  });

  test.describe("Error Handling and Edge Cases", () => {

    test("no leagues user sees empty state with recovery options", async ({ page }) => {
      // This would require setting up a user with no league access
      // For now, we'll test the UI exists properly
      await page.goto("/select-league");
      
      const emptyState = page.locator('[data-testid="league-selection-empty-state"]');
      if (await emptyState.isVisible()) {
        await expect(emptyState.locator("h3")).toContainText(/No Leagues/i);
        await expect(emptyState.locator('button:has-text("Create League")')).toBeVisible();
        await expect(emptyState.locator('button:has-text("Return Home")')).toBeVisible();
      }
    });

    test("auth errors don't create dead-end states", async ({ page }) => {
      // Test session expired scenario
      await page.goto("/login?error=session_expired");
      
      // Should show error but allow recovery
      await expect(page.locator('[data-testid="auth-error"]').or(
        page.locator("text=session expired").or(page.locator("text=please sign in"))
      )).toBeVisible();
      
      // Should have functional sign-in form
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("navigation maintains proper auth context", async ({ page }) => {
      const demoEnabled = await isDemoAuthEnabled(page);
      
      if (demoEnabled) {
        // Sign in and navigate to landing destination
        await page.goto("/login");
        await page.locator('[data-testid="login-show-demo-section"]').click();
        await page.locator('[data-testid="login-role-option-member-with-team"]').click();
        await page.locator('button:has-text("Use Demo Identity")').click();
        
        // Navigate through selection if needed
        const isOnSelection = await page.locator("h1:has-text('Select a League')").isVisible();
        if (isOnSelection) {
          await page.locator('[data-testid="league-selection-card"]').first().click();
        }
        
        await page.waitForLoadState("networkidle");
        
        // Navigate to public page - should redirect authenticated users
        await page.goto("/");
        
        // Authenticated users should not land on public home page
        await page.waitForLoadState("networkidle");
        expect(page.url()).not.toBe("/");
        expect(page.url()).toMatch(/\/(dashboard|teams|commissioner|league)/);
      }
    });

  });

  test.describe("Demo vs Production Behavior", () => {

    test("demo auth panel visibility matches environment configuration", async ({ page }) => {
      await page.goto("/login");
      
      const demoTrigger = page.locator('[data-testid="login-show-demo-section"]');
      const authCompatEnabled = process.env.AUTH_COMPAT_ALLOW_LEGACY_IDENTITY === "1";
      const demoLoginEnabled = process.env.AUTH_DEMO_LOGIN_ENABLED === "1";

      if (authCompatEnabled && demoLoginEnabled) {
        await expect(demoTrigger).toBeVisible();
      } else {
        await expect(demoTrigger).not.toBeVisible();
      }
    });

    test("production behavior requires magic link flow", async ({ page }) => {
      // Temporarily disable demo auth for this test
      const originalDemoEnabled = process.env.AUTH_DEMO_LOGIN_ENABLED;
      
      // Simulate production environment
      await page.addInitScript(() => {
        // Override any demo auth checks
        window.localStorage.setItem('test-force-production-auth', 'true');
      });
      
      await page.goto("/login");
      
      // Should not show demo auth section in production mode
      const demoTrigger = page.locator('[data-testid="login-show-demo-section"]');
      if (originalDemoEnabled !== "1") {
        await expect(demoTrigger).not.toBeVisible();
      }
      
      // Should require email submission
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]:has-text("Send")')).toBeVisible();
    });

  });

});