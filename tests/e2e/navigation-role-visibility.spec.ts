import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL, READ_ONLY_EMAIL } from "./helpers/api";

test.describe("Role-Aware Navigation", () => {
  test("commissioner sees commissioner-first navigation", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    const sidebarNav = page.getByTestId("shell-side-nav").getByRole("navigation", { name: "Primary navigation" });

    await expect(sidebarNav.getByRole("link", { name: "Commissioner Home", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Commissioner Audit", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Sync Queue", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Picks & Draft", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Commissioner Operations" })).toBeVisible();
  });

  test("team-assigned member sees member navigation and no commissioner links", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    const sidebarNav = page.getByTestId("shell-side-nav").getByRole("navigation", { name: "Primary navigation" });

    await expect(sidebarNav.getByRole("link", { name: "My Roster / Cap", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Trades", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Picks & Draft", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "League Member Workspace" })).toBeVisible();

    await expect(sidebarNav.getByRole("link", { name: "Commissioner Home", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Diagnostics", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Collaboration", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Planning", exact: true })).toHaveCount(0);
  });

  test("member without team sees canonical browse navigation and no team-manager-only surfaces", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": READ_ONLY_EMAIL });
    await page.goto("/");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    const sidebarNav = page.getByTestId("shell-side-nav").getByRole("navigation", { name: "Primary navigation" });

    await expect(sidebarNav.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Teams", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Players", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Trades", exact: true })).toBeVisible();
    await expect(sidebarNav.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(
      page
        .getByTestId("shell-top-bar")
        .getByRole("heading", { name: "League Workspace", exact: true }),
    ).toBeVisible();

    await expect(sidebarNav.getByRole("link", { name: "My Roster / Cap", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Commissioner Home", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Diagnostics", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Collaboration", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Planning", exact: true })).toHaveCount(0);
  });
});
