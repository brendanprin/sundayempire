import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Table Filter Presets", () => {
  test("players filters save, apply, and persist after reload", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/players");

    await expect(page.getByTestId("players-table-filters-toolbar")).toBeVisible();

    await page.getByTestId("players-table-filters-chip-free-agents").click();
    await expect(page.getByTestId("players-filter-rostered")).toHaveValue("false");

    await page.getByTestId("players-table-filters-save").click();

    await page.getByTestId("players-table-filters-chip-all").click();
    await expect(page.getByTestId("players-filter-rostered")).toHaveValue("");

    await page.getByTestId("players-table-filters-apply-saved").click();
    await expect(page.getByTestId("players-filter-rostered")).toHaveValue("false");

    await page.reload();
    await expect(page.getByTestId("players-filter-rostered")).toHaveValue("false");
  });

  test("contract operations quick chips stay synchronized with filter controls", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto("/commissioner#contract-operations");
    await expect(page.getByTestId("contracts-table-filters-toolbar")).toBeVisible();
    await page.getByTestId("contracts-table-filters-chip-expiring").click();
    await expect(page.getByTestId("contracts-filter-expiring")).toBeChecked();

    await page.getByTestId("contracts-table-filters-save").click();
    await page.getByTestId("contracts-table-filters-reset").click();
    await expect(page.getByTestId("contracts-filter-expiring")).not.toBeChecked();
    await page.getByTestId("contracts-table-filters-apply-saved").click();
    await expect(page.getByTestId("contracts-filter-expiring")).toBeChecked();
  });

  test("major table pages expose quick filter toolbars", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    const pages = [
      { path: "/teams", toolbar: "teams-table-filters-toolbar", chip: "teams-table-filters-chip-needs-action" },
      { path: "/players", toolbar: "players-table-filters-toolbar", chip: "players-table-filters-chip-rostered" },
      { path: "/draft#pick-ownership-operations", toolbar: "picks-table-filters-toolbar", chip: "picks-table-filters-chip-all-seasons" },
      { path: "/commissioner#contract-operations", toolbar: "contracts-table-filters-toolbar", chip: "contracts-table-filters-chip-tagged" },
    ] as const;

    for (const pageConfig of pages) {
      await page.goto(pageConfig.path);
      await expect(page.getByTestId(pageConfig.toolbar)).toBeVisible();
      await expect(page.getByTestId(pageConfig.chip)).toBeVisible();
    }
  });
});
