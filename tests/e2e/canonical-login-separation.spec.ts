import { expect, test } from "@playwright/test";

const demoAuthEnabled = process.env.AUTH_DEMO_LOGIN_ENABLED === "1";

test.describe("Canonical Login Separation", () => {
  test("canonical login page remains clean without demo controls", async ({ page }) => {
    await page.goto("/login");

    // Should show the standard sign-in form
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
    
    // Should NOT show any demo auth controls
    await expect(page.getByTestId("login-demo-auth-panel")).not.toBeVisible();
    await expect(page.getByTestId("login-show-demo-section")).not.toBeVisible();
    await expect(page.getByTestId("login-role-option-commissioner")).not.toBeVisible();
    await expect(page.getByTestId("login-demo-email-select")).not.toBeVisible();
    
    // Should have clean, product-focused UI
    await expect(page.locator("h2")).toContainText("Sign in to your account");
    await expect(page.locator("text=Magic-link authentication")).toBeVisible();
  });

  test.skip(!demoAuthEnabled, "Dev login route only available when demo auth is enabled");

  test("dev login route provides dedicated demo access", async ({ page }) => {
    await page.goto("/dev/login");

    // Should show development-only branding
    await expect(page.locator("text=Development Access")).toBeVisible();
    await expect(page.locator("text=Development Environment Only")).toBeVisible();
    
    // Should show demo auth controls
    await expect(page.getByTestId("login-demo-auth-panel")).toBeVisible();
    await expect(page.getByTestId("login-role-option-commissioner")).toBeVisible();
    
    // Should link back to canonical login
    await expect(page.locator("a[href*='/login']")).toBeVisible();
  });

  test("dev login redirects to canonical when demo auth disabled", async ({ page }) => {
    // This test simulates production behavior where demo auth is disabled
    if (demoAuthEnabled) {
      test.skip(true, "This test only applies when demo auth is disabled");
    }

    await page.goto("/dev/login");
    
    // Should be redirected to canonical login
    await expect(page).toHaveURL(/\/login/);
  });
});