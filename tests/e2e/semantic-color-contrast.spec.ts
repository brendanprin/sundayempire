import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Semantic Color Consistency", () => {
  test("status pills expose consistent semantic tones with distinct visual colors", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/players");

    const playersStatusPills = page.getByTestId("players-standard-table").getByTestId("table-status-pill");
    await expect(playersStatusPills.first()).toBeVisible();
    await expect(playersStatusPills.first()).toHaveClass(/status-pill/);

    const toneStyles = await playersStatusPills.evaluateAll((elements) => {
      const byTone: Record<string, { color: string; backgroundColor: string }> = {};

      for (const element of elements) {
        const tone = element.getAttribute("data-tone");
        if (!tone || byTone[tone]) {
          continue;
        }

        const style = window.getComputedStyle(element);
        byTone[tone] = {
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      }

      return byTone;
    });

    const tones = Object.keys(toneStyles);
    expect(tones.length).toBeGreaterThanOrEqual(2);

    const uniqueTextColors = new Set(Object.values(toneStyles).map((style) => style.color));
    expect(uniqueTextColors.size).toBeGreaterThanOrEqual(2);

    await page.goto("/teams");
    const teamsPill = page.getByTestId("teams-standard-table").getByTestId("table-status-pill").first();
    await expect(teamsPill).toBeVisible();
    await expect(teamsPill).toHaveClass(/status-pill/);
    await expect(teamsPill).toHaveAttribute("data-tone", /success|warning|danger|info|neutral/);

    await page.goto("/draft#pick-ownership-operations");
    const picksPill = page.getByTestId("picks-standard-table").getByTestId("table-status-pill").first();
    await expect(picksPill).toBeVisible();
    await expect(picksPill).toHaveClass(/status-pill/);
    await expect(picksPill).toHaveAttribute("data-tone", /success|warning|danger|info|neutral/);
  });
});
