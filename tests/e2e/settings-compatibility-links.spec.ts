import { expect, test } from "@playwright/test";
import { OWNER_EMAIL } from "./helpers/api";

test.describe("Settings compatibility links", () => {
  test("retained utility routes stay discoverable in settings without returning to primary navigation", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/settings");

    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByTestId("settings-compatibility-links")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Compatibility and utilities" })).toBeVisible();
    await expect(page.getByTestId("settings-compatibility-section-commissioner")).toBeVisible();
    await expect(page.getByTestId("settings-compatibility-link-contracts")).toHaveCount(0);
    await expect(page.getByTestId("settings-compatibility-link-picks")).toHaveCount(0);
    await expect(page.getByTestId("settings-compatibility-link-startup-draft")).toHaveCount(0);
    await expect(page.getByTestId("settings-compatibility-link-diagnostics")).toBeVisible();
    await expect(page.getByTestId("settings-retired-prototype-note")).toBeVisible();
    await expect(page.getByTestId("settings-compatibility-link-collaboration")).toHaveCount(0);
    await expect(page.getByTestId("settings-compatibility-link-planning")).toHaveCount(0);
    await expect(page.getByTestId("settings-compatibility-link-recaps")).toHaveCount(0);
    await expect(
      page.getByText(
        "Contracts Utility, Pick Ownership Utility, Startup Draft, Planning, Collaboration, and Recaps",
      ),
    ).toBeVisible();

    const sidebarNav = page.locator("aside nav");
    await expect(sidebarNav.getByRole("link", { name: "Collaboration", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Planning", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Recaps", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Diagnostics", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Contracts Utility", exact: true })).toHaveCount(0);
    await expect(sidebarNav.getByRole("link", { name: "Pick Ownership Utility", exact: true })).toHaveCount(0);
  });
});
