import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

test.describe("Utility quarantine", () => {
  test("retired prototype utilities fence traffic back toward canonical workflows", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });

    await page.goto("/planning");
    await expect(page.getByTestId("planning-retired-route")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planning Sandbox Retired" })).toBeVisible();
    await expect(page.getByTestId("planning-retired-route-links")).toBeVisible();
    await expect(page.getByTestId("planning-board")).toHaveCount(0);

    await page.goto("/collaboration");
    await expect(page.getByTestId("collaboration-retired-route")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Collaboration Utility Retired" })).toBeVisible();
    await expect(page.getByTestId("collaboration-retired-route-links")).toBeVisible();
    await expect(page.getByTestId("collaboration-page")).toHaveCount(0);

    await page.goto("/recaps");
    await expect(page.getByTestId("recaps-retired-route")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recap Builder Retired" })).toBeVisible();
    await expect(page.getByTestId("recaps-retired-route-links")).toBeVisible();
    await expect(page.getByTestId("recap-builder-page")).toHaveCount(0);
  });

  test("retired contract and pick utility routes redirect into canonical operator sections", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto("/contracts");
    await expect(page).toHaveURL(/\/commissioner\?legacy=contracts#contract-operations$/);
    await expect(page.getByTestId("commissioner-contract-operations")).toBeVisible();
    await expect(page.getByTestId("contracts-retired-notice")).toBeVisible();

    await page.goto("/picks");
    await expect(page).toHaveURL(/\/draft\?legacy=picks#pick-ownership-operations$/);
    await expect(page.getByTestId("draft-pick-ownership-operations")).toBeVisible();
    await expect(page.getByTestId("picks-retired-notice")).toBeVisible();
  });
});
