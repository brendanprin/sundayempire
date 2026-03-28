import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  createPickForPickTradeWithRetry,
  getTeams,
} from "./helpers/api";

async function seedProposedTrade(
  commissioner: Awaited<ReturnType<typeof apiContext>>,
  ownerTeamId: string,
) {
  const teams = await getTeams(commissioner);
  const counterpart = teams.find((team) => team.id !== ownerTeamId);
  expect(counterpart).toBeTruthy();
  if (!counterpart) {
    throw new Error("Expected counterpart for seeded proposed trade.");
  }

  const seededTrade = await createPickForPickTradeWithRetry(commissioner, {
    teamAId: ownerTeamId,
    teamBId: counterpart.id,
    notesPrefix: "wave-c-seed",
  });
  expect(seededTrade.response.ok()).toBeTruthy();
  expect(seededTrade.payload.trade.status).toBe("PROPOSED");

  return {
    tradeId: seededTrade.payload.trade.id as string,
    counterpartTeamId: counterpart.id,
  };
}

test.describe("Wave C Feature Set", () => {
  test("ONB-1: orphan takeover assistant shows prioritized checklist with routing links", async ({
    page,
    baseURL,
  }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${ownerTeamId}`);

    await expect(page.getByTestId("enable-orphan-mode")).toBeVisible();
    await page.getByTestId("enable-orphan-mode").click();

    const assistant = page.getByTestId("orphan-takeover-assistant");
    await expect(assistant).toBeVisible();
    await expect(assistant).toContainText("First 30 Days Takeover Assistant");
    await expect(assistant.getByTestId("orphan-checklist-link").first()).toHaveAttribute("href", /compliance|trades|team/);

    const progressBefore = await assistant.textContent();
    await assistant.getByTestId("orphan-checklist-toggle").first().check();
    const progressAfter = await assistant.textContent();
    expect(progressBefore).not.toEqual(progressAfter);

    await owner.dispose();
  });

  test("COM-1: commissioner publishes policy-linked ruling with due-date context and attribution", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    await seedProposedTrade(commissioner, ownerTeams[0].id);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const rulingsSection = page.getByTestId("commissioner-rulings-sla");
    await expect(rulingsSection).toBeVisible();
    await rulingsSection.locator('input[type="radio"]').first().check();
    await page.getByLabel("Rule Citation").fill("RULE-COM-001");
    await page.getByLabel("Ruling Notes").fill("Resolved under policy reference and SLA risk context.");
    await page.getByTestId("commissioner-publish-ruling").click();

    const history = page.getByTestId("commissioner-rulings-history");
    await expect(history).toContainText("Rule: RULE-COM-001");
    await expect(history).toContainText("Published");
    await expect(history).toContainText("commissioner@local.league");

    await owner.dispose();
    await commissioner.dispose();
  });
});
