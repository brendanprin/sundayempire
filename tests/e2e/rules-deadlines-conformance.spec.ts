import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

test.describe("Rules & Deadlines conformance", () => {
  test("owner sees manager-first rules hierarchy without commissioner tools", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/rules");

    // Verify Sprint 18 language cleanup: "League Guide" eyebrow, not "Operational Guide"
    await expect(page.getByTestId("rules-eyebrow")).toHaveText("League Guide");
    await expect(page.getByRole("heading", { name: "Rules & Deadlines" })).toBeVisible();
    
    // Prevent regression to pilot/operator language
    const pageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(pageContent?.toLowerCase()).not.toMatch(/operational guide|workspace|decision support|pilot|prototype|beta/i);
    
    await expect(page.getByTestId("rules-phase-summary")).toBeVisible();
    await expect(page.getByTestId("rules-upcoming-deadlines")).toBeVisible();
    await expect(page.getByTestId("rules-plain-language-summary")).toBeVisible();
    await expect(page.getByTestId("rules-manager-guidance")).toBeVisible();
    await expect(page.getByTestId("rules-commissioner-tools")).toHaveCount(0);
  });

  test("commissioner keeps rule editing controls subordinate to manager guidance", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/rules");

    // Verify canonical language standards for commissioners too
    await expect(page.getByTestId("rules-eyebrow")).toHaveText("League Guide");
    const pageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(pageContent?.toLowerCase()).not.toMatch(/operational guide|workspace|pilot|prototype/i);

    const phaseSummary = page.getByTestId("rules-phase-summary");
    const commissionerTools = page.getByTestId("rules-commissioner-tools");

    await expect(phaseSummary).toBeVisible();
    await expect(commissionerTools).toBeVisible();

    const [phaseBox, toolsBox] = await Promise.all([
      phaseSummary.boundingBox(),
      commissionerTools.boundingBox(),
    ]);

    expect(phaseBox).not.toBeNull();
    expect(toolsBox).not.toBeNull();
    expect((phaseBox?.y ?? 0)).toBeLessThan(toolsBox?.y ?? 0);
  });
});
