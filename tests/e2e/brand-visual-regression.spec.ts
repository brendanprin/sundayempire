import { test, expect } from "@playwright/test";

test.describe("Brand Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure consistent rendering for visual tests
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("login page displays SundayEmpire brand wordmark", async ({ page }) => {
    await page.goto("/login");
    
    // Verify brand wordmark is visible in auth layout
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    // Verify brand authentication surfaces are rendered
    await expect(page.locator('[data-testid="login-email-input"]')).toBeVisible();
    
    // Take screenshot for visual regression
    await expect(page).toHaveScreenshot("login-branded.png", { 
      fullPage: true,
      animations: "disabled",
    });
  });

  test("app shell displays brand integration", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    
    // Check if shell is available (might require authentication)
    const shell = page.locator('[data-testid="shell-top-bar"]');
    const isShellVisible = await shell.isVisible();
    
    if (isShellVisible) {
      // Verify shell brand elements if shell is visible
      await expect(shell).toBeVisible();
      await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible(); // Brand badge
    }
    
    // Take screenshot regardless of shell visibility
    await expect(page).toHaveScreenshot("shell-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("dashboard shows consistent brand surfaces", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
      
    // Take screenshot of branded dashboard
    await expect(page).toHaveScreenshot("dashboard-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("trades page maintains brand consistency with functional clarity", async ({ page }) => {
    await page.goto("/trades");
    await page.waitForLoadState("domcontentloaded");
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("trades-home-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("teams page preserves authority while applying brand styling", async ({ page }) => {
    await page.goto("/teams");
    await page.waitForLoadState("domcontentloaded");
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("teams-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("empty state shows appropriate brand integration", async ({ page }) => {
    await page.goto("/activity");
    await page.waitForLoadState("domcontentloaded");
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("empty-state-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("not found page displays brand integration", async ({ page }) => {
    await page.goto("/nonexistent-route");
    await page.waitForLoadState("domcontentloaded");
    
    // Should have some brand elements visible
    const brandElements = page.locator('[alt*="SundayEmpire"]');
    await expect(brandElements.first()).toBeVisible();
    
    await expect(page).toHaveScreenshot("not-found-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("commissioner surfaces maintain authority with brand", async ({ page }) => {
    await page.goto("/commissioner");
    await page.waitForLoadState("domcontentloaded");
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("commissioner-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("draft page shows brand energy while maintaining controls", async ({ page }) => {
    await page.goto("/draft");
    await page.waitForLoadState("domcontentloaded");
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("draft-home-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("rules page maintains authority with brand integration", async ({ page }) => {
    await page.goto("/rules");
    await page.waitForLoadState("domcontentloaded");
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("rules-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("auction room responsive layouts maintain brand cohesion", async ({ page }) => {
    await page.goto("/draft");
    await page.waitForLoadState("domcontentloaded");
    
    // Test desktop auction layout branding (if available)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    
    // Verify brand badge is present in shell
    await expect(page.locator('[alt="SundayEmpire"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot("auction-desktop-branded.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Test tablet layout branding
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot("auction-tablet-branded.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Test mobile layout branding
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot("auction-mobile-branded.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});
