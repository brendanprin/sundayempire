import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL, READ_ONLY_EMAIL } from "./helpers/api";

test.describe("Canonical Sidebar Navigation", () => {
  test.setTimeout(60_000);

  test("commissioner navigation is grouped around operations and canonical league surfaces", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("shell-side-nav")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("primary-nav-section-operations").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const operations = page.getByTestId("primary-nav-section-operations");
    const primary = page.getByTestId("primary-nav-section-primary");

    await expect(operations).toBeVisible();
    await expect(primary).toBeVisible();

    await expect(operations.getByRole("link", { name: "Commissioner Home", exact: true })).toBeVisible();
    await expect(operations.getByRole("link", { name: "Commissioner Audit", exact: true })).toBeVisible();
    await expect(operations.getByRole("link", { name: "Sync Queue", exact: true })).toBeVisible();
    await expect(primary.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(primary.getByRole("link", { name: "Picks & Draft", exact: true })).toBeVisible();
    await expect(primary.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Collaboration", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Planning", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Recaps", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Diagnostics", exact: true })).toHaveCount(0);
  });

  test("owner and read-only users keep canonical role-safe navigation", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("shell-side-nav")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("primary-nav-section-primary").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    await expect(page.getByTestId("primary-nav-section-primary")).toBeVisible();
    await expect(page.getByRole("link", { name: "My Roster / Cap", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "League Activity", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rules & Deadlines", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Commissioner Home", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Collaboration", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Planning", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Recaps", exact: true })).toHaveCount(0);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": READ_ONLY_EMAIL });
    await page.goto("/");

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("shell-side-nav")).toBeVisible();
    await expect(page.getByTestId("primary-nav-section-primary")).toBeVisible();
    await expect(page.getByTestId("primary-nav-section-reference")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Teams", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Players", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Commissioner Home", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Collaboration", exact: true })).toHaveCount(0);
  });
});
