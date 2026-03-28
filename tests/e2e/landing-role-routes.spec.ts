import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  READ_ONLY_EMAIL,
} from "./helpers/api";

test.describe("Role-Aware Landing Routes", () => {
  test("new-league commissioner sees setup checklist and setup primary action", async ({
    page,
    baseURL,
  }) => {
    const founderEmail = "noleague@local.league";
    const founderApi = await apiContext(baseURL as string, founderEmail);
    const createLeagueResponse = await founderApi.post("/api/leagues", {
      data: {
        name: `Landing Setup Checklist ${Date.now()}`,
        description: "Checklist-first league home coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;
    await founderApi.dispose();

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": founderEmail,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("dashboard-setup-checklist")).toBeVisible();
    await expect(page.getByTestId("dashboard-setup-checklist-progress")).toContainText("0 / 5 complete");
    await expect(page.getByTestId("dashboard-setup-checklist-item-founder-team-status")).toBeVisible();
    await expect(page.getByTestId("commissioner-action-link-setup-primary")).toBeVisible();
  });

  test("commissioner root reflects zero/one/many league entry behavior", async ({
    page,
    baseURL,
  }) => {
    const commissionerApi = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leaguesResponse = await commissionerApi.get("/api/leagues");
    expect(leaguesResponse.ok()).toBeTruthy();
    const leaguesPayload = await leaguesResponse.json();
    const leagueCount = (leaguesPayload.leagues as Array<{ id: string }>).length;
    await commissionerApi.dispose();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");

    if (leagueCount <= 1) {
      await expect(page).toHaveURL(/\/league\/[^/]+$/);
      await expect(page.getByTestId("dashboard-page-eyebrow")).toHaveText("Dashboard");
    } else {
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Choose a League" })).toBeVisible();
    }
  });

  test("owner can reach league home and sees owner action queue", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/");

    await page.waitForLoadState("networkidle");

    if (!/\/league\/[^/]+$/.test(page.url()) && (await page.getByTestId("league-directory-card").count()) > 0) {
      await page.getByTestId("league-directory-card").first().click();
    }

    await expect(page).toHaveURL(/\/league\/[^/]+$/);
    await expect(page.getByTestId("dashboard-page-eyebrow")).toHaveText("Dashboard");
    await expect(page.getByTestId("owner-action-queue")).toBeVisible();
    await expect(page.getByTestId("dashboard-setup-checklist")).toHaveCount(0);
  });

  test("read-only can access league home without owner or commissioner action queues", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": READ_ONLY_EMAIL });
    await page.goto("/");

    await page.waitForLoadState("networkidle");

    if (!/\/league\/[^/]+$/.test(page.url()) && (await page.getByTestId("league-directory-card").count()) > 0) {
      await page.getByTestId("league-directory-card").first().click();
    }

    await expect(page).toHaveURL(/\/league\/[^/]+$/);
    await expect(page.getByTestId("owner-action-queue")).toHaveCount(0);
    await expect(page.getByTestId("commissioner-action-queue")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-setup-checklist")).toHaveCount(0);
  });
});
