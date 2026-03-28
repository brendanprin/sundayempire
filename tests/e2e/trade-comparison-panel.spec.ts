import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, getRoster, getTeams } from "./helpers/api";

function hasSelectableAssets(roster: {
  picks: { id: string; isUsed: boolean }[];
  contracts: { id: string }[];
}) {
  return roster.picks.some((pick) => !pick.isUsed) || roster.contracts.length > 0;
}

test.describe("Trade Comparison Panel", () => {
  test("analyzer shows before/after values and net deltas for both teams", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);

    let teamA: { id: string; name: string } | null = null;
    let teamB: { id: string; name: string } | null = null;

    for (let index = 0; index < teams.length - 1; index += 1) {
      const candidateA = teams[index];
      const candidateB = teams[index + 1];
      const [rosterA, rosterB] = await Promise.all([
        getRoster(commissioner, candidateA.id),
        getRoster(commissioner, candidateB.id),
      ]);

      if (hasSelectableAssets(rosterA) && hasSelectableAssets(rosterB)) {
        teamA = candidateA;
        teamB = candidateB;
        break;
      }
    }

    expect(teamA).toBeTruthy();
    expect(teamB).toBeTruthy();
    if (!teamA || !teamB) {
      throw new Error("Expected two teams with selectable assets for trade comparison panel.");
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/trades");

    await page.getByLabel("Team A").selectOption(teamA.id);
    await page.getByLabel("Team B").selectOption(teamB.id);

    const teamASelector = page.getByTestId("trade-assets-team-a");
    const teamBSelector = page.getByTestId("trade-assets-team-b");

    await expect(teamASelector).toBeVisible();
    await expect(teamBSelector).toBeVisible();

    const teamACheckbox = teamASelector.locator('input[type="checkbox"]').first();
    const teamBCheckbox = teamBSelector.locator('input[type="checkbox"]').first();
    await expect(teamACheckbox).toBeVisible();
    await expect(teamBCheckbox).toBeVisible();

    await teamACheckbox.check();
    await teamBCheckbox.check();

    await page.getByRole("button", { name: "Analyze Trade" }).click();

    const comparisonPanel = page.getByTestId("trade-comparison-panel");
    await expect(comparisonPanel).toBeVisible();

    const teamACard = page.getByTestId("trade-comparison-team-a");
    const teamBCard = page.getByTestId("trade-comparison-team-b");
    await expect(teamACard).toBeVisible();
    await expect(teamBCard).toBeVisible();

    await expect(teamACard.getByText("Roster Before / After:")).toBeVisible();
    await expect(teamACard.getByText("Net Roster Delta:")).toBeVisible();
    await expect(teamACard.getByText("Cap Before / After:")).toBeVisible();
    await expect(teamACard.getByText("Net Cap Delta:")).toBeVisible();
    await expect(teamACard.getByText("Net Asset Delta:")).toBeVisible();

    await expect(teamBCard.getByText("Roster Before / After:")).toBeVisible();
    await expect(teamBCard.getByText("Net Roster Delta:")).toBeVisible();
    await expect(teamBCard.getByText("Cap Before / After:")).toBeVisible();
    await expect(teamBCard.getByText("Net Cap Delta:")).toBeVisible();
    await expect(teamBCard.getByText("Net Asset Delta:")).toBeVisible();

    await commissioner.dispose();
  });
});
