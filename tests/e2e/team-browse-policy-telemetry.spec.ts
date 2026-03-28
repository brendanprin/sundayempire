import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getTeams,
} from "./helpers/api";

async function fetchEventCount(
  commissioner: Awaited<ReturnType<typeof apiContext>>,
  eventType: string,
) {
  const response = await commissioner.get(
    `/api/commissioner/analytics/events?sinceHours=2&limit=200&eventType=${encodeURIComponent(eventType)}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.totals?.events ?? 0;
}

test.describe("Team Browse Policy and Telemetry", () => {
  test("owner browse mode keeps reads open, blocks mutations, and records telemetry", async ({
    page,
    baseURL,
  }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const allTeams = await getTeams(commissioner);
    const otherTeam = allTeams.find((team) => team.id !== ownerTeamId);
    expect(otherTeam).toBeTruthy();
    if (!otherTeam) {
      throw new Error("Expected at least one non-owner team.");
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${otherTeam.id}`);

    await expect(page.getByTestId("team-capability-boundaries")).toBeVisible();
    await expect(page.getByTestId("team-capability-manage")).toContainText("disabled");
    await expect(page.getByTestId("team-browse-mode-banner")).toBeVisible();

    await expect.poll(() => fetchEventCount(commissioner, "ui.team.browse.viewed"), { timeout: 15_000 }).toBeGreaterThan(0);

    const blockedMutation = await owner.patch(`/api/teams/${otherTeam.id}/roster`, {
      data: {},
    });
    const blockedPayload = await blockedMutation.json();
    expect(blockedMutation.status()).toBe(403);
    expect(blockedPayload.error?.code).toBe("FORBIDDEN");

    await expect.poll(() => fetchEventCount(commissioner, "ui.team.blocked_mutation"), { timeout: 15_000 }).toBeGreaterThan(0);

    await page.getByTestId("team-browse-go-my-team").click();
    await expect(page).toHaveURL(new RegExp(`/teams/${ownerTeamId}$`));

    await expect.poll(() => fetchEventCount(commissioner, "ui.team.followup.navigated"), { timeout: 15_000 }).toBeGreaterThan(0);

    await owner.dispose();
    await commissioner.dispose();
  });
});
