import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getPrimaryLeagueId,
  OWNER_EMAIL,
} from "./helpers/api";

async function activateLeagueContext(baseURL: string, email: string, leagueId: string) {
  const ctx = await apiContext(baseURL, email);
  const response = await ctx.post("/api/league/context", {
    data: {
      leagueId,
    },
  });
  expect(response.ok()).toBeTruthy();
  await ctx.dispose();
}

test.describe("@mvp-shadow canonical MVP routes", () => {
  test("owner canonical dashboard, team detail, activity, and trades routes render", async ({
    page,
    baseURL,
  }) => {
    const ownerCtx = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(ownerCtx);

    const authResponse = await ownerCtx.get("/api/auth/me");
    expect(authResponse.ok()).toBeTruthy();
    const authPayload = (await authResponse.json()) as {
      actor: {
        teamId: string | null;
      };
    };
    expect(authPayload.actor.teamId).toBeTruthy();
    if (!authPayload.actor.teamId) {
      throw new Error("Expected owner actor to resolve to a team.");
    }

    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });

    await page.goto(`/league/${leagueId}`);
    await expect(page.getByTestId("league-landing-dashboard")).toBeVisible();

    await page.goto(`/teams/${authPayload.actor.teamId}`);
    await expect(page.getByTestId("team-cap-detail")).toBeVisible();

    await page.goto("/activity");
    await expect(page.getByTestId("activity-feed")).toBeVisible();

    await page.goto("/trades");
    await expect(page.getByTestId("trades-home")).toBeVisible();

    await ownerCtx.dispose();
  });

  test("commissioner canonical draft, sync, and audit routes render", async ({
    page,
    baseURL,
  }) => {
    const commissionerCtx = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissionerCtx);

    await activateLeagueContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto(`/league/${leagueId}`);
    await expect(page.getByTestId("league-landing-dashboard")).toBeVisible();

    await page.goto("/draft");
    await expect(page.getByTestId("draft-home-view")).toBeVisible();

    await page.goto("/draft/rookie");
    await expect(page.getByText("Rookie Draft Workspace")).toBeVisible();

    await page.goto("/draft/veteran-auction");
    await expect(page.getByText("Veteran Auction Workspace")).toBeVisible();

    await page.goto(`/league/${leagueId}/sync`);
    await expect(page.getByTestId("sync-issues-queue-view")).toBeVisible();

    await page.goto("/commissioner/audit");
    await expect(page.getByRole("heading", { name: "Commissioner Audit" })).toBeVisible();

    await commissionerCtx.dispose();
  });
});
