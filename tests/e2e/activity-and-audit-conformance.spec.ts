import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

test.describe("Activity and audit conformance", () => {
  test("league activity uses canonical feed language for owners", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/activity");

    await expect(page.getByRole("heading", { name: "League Activity" })).toBeVisible();
    await expect(page.getByTestId("activity-feed")).toBeVisible();
    await expect(page.getByTestId("activity-visibility-label")).toContainText(
      "League-visible events only",
    );
    await expect(page.getByTestId("activity-day-group").first()).toBeVisible();
    await expect(page.getByText("Commissioner-only operational history")).toHaveCount(0);
  });

  test("commissioner audit stays distinct from the public activity feed", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner/audit");

    await expect(page.getByRole("heading", { name: "Commissioner Audit" })).toBeVisible();
    await expect(page.getByTestId("commissioner-audit-feed")).toBeVisible();
    await expect(page.getByText("public League Activity feed")).toBeVisible();
    await expect(page.getByText("Commissioner-only operational history")).toBeVisible();
  });
});
