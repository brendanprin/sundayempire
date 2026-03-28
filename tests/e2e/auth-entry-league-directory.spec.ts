import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, getCapturedMagicLink } from "./helpers/api";

test.describe("Auth Entry and League Directory", () => {
  test("unauthenticated root access redirects to login with returnTo", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");

    await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
    await expect(page.getByTestId("role-context-role")).toHaveCount(0);
  });

  test("root route renders My Leagues directory and supports one-click league entry", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueName = `League Directory ${Date.now()}`;

    const createdLeague = await commissioner.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "Directory routing test",
        seasonYear: 2026,
      },
    });
    expect(createdLeague.ok()).toBeTruthy();
    const createdPayload = await createdLeague.json();
    const leagueId = createdPayload.league.id as string;

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");

    await expect(page.getByTestId("league-directory-page")).toBeVisible();
    await expect(page.getByTestId("league-directory-open-create-wizard")).toBeVisible();
    const targetCard = page
      .getByTestId("league-directory-card")
      .filter({ hasText: leagueName })
      .first();
    await expect(targetCard).toBeVisible();
    await targetCard.click();

    await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-league-name")).toHaveText(leagueName);

    await commissioner.dispose();
  });

  test("deep-link redirect preserves returnTo after magic-link sign in", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueName = `Return To League ${Date.now()}`;

    const createdLeague = await commissioner.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "Return-to flow test",
        seasonYear: 2026,
      },
    });
    expect(createdLeague.ok()).toBeTruthy();
    const createdPayload = await createdLeague.json();
    const leagueId = createdPayload.league.id as string;

    await page.context().clearCookies();
    await page.goto(`/league/${leagueId}`);

    await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=%2Fleague%2F${leagueId}$`));

    await page.getByTestId("login-email-input").fill(COMMISSIONER_EMAIL);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(
      COMMISSIONER_EMAIL,
    );

    const magicLink = await getCapturedMagicLink(baseURL as string, COMMISSIONER_EMAIL, {
      returnTo: `/league/${leagueId}`,
    });
    await page.goto(magicLink.url);

    await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-league-name")).toHaveText(leagueName);

    await commissioner.dispose();
  });
});
