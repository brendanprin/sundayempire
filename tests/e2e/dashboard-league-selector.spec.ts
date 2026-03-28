import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Dashboard League Selector", () => {
  test("commissioner can step into league context from root directory and view league details", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueName = `Dashboard League ${Date.now()}`;

    const createdLeague = await commissioner.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "Dashboard selector verification",
        seasonYear: 2026,
      },
    });
    expect(createdLeague.ok()).toBeTruthy();
    const createdPayload = await createdLeague.json();
    const leagueId = createdPayload.league.id as string;
    expect(leagueId).toBeTruthy();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");

    const targetCard = page
      .getByTestId("league-directory-card")
      .filter({ hasText: leagueName })
      .first();
    await expect(targetCard).toBeVisible();
    await targetCard.click();
    await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    const leagueSelect = page.getByTestId("header-league-switcher-select");
    await expect(leagueSelect).toBeVisible();
    await expect(leagueSelect.locator(`option[value="${leagueId}"]`)).toHaveCount(1);
    await expect(page.getByTestId("header-league-switcher-apply")).toBeVisible();

    await expect(page.getByTestId("dashboard-active-league-name")).toHaveText(leagueName);
    await expect(page.getByTestId("dashboard-health-summary-row")).toBeVisible();
    await expect(page.getByTestId("dashboard-league-standings")).toBeVisible();
    await expect(page.getByTestId("dashboard-league-rules")).toBeVisible();
    await expect(
      page.getByTestId("dashboard-league-rules").getByRole("link", { name: "Open Rules", exact: true }),
    ).toBeVisible();

    await commissioner.dispose();
  });
});
