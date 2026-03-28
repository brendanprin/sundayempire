import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createPickForPickTradeWithRetry,
  getPrimaryLeagueId,
  getRoster,
  getTeams,
} from "./helpers/api";

test.describe("Notification Signal Mode", () => {
  test("high-signal mode keeps critical alerts and batches low-priority digest", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissioner);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);

    const teamA = teams.at(-1);
    const teamB = teams.at(-2);
    if (!teamA || !teamB) {
      throw new Error("Expected at least two teams for notification signal mode setup.");
    }

    const proposal = await createPickForPickTradeWithRetry(commissioner, {
      teamAId: teamA.id,
      teamBId: teamB.id,
      notesPrefix: "signal-mode-trade",
    });
    expect(proposal.response.ok()).toBeTruthy();

    const teamARoster = await getRoster(commissioner, teamA.id);
    const benchSlots = teamARoster.rosterSlots.filter(
      (slot: { id: string; slotType: string }) => slot.slotType === "BENCH",
    );
    if (benchSlots.length >= 2) {
      const swapResponse = await commissioner.patch(`/api/teams/${teamA.id}/roster`, {
        data: {
          action: "swap",
          sourceRosterSlotId: benchSlots[0].id,
          targetRosterSlotId: benchSlots[1].id,
        },
      });
      expect(swapResponse.ok()).toBeTruthy();
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("notification-center")).toBeVisible();
    await expect(
      page.locator('[data-testid="notification-item"][data-event-type="trade.proposal.created"]').first(),
    ).toBeVisible();

    await page.getByTestId("notification-signal-mode").selectOption("high");

    await expect(
      page.locator('[data-testid="notification-item"][data-event-type="trade.proposal.created"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="notification-item"][data-event-type="roster.swap.completed"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="notification-item"][data-event-type="digest.low-priority"]').first(),
    ).toBeVisible();

    await commissioner.dispose();
  });
});
