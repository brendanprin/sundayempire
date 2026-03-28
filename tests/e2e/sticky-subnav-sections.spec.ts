import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Sticky Section Navigation", () => {
  test.setTimeout(90_000);

  test("trades, draft, and commissioner pages expose sticky section anchors", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto("/trades");
    await expect(page.getByRole("heading", { name: "Trades", exact: true })).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("trades-subnav").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    const tradesSubnav = page.getByTestId("trades-subnav");
    await expect(tradesSubnav).toBeVisible();
    await tradesSubnav.getByRole("link", { name: "Inbox and Lifecycle" }).click();
    await expect(page).toHaveURL(/\/trades#trade-lifecycle$/);
    await expect(page.locator("#trade-lifecycle")).toBeVisible();

    await page.goto("/draft/rookie");
    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace", exact: true })).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("draft-subnav").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    const draftSubnav = page.getByTestId("draft-subnav");
    await expect(draftSubnav).toBeVisible();
    await draftSubnav.getByRole("link", { name: "Available Players" }).click();
    await expect(page).toHaveURL(/\/draft\/rookie#draft-players$/);
    await expect(page.locator("#draft-players")).toBeVisible();

    await page.goto("/commissioner");
    await expect(page.getByRole("heading", { name: "Commissioner", exact: true })).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("commissioner-subnav").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    const commissionerSubnav = page.getByTestId("commissioner-subnav");
    await expect(commissionerSubnav).toBeVisible();
    await commissionerSubnav.getByRole("link", { name: "Danger Zone" }).click();
    await expect(page).toHaveURL(/\/commissioner#commissioner-danger$/);
    await expect(page.locator("#commissioner-danger")).toBeVisible();
  });
});
