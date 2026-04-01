import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

test.describe("Commissioner Team Admin Route", () => {
  test("commissioner can access isolated owner/team administration workspace", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner/teams");

    await expect(page.getByRole("heading", { name: "Commissioner Team Administration" })).toBeVisible();
    await expect(page.getByTestId("commissioner-team-admin-owners-table")).toBeVisible();
    await expect(page.getByTestId("commissioner-team-admin-teams-table")).toBeVisible();

    // Setup utilities are collapsed by default — expand to verify forms are present
    await page.getByTestId("setup-utilities-toggle").click();
    await expect(page.getByRole("heading", { name: "Create League Member" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create Franchise" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add League Member" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Franchise" })).toBeVisible();
  });

  test("non-commissioner users are redirected away from commissioner team admin route", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/commissioner/teams");

    await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  });
});
