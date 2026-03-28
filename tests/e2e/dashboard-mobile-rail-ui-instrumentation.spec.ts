import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createPickForPickTradeWithRetry,
  getPrimaryLeagueId,
  getTeams,
  OWNER_EMAIL,
} from "./helpers/api";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

type AnalyticsPayload = {
  events: {
    id: string;
    eventType: string;
    entityId: string | null;
    context: unknown;
  }[];
};

function contextSource(context: unknown) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }
  const source = (context as Record<string, unknown>).source;
  return typeof source === "string" ? source : null;
}

async function fetchUiEvents(
  commissioner: Awaited<ReturnType<typeof apiContext>>,
  eventType: string,
  entityId: string,
) {
  const response = await commissioner.get(
    `/api/commissioner/analytics/events?sinceHours=2&limit=250&eventType=${encodeURIComponent(
      eventType,
    )}&entityId=${encodeURIComponent(entityId)}`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AnalyticsPayload;
}

test.describe("Dashboard Mobile Action Rail and UI Instrumentation", () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  test.setTimeout(120_000);

  test("owner mobile rail drives first action and records UI analytics", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const ownerLeagueId = await getPrimaryLeagueId(ownerApi);

    const ownerTeams = await getTeams(ownerApi);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const allTeams = await getTeams(commissioner);
    const counterparty = allTeams.find((team) => team.id !== ownerTeamId);
    expect(counterparty).toBeTruthy();
    if (!counterparty) {
      throw new Error("Counterparty team not found for dashboard mobile rail test.");
    }

    const proposal = await createPickForPickTradeWithRetry(commissioner, {
      teamAId: ownerTeamId,
      teamBId: counterparty.id,
      notesPrefix: "mobile-rail-ui-instrumentation",
    });
    expect(proposal.response.ok()).toBeTruthy();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/league/${ownerLeagueId}`);

    await expect
      .poll(async () => page.getByTestId("dashboard-mobile-action-rail").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await expect(page.getByTestId("dashboard-mobile-action-rail")).toBeVisible();
    const mobileTradeAction = page.getByTestId("dashboard-mobile-action-trade-review");
    await expect(mobileTradeAction).toBeVisible();
    await mobileTradeAction.click();
    await expect(page).toHaveURL(/\/trades$/);

    await expect
      .poll(async () => {
        const firstActionPayload = await fetchUiEvents(
          commissioner,
          "ui.dashboard.first_action",
          "trade-review",
        );
        return firstActionPayload.events.some(
          (event) => contextSource(event.context) === "mobile-rail",
        );
      }, { timeout: 20_000 })
      .toBeTruthy();

    await expect
      .poll(async () => {
        const actionSelectedPayload = await fetchUiEvents(
          commissioner,
          "ui.dashboard.action.selected",
          "trade-review",
        );
        return actionSelectedPayload.events.some(
          (event) => contextSource(event.context) === "mobile-rail",
        );
      }, { timeout: 20_000 })
      .toBeTruthy();

    await ownerApi.dispose();
    await commissioner.dispose();
  });
});
