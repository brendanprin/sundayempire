import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getPrimaryLeagueId,
  OWNER_EMAIL,
} from "./helpers/api";

const TABLET_VIEWPORT = { width: 1024, height: 1366 };

async function expectNoPageHorizontalClipping(page: Page) {
  const dimensions = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
    };
  });

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 2);
}

async function expectReachableInViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();

  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();

  if (!viewport || !box) {
    return;
  }

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2);
}

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

async function getOwnerWorkspaceIds(baseURL: string) {
  const ownerApi = await apiContext(baseURL, OWNER_EMAIL);
  const leagueId = await getPrimaryLeagueId(ownerApi);

  const authResponse = await ownerApi.get("/api/auth/me");
  expect(authResponse.ok()).toBeTruthy();
  const authPayload = (await authResponse.json()) as {
    actor: {
      teamId: string | null;
    };
  };

  expect(authPayload.actor.teamId).toBeTruthy();
  if (!authPayload.actor.teamId) {
    throw new Error("Owner actor did not include a teamId.");
  }

  const detailResponse = await ownerApi.get(`/api/teams/${authPayload.actor.teamId}/detail`);
  expect(detailResponse.ok()).toBeTruthy();
  const detailPayload = (await detailResponse.json()) as {
    detail: {
      contracts: Array<{
        player: {
          id: string;
        };
      }>;
    };
  };

  expect(detailPayload.detail.contracts.length).toBeGreaterThan(0);

  await ownerApi.dispose();

  return {
    leagueId,
    teamId: authPayload.actor.teamId,
    playerId: detailPayload.detail.contracts[0].player.id,
  };
}

test.describe("Tablet Workflow Usability", () => {
  test.use({ viewport: TABLET_VIEWPORT });

  test("owner canonical MVP routes remain reachable and unclipped on tablet", async ({
    page,
    baseURL,
  }) => {
    const { leagueId, teamId, playerId } = await getOwnerWorkspaceIds(baseURL as string);
    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto(`/league/${leagueId}`);
    await expect(page.getByTestId("league-landing-dashboard")).toBeVisible();
    await expectReachableInViewport(page, page.getByTestId("dashboard-priority-zone"));
    await expectNoPageHorizontalClipping(page);

    await page.goto(`/teams/${teamId}`);
    await expect(page.getByTestId("team-cap-detail")).toBeVisible();
    await expectReachableInViewport(page, page.getByTestId("team-workspace-tabs"));
    await expectNoPageHorizontalClipping(page);

    await page.goto(`/players/${playerId}`);
    await expect(page.getByTestId("player-contract-detail")).toBeVisible();
    await expectReachableInViewport(page, page.getByTestId("player-preview-actions"));
    await expectNoPageHorizontalClipping(page);

    await page.goto("/trades/new");
    await expect(page.getByTestId("trade-builder")).toBeVisible();
    await expectReachableInViewport(page, page.getByTestId("trade-builder-summary-rail"));
    await expectNoPageHorizontalClipping(page);
  });

  test("commissioner operations remain reachable and unclipped on tablet", async ({
    page,
    baseURL,
  }) => {
    const commissionerApi = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissionerApi);
    await activateLeagueContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });

    await page.goto("/commissioner");
    await expect(page.getByTestId("commissioner-priority-zone")).toBeVisible();
    await expectReachableInViewport(
      page,
      page.getByTestId("commissioner-priority-zone").getByText("Sync Queue", { exact: true }),
    );
    await expectNoPageHorizontalClipping(page);

    await commissionerApi.dispose();
  });
});
