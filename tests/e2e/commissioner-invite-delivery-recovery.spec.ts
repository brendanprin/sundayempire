import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import { COMMISSIONER_EMAIL, apiContext } from "./helpers/api";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createLeague(baseURL: string, now = Date.now()) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL);
  const response = await commissioner.post("/api/leagues", {
    data: {
      name: `Invite Delivery Recovery League ${now}`,
      description: "Commissioner invite delivery recovery e2e",
      seasonYear: 2026,
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  await commissioner.dispose();
  return payload.league.id as string;
}

async function openInviteManager(page: Page) {
  await page.goto("/commissioner");
  await expect(page.getByTestId("commissioner-page")).toBeVisible();
  const advancedOperationsToggle = page.getByTestId("commissioner-advanced-operations-toggle");
  await advancedOperationsToggle.scrollIntoViewIfNeeded();
  if ((await advancedOperationsToggle.getAttribute("aria-expanded")) !== "true") {
    await advancedOperationsToggle.click();
  }
  await expect(page.getByTestId("workspace-invite-management")).toBeVisible();
}

async function openInviteManagerAsCommissioner(page: Page, leagueId: string) {
  await page.context().clearCookies();
  await page.setExtraHTTPHeaders({
    "x-dynasty-user-email": COMMISSIONER_EMAIL,
    "x-dynasty-league-id": leagueId,
  });
  await openInviteManager(page);
}

function inviteRow(page: Page, email: string) {
  return page.getByTestId("workspace-invite-row").filter({ hasText: email }).first();
}

test.describe("Commissioner Invite Delivery Recovery", () => {
  test("commissioner sees safe recovery guidance when outbound invite delivery is unavailable", async ({
    page,
    baseURL,
  }) => {
    const now = Date.now();
    const leagueId = await createLeague(baseURL as string, now);
    const invitedEmail = `invite-recovery-${now}@example.test`;

    await openInviteManagerAsCommissioner(page, leagueId);

    await page.getByTestId("workspace-invite-owner-name").fill("Recovery Invite Owner");
    await page.getByTestId("workspace-invite-owner-email").fill(invitedEmail);
    await page.getByTestId("workspace-invite-team-name").fill(`Recovery Team ${now}`);
    await page.getByTestId("workspace-invite-team-abbr").fill("RCV");
    await page.getByTestId("workspace-invite-division").fill("North");
    await page.getByTestId("workspace-invite-button").click();

    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "delivery is not configured",
    );
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "invite is still valid",
    );
    await expect(page.getByTestId("workspace-invite-delivery-unavailable-note")).toBeVisible();

    const row = inviteRow(page, invitedEmail);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("workspace-invite-status")).toHaveText("Pending");
    await expect(row.getByTestId("workspace-invite-delivery-badge")).toHaveText(
      "Delivery unavailable",
    );
    await expect(row.getByTestId("workspace-invite-delivery-detail")).toContainText(
      "invite is still valid",
    );

    await row.getByTestId("workspace-invite-resend").click();
    await expect(page.getByTestId("commissioner-message-banner")).toContainText("Reissued invite");
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "Previous active link is no longer valid",
    );
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "delivery is not configured",
    );

    const updatedRow = inviteRow(page, invitedEmail);
    await expect(updatedRow.getByTestId("workspace-invite-status")).toHaveText("Pending");
    await expect(updatedRow.getByTestId("workspace-invite-delivery-badge")).toHaveText(
      "Delivery unavailable",
    );
    await expect(updatedRow.getByTestId("workspace-invite-delivery-detail")).toContainText(
      "invite is still valid",
    );
  });
});
