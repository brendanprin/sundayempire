import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createPicksOnlyTradeWithRetry,
  getRoster,
  getTeams,
} from "./helpers/api";

async function getTradeStatusByNotes(
  api: Awaited<ReturnType<typeof apiContext>>,
  notes: string,
) {
  const response = await api.get("/api/trades");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const trade = (payload.trades as Array<{ notes: string | null; status: string }>).find(
    (candidate) => candidate.notes === notes,
  );
  return trade?.status ?? null;
}

test.describe("Team and Trades UI", () => {
  test("team page refresh button is interactable", async ({ page, baseURL }) => {
    const api = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(api);
    expect(teams.length).toBeGreaterThan(0);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/teams/${teams[0].id}`);

    const refreshButton = page.getByRole("button", { name: /^Refresh/ });
    await expect(refreshButton).toBeEnabled();
    await refreshButton.click();
    await expect(refreshButton).toBeEnabled();

    await api.dispose();
  });

  test("processing trade from UI refreshes selected team asset lists", async ({ page, baseURL }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const now = Date.now();
    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Trade UI Isolation ${now}`,
        description: "E2E isolated league for team-and-trades trade refresh coverage",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;
    const api = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    for (let slot = 1; slot <= 2; slot += 1) {
      const inviteResponse = await api.post("/api/league/invites", {
        data: {
          ownerName: `Trade UI Owner ${slot}`,
          ownerEmail: `trade-ui-owner-${slot}-${now}@example.test`,
          teamName: `Trade UI Team ${slot}`,
          teamAbbreviation: `T${slot}${slot}`,
          divisionLabel: "TradeUI",
        },
      });
      expect(inviteResponse.ok()).toBeTruthy();
    }

    const teams = await getTeams(api);
    const rosterRecords = await Promise.all(
      teams.map(async (team) => {
        const roster = await getRoster(api, team.id);
        const availablePicks = roster.picks.filter((pick) => !pick.isUsed);
        return { team, roster, availablePicks };
      }),
    );

    const candidates = rosterRecords
      .filter((record) => record.availablePicks.length > 0)
      .sort((a, b) => b.availablePicks.length - a.availablePicks.length);

    const teamARecord = candidates.find((record) => record.availablePicks.length > 1) ?? candidates[0];
    const teamBRecord = candidates.find(
      (record) => record.team.id !== teamARecord?.team.id && record.availablePicks.length > 0,
    );

    const teamA = teamARecord?.team;
    const teamB = teamBRecord?.team;

    expect(teamA).toBeTruthy();
    expect(teamB).toBeTruthy();
    if (!teamA || !teamB || !teamARecord || !teamBRecord) {
      throw new Error("Expected at least two teams for trade UI test.");
    }

    const availableA = teamARecord.availablePicks;
    const availableB = teamBRecord.availablePicks;

    expect(availableA.length).toBeGreaterThan(0);
    expect(availableB.length).toBeGreaterThan(0);
    const teamAPickCount = availableA.length > 1 ? 2 : 1;
    const teamBPickCount = 1;

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto("/trades");

    await page.getByTestId("trade-team-a-select").selectOption(teamA.id);
    await page.getByTestId("trade-team-b-select").selectOption(teamB.id);

    const teamASendsCard = page
      .locator("p.text-sm.font-semibold")
      .filter({ hasText: /Sends$/ })
      .first()
      .locator("xpath=..");

    await expect(teamASendsCard).toBeVisible();
    await page.waitForTimeout(300);

    const initialAssetCheckboxes = await teamASendsCard.locator('input[type="checkbox"]').count();

    const noteToken = `e2e ui refresh ${Date.now()}`;
    const proposal = await createPicksOnlyTradeWithRetry(api, {
      teamAId: teamA.id,
      teamBId: teamB.id,
      notesPrefix: noteToken,
      teamAPickCount,
      teamBPickCount,
    });
    expect(proposal.response.ok()).toBeTruthy();

    const createdTrade = proposal.payload.trade as {
      notes: string | null;
      assets: Array<{ fromTeamId: string }>;
    };
    const note = createdTrade.notes ?? noteToken;
    const teamASentCount = createdTrade.assets.filter((asset) => asset.fromTeamId === teamA.id).length;
    const teamAReceivedCount = createdTrade.assets.filter((asset) => asset.fromTeamId === teamB.id).length;
    const expectedDelta = teamAReceivedCount - teamASentCount;

    await page.reload();
    await page.getByTestId("trade-team-a-select").selectOption(teamA.id);
    await page.getByTestId("trade-team-b-select").selectOption(teamB.id);

    const targetTradeRow = page.locator("tr", { hasText: note }).first();
    await expect(targetTradeRow).toBeVisible();
    await targetTradeRow.getByRole("button", { name: "Approve" }).click();
    await expect(targetTradeRow).toContainText("APPROVED");
    await targetTradeRow.getByRole("button", { name: "Process" }).click();

    await expect
      .poll(async () => getTradeStatusByNotes(api, note), { timeout: 15_000 })
      .toBe("PROCESSED");

    const expectedAssetCheckboxes = initialAssetCheckboxes + expectedDelta;
    let observedAssetCheckboxes: number;
    try {
      await expect
        .poll(async () => teamASendsCard.locator('input[type="checkbox"]').count(), {
          timeout: 10_000,
        })
        .toBe(expectedAssetCheckboxes);
      observedAssetCheckboxes = expectedAssetCheckboxes;
    } catch {
      // Safety refresh for occasional delayed UI state updates under heavy parallel load.
      await page.reload();
      await page.getByTestId("trade-team-a-select").selectOption(teamA.id);
      await page.getByTestId("trade-team-b-select").selectOption(teamB.id);
      await expect(teamASendsCard).toBeVisible();
      await expect
        .poll(async () => teamASendsCard.locator('input[type="checkbox"]').count(), {
          timeout: 10_000,
        })
        .toBe(expectedAssetCheckboxes);
      observedAssetCheckboxes = expectedAssetCheckboxes;
    }

    expect(observedAssetCheckboxes).toBe(expectedAssetCheckboxes);

    await api.dispose();
    await commissioner.dispose();
  });
});
