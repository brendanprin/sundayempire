import { expect, test } from "@playwright/test";
import {
  acceptTrade,
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  createTrade,
  getRoster,
  getTeams,
} from "./helpers/api";

function pickAsset(futurePickId: string) {
  return { assetType: "PICK", futurePickId };
}

test.describe("Owner Trades Inbox and History", () => {
  test("owner inbox groups trades by required action and completed history", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);

    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const allTeams = await getTeams(commissioner);
    const counterparty = allTeams.find((team) => team.id !== ownerTeamId);
    expect(counterparty).toBeTruthy();
    if (!counterparty) {
      throw new Error("Expected at least one counterparty team.");
    }

    const [ownerRoster, counterpartyRoster] = await Promise.all([
      getRoster(commissioner, ownerTeamId),
      getRoster(commissioner, counterparty.id),
    ]);

    const ownerPicks = ownerRoster.picks.filter((pick: { isUsed: boolean }) => !pick.isUsed);
    const counterpartyPicks = counterpartyRoster.picks.filter(
      (pick: { isUsed: boolean }) => !pick.isUsed,
    );
    expect(ownerPicks.length).toBeGreaterThan(0);
    expect(counterpartyPicks.length).toBeGreaterThan(0);
    if (ownerPicks.length === 0 || counterpartyPicks.length === 0) {
      throw new Error("Expected available picks for owner trades inbox setup.");
    }

    const proposedOwnerPickId = ownerPicks[ownerPicks.length - 1].id;
    const proposedCounterpartyPickId = counterpartyPicks[counterpartyPicks.length - 1].id;
    const processedOwnerPickId =
      ownerPicks.length > 1 ? ownerPicks[ownerPicks.length - 2].id : proposedOwnerPickId;
    const processedCounterpartyPickId =
      counterpartyPicks.length > 1
        ? counterpartyPicks[counterpartyPicks.length - 2].id
        : proposedCounterpartyPickId;

    const proposedNote = `owner-inbox-proposed-${Date.now()}`;
    const processedNote = `owner-inbox-completed-${Date.now()}`;

    const proposedTrade = await createTrade(commissioner, {
      teamAId: ownerTeamId,
      teamBId: counterparty.id,
      notes: proposedNote,
      teamAAssets: [pickAsset(proposedOwnerPickId)],
      teamBAssets: [pickAsset(proposedCounterpartyPickId)],
    });
    expect(proposedTrade.response.ok()).toBeTruthy();
    expect(proposedTrade.payload.trade.status).toBe("PROPOSED");

    const completedTrade = await createTrade(commissioner, {
      teamAId: ownerTeamId,
      teamBId: counterparty.id,
      notes: processedNote,
      teamAAssets: [pickAsset(processedOwnerPickId)],
      teamBAssets: [pickAsset(processedCounterpartyPickId)],
    });
    expect(completedTrade.response.ok()).toBeTruthy();
    expect(completedTrade.payload.trade.status).toBe("PROPOSED");

    const approved = await acceptTrade(commissioner, completedTrade.payload.trade.id);
    expect(approved.response.ok()).toBeTruthy();
    expect(approved.payload.trade.status).toBe("APPROVED");

    const rejected = await commissioner.post(`/api/trades/${completedTrade.payload.trade.id}/reject`);
    expect(rejected.ok()).toBeTruthy();
    const rejectedPayload = await rejected.json();
    expect(rejectedPayload.trade.status).toBe("REJECTED");

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/trades");

    await expect(page.getByRole("heading", { name: "Owner Trade Inbox" })).toBeVisible();
    await expect(page.getByTestId("owner-trade-inbox")).toBeVisible();

    const groups = page.locator('[data-testid^="owner-trade-group-"]');
    await expect(groups.nth(0)).toHaveAttribute("data-testid", "owner-trade-group-requires-action");
    await expect(groups.nth(1)).toHaveAttribute("data-testid", "owner-trade-group-awaiting-response");
    await expect(groups.nth(2)).toHaveAttribute("data-testid", "owner-trade-group-completed");

    const requiresActionGroup = page.getByTestId("owner-trade-group-requires-action");
    await expect(requiresActionGroup).toContainText(proposedNote);
    await expect(requiresActionGroup).toContainText("Next action:");
    await expect(requiresActionGroup).toContainText("PROPOSED");

    const completedGroup = page.getByTestId("owner-trade-group-completed");
    await expect(completedGroup).toContainText(processedNote);
    await expect(completedGroup).toContainText("REJECTED");
    await expect(completedGroup).toContainText("Next action:");

    await expect(page.getByRole("button", { name: "Process" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);

    await owner.dispose();
    await commissioner.dispose();
  });
});
