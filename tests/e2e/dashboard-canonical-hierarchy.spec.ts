import { expect, test } from "@playwright/test";
import { apiContext, getPrimaryLeagueId, OWNER_EMAIL } from "./helpers/api";

test.describe("Dashboard Canonical Hierarchy", () => {
  test("owner dashboard keeps priority workflows above secondary context and uses canonical CTA copy", async ({
    page,
    baseURL,
  }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(ownerApi);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("dashboard-page-eyebrow")).toHaveText("Dashboard");
    await expect(page.getByTestId("dashboard-active-league-name")).toBeVisible();

    const priorityZone = page.getByTestId("dashboard-priority-zone");
    const healthRow = page.getByTestId("dashboard-health-summary-row");
    const secondaryZone = page.getByTestId("dashboard-secondary-zone");

    await expect(priorityZone).toBeVisible();
    await expect(healthRow).toBeVisible();
    await expect(secondaryZone).toBeVisible();
    await expect(page.getByTestId("dashboard-action-center-label")).toHaveText("Action Center");
    await expect(page.getByRole("heading", { name: "What needs attention now" })).toBeVisible();
    await expect(page.getByTestId("dashboard-whats-changed")).toBeVisible();
    await expect(page.getByTestId("deadline-summary-card")).toBeVisible();
    await expect(priorityZone.getByRole("link", { name: "Open My Roster / Cap" })).toBeVisible();
    await expect(priorityZone.getByRole("link", { name: "Open Trades" })).toBeVisible();
    await expect(page.getByTestId("owner-action-link-rules-deadlines")).toBeVisible();
    await expect(secondaryZone.getByRole("link", { name: "Open Picks & Draft" })).toBeVisible();
    await expect(secondaryZone.getByRole("link", { name: "Open League Activity" })).toBeVisible();

    const [priorityBox, healthBox, secondaryBox] = await Promise.all([
      priorityZone.boundingBox(),
      healthRow.boundingBox(),
      secondaryZone.boundingBox(),
    ]);

    expect(priorityBox).not.toBeNull();
    expect(healthBox).not.toBeNull();
    expect(secondaryBox).not.toBeNull();
    expect((priorityBox?.y ?? 0)).toBeLessThan(secondaryBox?.y ?? 0);
    expect((priorityBox?.y ?? 0)).toBeLessThan(healthBox?.y ?? 0);
    expect((healthBox?.y ?? 0)).toBeLessThan(secondaryBox?.y ?? 0);

    const alertStrip = page.getByTestId("league-landing-alert-strip");
    if ((await alertStrip.count()) > 0) {
      const [alertBox, priorityBox, healthBox] = await Promise.all([
        alertStrip.boundingBox(),
        priorityZone.boundingBox(),
        healthRow.boundingBox(),
      ]);

      expect(alertBox).not.toBeNull();
      expect(priorityBox).not.toBeNull();
      expect(healthBox).not.toBeNull();
      expect((alertBox?.y ?? 0)).toBeGreaterThan(priorityBox?.y ?? 0);
      expect((alertBox?.y ?? 0)).toBeLessThan(healthBox?.y ?? 0);
    }

    await ownerApi.dispose();
  });
});
