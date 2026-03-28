import { expect, test, type Page } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

const DISPLAY_STORAGE_KEY = "dynasty:table-display:teams:v1:COMMISSIONER";

async function readHeaderOrder(page: Page) {
  const headers = await page
    .getByTestId("teams-standard-table")
    .locator("thead th")
    .allTextContents();
  return headers.map((value) => value.replace(/[↑↓]/g, "").replace(/\s+/g, " ").trim());
}

test.describe("Table Display Controls", () => {
  test("teams table supports compact density and persisted column configuration", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/teams");
    await page.evaluate((storageKey) => {
      window.localStorage.removeItem(storageKey);
    }, DISPLAY_STORAGE_KEY);
    await page.reload();

    await expect(page.getByTestId("teams-table-display-toolbar")).toBeVisible();
    await expect(page.getByTestId("teams-table")).toHaveAttribute("data-density", "comfortable");

    const firstCell = page.getByTestId("teams-table-row").first().locator("td").first();
    await expect(firstCell).toHaveClass(/py-2/);

    await page.getByTestId("teams-table-display-density-toggle").click();
    await expect(page.getByTestId("teams-table")).toHaveAttribute("data-density", "compact");
    await expect(firstCell).toHaveClass(/py-1\.5/);

    await page.getByTestId("teams-table-display-column-toggle-owner").click();
    await expect(page.getByTestId("teams-standard-table").getByRole("columnheader", { name: "Owner" })).toHaveCount(0);

    await page.getByTestId("teams-table-display-column-up-capSpace").click();

    const reorderedHeaders = await readHeaderOrder(page);
    expect(reorderedHeaders.indexOf("Cap Space")).toBeGreaterThan(-1);
    expect(reorderedHeaders.indexOf("Cap Hit")).toBeGreaterThan(-1);
    expect(reorderedHeaders.indexOf("Cap Space")).toBeLessThan(reorderedHeaders.indexOf("Cap Hit"));

    await page.reload();

    await expect(page.getByTestId("teams-table")).toHaveAttribute("data-density", "compact");
    await expect(page.getByTestId("teams-standard-table").getByRole("columnheader", { name: "Owner" })).toHaveCount(0);

    const persistedHeaders = await readHeaderOrder(page);
    expect(persistedHeaders.indexOf("Cap Space")).toBeLessThan(persistedHeaders.indexOf("Cap Hit"));

    await page.evaluate((storageKey) => {
      window.localStorage.removeItem(storageKey);
    }, DISPLAY_STORAGE_KEY);
  });
});
