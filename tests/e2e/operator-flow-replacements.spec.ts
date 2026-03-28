import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Canonical operator flow replacements", () => {
  test("commissioner contract maintenance lives in Commissioner Operations", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    await expect(page.getByRole("heading", { name: "Commissioner Operations" })).toBeVisible();
    await expect(page.getByTestId("commissioner-contract-operations")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contract Operations" })).toBeVisible();
    await expect(page.getByText("Create League Contract Entry")).toBeVisible();
    await expect(page.getByTestId("contracts-standard-table")).toBeVisible();
    await expect(page.getByTestId("contracts-retired-notice")).toHaveCount(0);
  });

  test("pick ownership transfer lives in Picks & Draft", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/draft");

    await expect(page.getByRole("heading", { name: "Picks & Draft" })).toBeVisible();
    await expect(page.getByTestId("draft-pick-ownership-operations")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick Ownership Operations" })).toBeVisible();
    await expect(page.getByTestId("picks-standard-table")).toBeVisible();
    await expect(page.getByTestId("picks-retired-notice")).toHaveCount(0);
  });
});
