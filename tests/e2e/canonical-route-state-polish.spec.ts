import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, getPrimaryLeagueId, OWNER_EMAIL } from "./helpers/api";

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

test.describe("Canonical route state polish", () => {
  test("dashboard keeps command-center framing when the dashboard read fails", async ({
    page,
    baseURL,
  }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(ownerApi);

    await page.route("**/api/league/dashboard", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "Synthetic dashboard failure for conformance coverage.",
          },
        }),
      });
    });

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(
      page.getByText("Dashboard data could not load. Existing league records are unchanged."),
    ).toBeVisible();

    await ownerApi.dispose();
  });

  test("team route keeps canonical heading and loading hierarchy while detail data is pending", async ({
    page,
    baseURL,
  }) => {
    const { leagueId, teamId } = await getOwnerWorkspaceIds(baseURL as string);
    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);

    await page.route(`**/api/teams/${teamId}/detail`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/teams/${teamId}`);

    await expect(page.getByTestId("team-route-state")).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Roster / Cap" })).toBeVisible();
    await expect(
      page.getByText("Loading current roster posture, contracts, compliance, and decision support."),
    ).toBeVisible();
    await expect(page.getByTestId("team-cap-detail")).toBeVisible();
  });

  test("player route explains failed reads without dropping canonical page context", async ({
    page,
    baseURL,
  }) => {
    const { leagueId, playerId } = await getOwnerWorkspaceIds(baseURL as string);
    await activateLeagueContext(baseURL as string, OWNER_EMAIL, leagueId);

    await page.route(`**/api/players/${playerId}/contract-detail`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "Synthetic player detail failure for conformance coverage.",
          },
        }),
      });
    });

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/players/${playerId}`);

    await expect(page.getByTestId("player-route-state")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Player / Contract Detail" })).toBeVisible();
    await expect(page.getByText("Player / Contract Detail could not load.")).toBeVisible();
    await expect(page.getByText("Existing player and contract records are safe.")).toBeVisible();
  });

  test("sync queue empty state gives a next-step explanation instead of a dead end", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissioner);
    await activateLeagueContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    await page.route("**/api/sync/issues*", async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as {
        summary: {
          openCount: number;
          highImpactCount: number;
          escalatedCount: number;
        };
        issues: unknown[];
        recentJobs: unknown[];
      };

      payload.summary.openCount = 0;
      payload.summary.highImpactCount = 0;
      payload.summary.escalatedCount = 0;
      payload.issues = [];
      payload.recentJobs = [];

      await route.fulfill({
        response,
        json: payload,
      });
    });

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}/sync`);

    await expect(page.getByRole("heading", { name: "Sync Queue" })).toBeVisible();
    await expect(
      page.getByText(
        "No sync mismatches match the current filters. Clear one or more filters, or run a new host sync when you are ready for another snapshot.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "No sync jobs are recorded yet. Run a host sync after you have reviewed the current queue.",
      ),
    ).toBeVisible();

    await commissioner.dispose();
  });

  test("activity feed empty state stays compact and actionable", async ({
    page,
    baseURL,
  }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(ownerApi);

    await page.route("**/api/activity*", async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as {
        summary: {
          total: number;
          byFamily: Record<string, number>;
          byCategory: Record<string, number>;
          byType: Record<string, number>;
        };
        feed: unknown[];
      };

      payload.summary.total = 0;
      payload.summary.byFamily = {};
      payload.summary.byCategory = {};
      payload.summary.byType = {};
      payload.feed = [];

      await route.fulfill({
        response,
        json: payload,
      });
    });

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto("/activity");

    await expect(page.getByRole("heading", { name: "League Activity" })).toBeVisible();
    await expect(page.getByTestId("activity-empty-state")).toBeVisible();
    await expect(
      page.getByText(
        "No league-visible events matched the current filters. Clear a filter or refresh after the next workflow update.",
      ),
    ).toBeVisible();

    await ownerApi.dispose();
  });
});
