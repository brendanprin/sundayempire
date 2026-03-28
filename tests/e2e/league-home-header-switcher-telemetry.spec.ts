import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

type AnalyticsPayload = {
  events: Array<{
    id: string;
    eventType: string;
    entityId: string | null;
  }>;
};

async function fetchEventCount(input: {
  baseURL: string;
  leagueId: string;
  eventType: string;
  entityId?: string;
}) {
  const ctx = await apiContext(input.baseURL, COMMISSIONER_EMAIL, input.leagueId);
  const params = new URLSearchParams({
    sinceHours: "4",
    limit: "200",
    eventType: input.eventType,
  });
  if (input.entityId) {
    params.set("entityId", input.entityId);
  }

  const response = await ctx.get(`/api/commissioner/analytics/events?${params.toString()}`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as AnalyticsPayload;
  await ctx.dispose();
  return payload.events.length;
}

test.describe("League Home Header Switcher and Telemetry", () => {
  test("league directory selection and header switching update context and emit telemetry", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const initialLeaguesResponse = await commissioner.get("/api/leagues");
    expect(initialLeaguesResponse.ok()).toBeTruthy();
    const initialLeaguesPayload = await initialLeaguesResponse.json();
    const sourceLeague = (initialLeaguesPayload.leagues as Array<{ id: string; name: string }>)[0];
    expect(sourceLeague).toBeTruthy();
    if (!sourceLeague) {
      throw new Error("Expected at least one commissioner league.");
    }

    const targetLeagueName = `Header Switch ${Date.now()}`;
    const createTargetLeague = await commissioner.post("/api/leagues", {
      data: {
        name: targetLeagueName,
        description: "Header switch telemetry test",
        seasonYear: 2026,
      },
    });
    expect(createTargetLeague.ok()).toBeTruthy();
    const targetPayload = await createTargetLeague.json();
    const targetLeagueId = targetPayload.league.id as string;

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
    });

    await page.goto("/");
    const targetCard = page
      .getByTestId("league-directory-card")
      .filter({ hasText: targetLeagueName })
      .first();
    await expect(targetCard).toBeVisible();
    await targetCard.click();

    await expect(page).toHaveURL(new RegExp(`/league/${targetLeagueId}$`));
    await expect(page.getByTestId("role-context-league-name")).toHaveText(targetLeagueName);

    await page.getByTestId("header-league-switcher-select").selectOption(sourceLeague.id);
    await page.getByTestId("header-league-switcher-apply").click();

    await expect(page).toHaveURL(new RegExp(`/league/${sourceLeague.id}$`));
    await expect(page.getByTestId("role-context-league-name")).toHaveText(sourceLeague.name);

    await expect
      .poll(
        () =>
          fetchEventCount({
            baseURL: baseURL as string,
            leagueId: sourceLeague.id,
            eventType: "ui.league.switched",
            entityId: sourceLeague.id,
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    await expect
      .poll(
        () =>
          fetchEventCount({
            baseURL: baseURL as string,
            leagueId: sourceLeague.id,
            eventType: "ui.league.home.viewed",
            entityId: sourceLeague.id,
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    await commissioner.dispose();
  });
});
