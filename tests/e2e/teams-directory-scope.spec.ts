import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

test.describe("Teams Directory Scope", () => {
  test("teams route is browse-first and excludes inline admin controls", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/teams");

    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await expect(page.getByTestId("teams-standard-table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Team" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Owner" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Create Team" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Owner Management" })).toHaveCount(0);
  });

  test("owner can browse franchise directory without admin affordances", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/teams");

    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await expect(page.getByTestId("teams-table")).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("teams-table-row").count(), { timeout: 15_000 })
      .toBeGreaterThan(1);
    await expect(page.getByRole("button", { name: "Create Team" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Owner Management" })).toHaveCount(0);
  });
});
