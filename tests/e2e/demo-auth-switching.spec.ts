import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

const demoAuthEnabled = process.env.AUTH_DEMO_LOGIN_ENABLED === "1";

test.describe("Demo Authentication Switching", () => {
  test.skip(!demoAuthEnabled, "Demo auth selector is only available when explicitly enabled.");

  test("demo login page exposes seeded role switching when enabled", async ({ page }) => {
    await page.goto("/login");

    // Should show subtle dev access entry point
    await expect(page.getByTestId("login-show-demo-section")).toBeVisible();
    await page.getByTestId("login-show-demo-section").click();

    // Should open modal with demo auth panel
    await expect(page.getByTestId("login-demo-auth-panel")).toBeVisible();
    await expect(page.getByTestId("login-role-option-commissioner")).toContainText(
      "League Commissioner",
    );
    await expect(page.getByTestId("login-role-option-member-team")).toContainText(
      "League Member (Team)",
    );
    await expect(page.getByTestId("login-role-option-member-no-team")).toContainText(
      "League Member (No Team)",
    );
  });

  test("demo mode can switch between member and commissioner contexts", async ({ page }) => {
    await page.goto("/login");
    
    // Open demo auth modal
    await page.getByTestId("login-show-demo-section").click();
    await expect(page.getByTestId("login-demo-email-select")).toBeVisible();

    await page.getByTestId("login-role-option-member-team").click();
    await page.getByTestId("login-demo-email-select").selectOption(OWNER_EMAIL);
    await page.getByTestId("login-demo-submit").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("role-context-role")).toHaveText("Member");

    await page.getByTestId("open-login-link").click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2F&switch=1$/);
    
    // Open demo auth modal again
    await page.getByTestId("login-show-demo-section").click();
    await page.getByTestId("login-role-option-commissioner").click();
    await page.getByTestId("login-demo-email-select").selectOption(COMMISSIONER_EMAIL);
    await page.getByTestId("login-demo-submit").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("role-context-role")).toHaveText("Commissioner");
  });
});
