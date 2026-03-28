import { expect, test } from "@playwright/test";
import { OWNER_EMAIL } from "./helpers/api";

test.describe("Pilot Feedback Launcher", () => {
  test("canonical shell no longer exposes the global pilot feedback launcher", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/trades");

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("feedback-open-button")).toHaveCount(0);
    await expect(page.getByTestId("feedback-panel")).toHaveCount(0);
  });
});
