import { expect, Page, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

async function expectFocusIndicator(page: Page) {
  const focusState = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) {
      return null;
    }

    const style = window.getComputedStyle(active);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth || "0"),
      boxShadow: style.boxShadow,
    };
  });

  expect(focusState).not.toBeNull();
  if (!focusState) {
    return;
  }

  const hasOutline = focusState.outlineStyle !== "none" && focusState.outlineWidth > 0;
  const hasShadow = focusState.boxShadow !== "none";
  expect(hasOutline || hasShadow).toBeTruthy();
}

async function getOwnerTeamId(baseURL: string) {
  const api = await apiContext(baseURL, OWNER_EMAIL);
  const response = await api.get("/api/auth/me");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    actor: {
      teamId: string | null;
    };
  };
  await api.dispose();

  expect(payload.actor.teamId).toBeTruthy();
  if (!payload.actor.teamId) {
    throw new Error("Owner actor did not include a teamId.");
  }

  return payload.actor.teamId;
}

test.describe("Keyboard and Focus Accessibility", () => {
  test("trades form tab order follows visual workflow with visible focus states", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/trades");

    const teamASelect = page.getByLabel("Team A");
    const teamBSelect = page.getByLabel("Team B");
    const notesInput = page.getByLabel("Notes");
    const analyzeButton = page.getByRole("button", { name: "Analyze Trade" });

    await teamASelect.focus();
    await expect(teamASelect).toBeFocused();
    await expectFocusIndicator(page);

    await page.keyboard.press("Tab");
    await expect(teamBSelect).toBeFocused();
    await expectFocusIndicator(page);

    await page.keyboard.press("Tab");
    await expect(notesInput).toBeFocused();
    await expectFocusIndicator(page);

    await page.keyboard.press("Tab");
    await expect(analyzeButton).toBeFocused();
    await expectFocusIndicator(page);
  });

  test("keyboard users can focus and navigate scrollable table regions", async ({
    page,
    baseURL,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto("/draft/rookie");
    const draftBoardRegion = page.getByRole("region", { name: "Draft board table" });
    const draftPlayersRegion = page.getByRole("region", {
      name: "Available draft players table",
    });
    await expect(draftBoardRegion).toBeVisible();
    await expect(draftPlayersRegion).toBeVisible();
    await draftBoardRegion.focus();
    await expect(draftBoardRegion).toBeFocused();
    await expectFocusIndicator(page);
    await draftPlayersRegion.focus();
    await expect(draftPlayersRegion).toBeFocused();
    await expectFocusIndicator(page);

    await page.goto("/trades");
    const tradesTableRegion = page.getByRole("region", { name: "Trades proposal table" });
    await expect(tradesTableRegion).toBeVisible();
    await tradesTableRegion.focus();
    await expect(tradesTableRegion).toBeFocused();
    await expectFocusIndicator(page);

    const ownerTeamId = await getOwnerTeamId(baseURL as string);
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${ownerTeamId}`);
    const lineupRegion = page.getByRole("region", { name: "Starting lineup table" });
    await expect(lineupRegion).toBeVisible();
    await lineupRegion.focus();
    await expect(lineupRegion).toBeFocused();
    await expectFocusIndicator(page);
  });
});
