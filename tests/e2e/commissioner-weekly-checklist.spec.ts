import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

const CHECKLIST_PREFIX = "dynasty:commissioner-weekly-checklist:v1:";

test.describe("Commissioner Weekly Checklist", () => {
  test("weekly checklist presents ordered tasks and tracks completion", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    await page.evaluate((prefix) => {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => window.localStorage.removeItem(key));
    }, CHECKLIST_PREFIX);
    await page.reload();

    const checklist = page.getByTestId("commissioner-weekly-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.getByRole("heading", { name: "Weekly Operations Checklist" })).toBeVisible();
    await expect(page.getByTestId("commissioner-weekly-checklist-progress")).toContainText("0 / 5 complete");

    const titles = await checklist.getByTestId("commissioner-weekly-checklist-item-title").allTextContents();
    expect(titles).toEqual([
      "1. Confirm active phase and weekly transition window",
      "2. Run league compliance scan and review blockers",
      "3. Review proposed trades awaiting commissioner decision",
      "4. Process approved trades to settle player and pick ownership",
      "5. Review commissioner audit activity",
    ]);

    const progress = page.getByTestId("commissioner-weekly-checklist-progress");
    const phaseToggle = checklist.getByTestId("commissioner-weekly-checklist-toggle-phase-review");
    const complianceToggle = checklist.getByTestId("commissioner-weekly-checklist-toggle-compliance-scan");

    await phaseToggle.check();
    await expect(phaseToggle).toBeChecked();
    await expect(progress).toContainText("1 / 5 complete");
    await complianceToggle.check();
    await expect(complianceToggle).toBeChecked();
    await expect(progress).toContainText("2 / 5 complete");
    await expect(
      checklist.getByTestId("commissioner-weekly-checklist-status-phase-review"),
    ).toContainText("Complete");
    await expect(
      checklist.getByTestId("commissioner-weekly-checklist-status-compliance-scan"),
    ).toContainText("Complete");

    await page.reload();
    await expect(
      checklist.getByTestId("commissioner-weekly-checklist-toggle-phase-review"),
    ).toBeChecked();
    await expect(
      checklist.getByTestId("commissioner-weekly-checklist-toggle-compliance-scan"),
    ).toBeChecked();
    await expect(progress).toContainText("2 / 5 complete");
  });
});
