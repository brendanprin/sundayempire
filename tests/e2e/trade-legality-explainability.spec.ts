import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, getRoster, getTeams } from "./helpers/api";

test.describe("Trade Legality Explainability", () => {
  test("analyzer groups findings by severity and shows plain-language next steps", async ({
    page,
    baseURL,
  }) => {
    const api = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(api);
    expect(teams.length).toBeGreaterThan(1);

    const pairs = await Promise.all(
      teams.slice(0, Math.min(6, teams.length)).map(async (team) => ({
        team,
        roster: await getRoster(api, team.id),
      })),
    );

    const teamAEntry = pairs.find((entry) =>
      entry.roster.picks.some((pick: { isUsed: boolean }) => !pick.isUsed),
    );
    expect(teamAEntry).toBeTruthy();
    if (!teamAEntry) {
      throw new Error("Expected at least one team with available picks for legality explainability test.");
    }

    const teamBEntry = pairs.find((entry) => entry.team.id !== teamAEntry.team.id);
    expect(teamBEntry).toBeTruthy();
    if (!teamBEntry) {
      throw new Error("Expected second team for legality explainability test.");
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/trades");

    await page.getByTestId("trade-team-a-select").selectOption(teamAEntry.team.id);
    await page.getByTestId("trade-team-b-select").selectOption(teamBEntry.team.id);

    await page.getByRole("button", { name: "Analyze Trade" }).click();

    await expect(page.getByRole("heading", { name: "Analyzer Output" })).toBeVisible();
    await expect(page.getByText("Trade package is not legal.")).toBeVisible();
    await expect(page.getByTestId("trade-findings-grouped")).toBeVisible();
    await expect(page.getByTestId("trade-findings-summary")).toContainText("errors");

    const errorsGroup = page.getByTestId("trade-findings-errors");
    await expect(errorsGroup).toContainText("ASSET_PACKAGE_REQUIRED");

    const targetFinding = errorsGroup.locator('[data-testid="trade-finding-item"]', {
      hasText: "ASSET_PACKAGE_REQUIRED",
    });
    await expect(targetFinding).toBeVisible();
    await expect(targetFinding).toContainText("Plain language:");
    await expect(targetFinding.getByTestId("trade-finding-next-step")).toContainText(
      "Suggested next step:",
    );

    await expect(page.getByTestId("trade-findings-warnings")).toContainText("No warnings.");

    await api.dispose();
  });
});
