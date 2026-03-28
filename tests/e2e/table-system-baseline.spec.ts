import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

const DENSE_TABLE_PAGES = [
  { path: "/teams", tableId: "teams-standard-table" },
  { path: "/players", tableId: "players-standard-table" },
  { path: "/draft#pick-ownership-operations", tableId: "picks-standard-table" },
  { path: "/commissioner#contract-operations", tableId: "contracts-standard-table" },
] as const;

test.describe("Standard Table Baseline", () => {
  test("dense pages use shared table wrapper with sticky headers", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    for (const pageConfig of DENSE_TABLE_PAGES) {
      await page.goto(pageConfig.path);

      const table = page.getByTestId(pageConfig.tableId);
      await expect(table).toBeVisible();

      const firstHeaderCell = table.locator("thead th").first();
      await expect(firstHeaderCell).toHaveClass(/sticky/);
      await expect(firstHeaderCell).toHaveClass(/top-0/);
    }
  });

  test("status-driven cells render shared status pill styling", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    const pagesWithGuaranteedStatusPills = [
      { path: "/teams", tableId: "teams-standard-table" },
      { path: "/players", tableId: "players-standard-table" },
      { path: "/draft#pick-ownership-operations", tableId: "picks-standard-table" },
    ] as const;

    for (const pageConfig of pagesWithGuaranteedStatusPills) {
      await page.goto(pageConfig.path);

      const table = page.getByTestId(pageConfig.tableId);
      const statusPill = table.getByTestId("table-status-pill").first();

      await expect(statusPill).toBeVisible();
      await expect(statusPill).toHaveClass(/rounded-full/);
      await expect(statusPill).toHaveClass(/border/);
    }
  });
});
