import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  READ_ONLY_EMAIL,
} from "./helpers/api";

test.describe("Role-Aware Landing Routes", () => {
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
  });
});
