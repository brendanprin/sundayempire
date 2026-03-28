import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, getCapturedMagicLink } from "./helpers/api";

test.describe("Production Login", () => {
  test("login page is email-first and does not expose the demo selector by default", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toContainText("Email Me a Sign-In Link");
    await expect(page.getByTestId("login-role-prompt")).toHaveCount(0);
    await expect(page.getByTestId("login-demo-auth-panel")).toHaveCount(0);
  });

  test("magic-link sign-in succeeds and sign-out revokes the session", async ({
    page,
    baseURL,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login?returnTo=%2F");

    await page.getByTestId("login-email-input").fill(OWNER_EMAIL);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(
      OWNER_EMAIL,
    );

    const magicLink = await getCapturedMagicLink(baseURL as string, OWNER_EMAIL, {
      returnTo: "/",
    });
    await page.goto(magicLink.url);

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("account-email")).toContainText(OWNER_EMAIL);

    await page.getByTestId("account-sign-out").click();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
  });
});
