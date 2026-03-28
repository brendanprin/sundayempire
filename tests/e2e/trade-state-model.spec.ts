import { expect, test } from "@playwright/test";
import {
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

async function buildOwnerTradeFixture(baseURL: string, note: string) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL);
  const owner = await apiContext(baseURL, OWNER_EMAIL);

  const ownerTeams = await getTeams(owner);
  expect(ownerTeams.length).toBe(1);
  const ownerTeamId = ownerTeams[0].id;

  const allTeams = await getTeams(commissioner);
  const counterparty = allTeams.find((team) => team.id !== ownerTeamId);
  expect(counterparty).toBeTruthy();
  if (!counterparty) {
    throw new Error("Expected counterparty team for trade state model test.");
  }

  const [ownerRoster, counterpartyRoster] = await Promise.all([
    getRoster(commissioner, ownerTeamId),
    getRoster(commissioner, counterparty.id),
  ]);

  const ownerPick = ownerRoster.picks.filter((pick: { isUsed: boolean }) => !pick.isUsed).at(-1);
  const counterpartyPick = counterpartyRoster.picks
    .filter((pick: { isUsed: boolean }) => !pick.isUsed)
    .at(-1);
  expect(ownerPick).toBeTruthy();
  expect(counterpartyPick).toBeTruthy();
  if (!ownerPick || !counterpartyPick) {
    throw new Error("Expected available picks for trade state model fixture.");
  }

  const proposal = await createTrade(commissioner, {
    teamAId: ownerTeamId,
    teamBId: counterparty.id,
    notes: note,
    teamAAssets: [pickAsset(ownerPick.id)],
    teamBAssets: [pickAsset(counterpartyPick.id)],
  });
  expect(proposal.response.ok()).toBeTruthy();
  expect(proposal.payload.trade.status).toBe("PROPOSED");

  return {
    commissioner,
    owner,
    tradeId: proposal.payload.trade.id as string,
    note,
  };
}

test.describe("Trade State Model UI", () => {
  test("owner sees accept-only action for proposed trades and can accept", async ({
    page,
    baseURL,
  }) => {
    const fixture = await buildOwnerTradeFixture(
      baseURL as string,
      `e5-t1-owner-accept-${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/trades");

    const requiresActionGroup = page.getByTestId("owner-trade-group-requires-action");
    await expect(requiresActionGroup).toContainText(fixture.note);
    const targetTrade = requiresActionGroup
      .locator('[data-testid^="owner-trade-item-"]', { hasText: fixture.note })
      .first();
    await expect(targetTrade).toBeVisible();
    await expect(targetTrade.getByRole("button", { name: "Accept" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Process" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);

    await targetTrade.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Trade accepted and moved to approved state.")).toBeVisible();

    const awaitingGroup = page.getByTestId("owner-trade-group-awaiting-response");
    await expect(awaitingGroup).toContainText(fixture.note);
    await expect(awaitingGroup).toContainText("APPROVED");

    await fixture.owner.dispose();
    await fixture.commissioner.dispose();
  });

  test("commissioner actions shift across proposed -> approved -> rejected states", async ({
    page,
    baseURL,
  }) => {
    const fixture = await buildOwnerTradeFixture(
      baseURL as string,
      `e5-t1-commissioner-actions-${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/trades");

    const row = page.locator("tr", { hasText: fixture.note }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Process" })).toHaveCount(0);

    await row.getByRole("button", { name: "Approve" }).click();
    await expect(row).toContainText("APPROVED");
    await expect(row.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Process" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Reject" })).toBeVisible();

    await row.getByRole("button", { name: "Reject" }).click();
    await expect(row).toContainText("REJECTED");
    await expect(row.getByRole("button", { name: "Process" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Reject" })).toHaveCount(0);

    await fixture.owner.dispose();
    await fixture.commissioner.dispose();
  });
});
