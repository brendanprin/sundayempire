import { expect, test } from "@playwright/test";
import {
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
} from "./helpers/api";

test.describe("Activity Feed Role Visibility", () => {
  test("league activity stays public and excludes commissioner-only events for both commissioner and owners", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/activity");
    await expect(page.getByTestId("activity-feed")).toBeVisible();
    await expect(
      page.locator('[data-testid="activity-item"][data-event-type="commissioner.compliance.scan"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("activity-visibility-label")).toContainText("League-visible events only");

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/activity");
    await expect(page.getByTestId("activity-feed")).toBeVisible();
    await expect(
      page.locator('[data-testid="activity-item"][data-event-type="commissioner.compliance.scan"]'),
    ).toHaveCount(0);
  });
});
