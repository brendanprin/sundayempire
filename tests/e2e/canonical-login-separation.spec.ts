import { expect, test } from "@playwright/test";

const demoAuthEnabled = process.env.AUTH_DEMO_LOGIN_ENABLED === "1";

test.describe("Canonical Login with Subtle Dev Access", () => {
  test("canonical login page prioritizes main auth with subtle dev access", async ({ page }) => {
    await page.goto("/login");

    // Should show the standard sign-in form as primary element
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
    
    // Should have clean, product-focused UI
    await expect(page.locator("h2")).toContainText("Sign in to your account");
    await expect(page.locator("text=Magic-link authentication")).toBeVisible();
    
    if (demoAuthEnabled) {
      // Should show subtle dev access entry point
      await expect(page.getByTestId("login-show-demo-section")).toBeVisible();
      await expect(page.getByTestId("login-show-demo-section")).toContainText("Development access");
      
      // Should NOT show expanded demo controls by default
      await expect(page.getByTestId("login-demo-auth-panel")).not.toBeVisible();
    } else {
      // Should NOT show any dev access when disabled
      await expect(page.getByTestId("login-show-demo-section")).not.toBeVisible();
    }
  });

  test.skip(!demoAuthEnabled, "Demo auth modal only available when demo auth is enabled");

  test("dev access modal provides contained demo functionality", async ({ page }) => {
    await page.goto("/login");

    // Click subtle dev access entry point
    await page.getByTestId("login-show-demo-section").click();
    
    // Should show modal with demo auth controls
    await expect(page.getByTestId("login-demo-auth-panel")).toBeVisible();
    await expect(page.locator("text=Development Access")).toBeVisible();
    await expect(page.locator("text=Local development utility")).toBeVisible();
    
    // Should show demo role options
    await expect(page.getByTestId("login-role-option-commissioner")).toBeVisible();
    
    // Should be cancellable
    await page.locator("text=Cancel").click();
    await expect(page.getByTestId("login-demo-auth-panel")).not.toBeVisible();
  });

  test("modal design does not dominate page hierarchy", async ({ page }) => {
    await page.goto("/login");
    
    // Main login form should be visible and primary
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
    
    // Dev access should be subtle and secondary
    const devAccessButton = page.getByTestId("login-show-demo-section");
    await expect(devAccessButton).toBeVisible();
    
    // Should have subtle styling (small text, muted color)
    await expect(devAccessButton).toHaveCSS("text-decoration-line", "underline");
    
    // When opened, should overlay (not disrupt layout)
    await devAccessButton.click();
    
    // Main form should still be present behind modal
    await expect(page.locator("h2:has-text('Sign in to your account')")).toBeVisible();
    
    // Modal should be centered overlay
    const modal = page.getByTestId("login-demo-auth-panel");
    await expect(modal).toBeVisible();
    
    // Close modal
    await page.locator("button[aria-label='Close development access']").click();
    await expect(modal).not.toBeVisible();
  });
});