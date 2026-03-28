import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createTrade,
  getRoster,
  getTeams,
} from "./helpers/api";

function pickTradeAsset(roster: {
  picks: { id: string; isUsed: boolean }[];
  contracts: { player: { id: string } }[];
}) {
  const availablePick = roster.picks.find((pick) => !pick.isUsed);
  if (availablePick) {
    return {
      assetType: "PICK" as const,
      futurePickId: availablePick.id,
    };
  }

  const contract = roster.contracts[0];
  if (contract) {
    return {
      assetType: "PLAYER" as const,
      playerId: contract.player.id,
    };
  }

  throw new Error("Expected at least one tradable asset in roster.");
}

function parseUnreadCount(text: string | null) {
  const match = text?.match(/(\d+)/);
  if (!match) return 0;
  return Number.parseInt(match[1], 10);
}

test.describe("Notification Read State and Batching", () => {
  test("commissioner can mark batched notifications as read while keeping history", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const now = Date.now();
    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Notification Isolation ${now}`,
        description: "E2E notification isolation workspace",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;
    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    for (let slot = 1; slot <= 2; slot += 1) {
      const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
        data: {
          ownerName: `Notification Owner ${slot}`,
          ownerEmail: `notification-owner-${slot}-${now}@example.test`,
          teamName: `Notification Team ${slot}`,
          teamAbbreviation: `N${slot}${slot}`,
          divisionLabel: "Notif",
        },
      });
      expect(inviteResponse.ok()).toBeTruthy();
    }

    const readReset = await scopedCommissioner.post("/api/notifications/read");
    expect(readReset.ok()).toBeTruthy();

    const teams = await getTeams(scopedCommissioner);
    expect(teams.length).toBeGreaterThan(1);

    const teamA = teams.at(-1);
    const teamB = teams.at(-2);
    if (!teamA || !teamB) {
      throw new Error("Expected at least two teams for notification batching setup.");
    }

    const [teamARoster, teamBRoster] = await Promise.all([
      getRoster(scopedCommissioner, teamA.id),
      getRoster(scopedCommissioner, teamB.id),
    ]);
    const teamAAsset = pickTradeAsset(teamARoster);
    const teamBAsset = pickTradeAsset(teamBRoster);

    const tradeOne = await createTrade(scopedCommissioner, {
      teamAId: teamA.id,
      teamBId: teamB.id,
      notes: `e2e-notification-batch-1-${Date.now()}`,
      teamAAssets: [teamAAsset],
      teamBAssets: [teamBAsset],
    });
    expect(tradeOne.response.ok()).toBeTruthy();

    const tradeTwo = await createTrade(scopedCommissioner, {
      teamAId: teamA.id,
      teamBId: teamB.id,
      notes: `e2e-notification-batch-2-${Date.now()}`,
      teamAAssets: [teamAAsset],
      teamBAssets: [teamBAsset],
    });
    expect(tradeTwo.response.ok()).toBeTruthy();

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("notification-center")).toBeVisible();
    const batchedTradeNotification = page
      .locator('[data-testid="notification-item"][data-event-type="trade.proposal.created"]')
      .first();
    await expect(batchedTradeNotification).toBeVisible();

    const batchedCountText = await batchedTradeNotification
      .getByTestId("notification-item-count")
      .textContent();
    const batchedCount = parseUnreadCount(batchedCountText);
    expect(batchedCount).toBeGreaterThanOrEqual(2);

    const unreadCount = page.getByTestId("notification-unread-count");
    const unreadBefore = parseUnreadCount(await unreadCount.textContent());
    expect(unreadBefore).toBeGreaterThan(0);

    await page.getByTestId("notification-mark-all-read").click();
    await expect(unreadCount).toContainText("Unread: 0");
    await expect(batchedTradeNotification).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("notification-unread-count")).toContainText("Unread: 0");
    await expect(
      page.locator('[data-testid="notification-item"][data-event-type="trade.proposal.created"]').first(),
    ).toBeVisible();

    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });
});
