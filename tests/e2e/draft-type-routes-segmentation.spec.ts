import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Draft Type Route Segmentation", () => {
  test("draft home routes into the rookie workspace through the canonical primary card", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/draft");

    await expect(page.getByRole("heading", { name: "Picks & Draft", exact: true })).toBeVisible();
    await expect(page.getByTestId("draft-primary-workspaces")).toBeVisible();
    await page.getByTestId("draft-rookie-card").click();

    await expect(page).toHaveURL(/\/draft\/rookie$/);
    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace", exact: true })).toBeVisible();
  });

  test("startup route retires back into Picks & Draft with an explicit notice", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/draft/startup");

    await expect(page).toHaveURL(/\/draft\?startup=retired$/);
    await expect(page.getByRole("heading", { name: "Picks & Draft", exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-draft-retired-notice")).toBeVisible();
  });
});
