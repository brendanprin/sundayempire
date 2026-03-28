import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import {
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  apiContext,
  getCapturedLeagueInvite,
  getCapturedMagicLink,
} from "./helpers/api";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createLeague(baseURL: string, now = Date.now()) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL);
  const response = await commissioner.post("/api/leagues", {
    data: {
      name: `Invite Management League ${now}`,
      description: "Commissioner invite management e2e",
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

test.describe("Commissioner Invite Management", () => {
  test("commissioner can create an invite from the workspace UI and see it as pending", async ({
    page,
    baseURL,
  }) => {
    const now = Date.now();
    const leagueId = await createLeague(baseURL as string, now);
    const invitedEmail = `invite-ui-${now}@example.test`;
    const teamName = `UI Invite Team ${now}`;

    await openInviteManagerAsCommissioner(page, leagueId);

    await page.getByTestId("workspace-invite-owner-name").fill("UI Invite Owner");
    await page.getByTestId("workspace-invite-owner-email").fill(invitedEmail);
    await page.getByTestId("workspace-invite-team-name").fill(teamName);
    await page.getByTestId("workspace-invite-team-abbr").fill("UIM");
    await page.getByTestId("workspace-invite-division").fill("North");
    await page.getByTestId("workspace-invite-button").click();

    await expect(page.getByTestId("commissioner-message-banner")).toContainText("Invited");
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "Test capture is active in this environment",
    );
    await expect(page.getByTestId("workspace-invite-capture-note")).toBeVisible();

    const row = inviteRow(page, invitedEmail);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("workspace-invite-status")).toHaveText("Pending");
    await expect(row.getByTestId("workspace-invite-delivery-badge")).toHaveText(
      "Test capture active",
    );
    await expect(row.getByTestId("workspace-invite-delivery-detail")).toContainText(
      "No real email was sent",
    );
    await expect(row).toContainText(teamName);
    await expect(row.getByTestId("workspace-invite-resend")).toBeVisible();
    await expect(row.getByTestId("workspace-invite-revoke")).toBeVisible();
  });

  test("commissioner can resend expired invites, copy a fresh link, and revoke the current pending invite", async ({
    page,
    baseURL,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Clipboard verification is only exercised in Chromium.");

    const now = Date.now();
    const leagueId = await createLeague(baseURL as string, now);
    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const invitedEmail = `invite-ops-${now}@example.test`;

    const createInviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Ops Invite Owner",
        ownerEmail: invitedEmail,
        teamName: `Ops Invite Team ${now}`,
        teamAbbreviation: "OPS",
        divisionLabel: "North",
      },
    });
    expect(createInviteResponse.ok()).toBeTruthy();

    const initialInvite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    expect(initialInvite.inviteId).toBeTruthy();

    await prisma.leagueInvite.update({
      where: {
        id: initialInvite.inviteId ?? "",
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openInviteManagerAsCommissioner(page, leagueId);

    const expiredRow = inviteRow(page, invitedEmail);
    await expect(expiredRow.getByTestId("workspace-invite-status")).toHaveText("Expired");
    await expect(expiredRow.getByTestId("workspace-invite-resend")).toBeVisible();

    await expiredRow.getByTestId("workspace-invite-resend").click();
    await expect(page.getByTestId("commissioner-message-banner")).toContainText("Reissued invite");
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "Previous active link is no longer valid",
    );

    const resentInvite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    expect(resentInvite.inviteId).not.toEqual(initialInvite.inviteId);

    const pendingRow = inviteRow(page, invitedEmail);
    await expect(pendingRow.getByTestId("workspace-invite-status")).toHaveText("Pending");
    await expect(pendingRow.getByTestId("workspace-invite-delivery-badge")).toHaveText(
      "Test capture active",
    );

    await pendingRow.getByTestId("workspace-invite-copy-link").click();
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "Copied a fresh invite link",
    );
    await expect(page.getByTestId("commissioner-message-banner")).toContainText(
      "Previous active link is no longer valid",
    );

    const copiedInvite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    expect(copiedInvite.inviteId).not.toEqual(resentInvite.inviteId);

    const clipboardValue = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardValue).toBe(copiedInvite.url);

    page.once("dialog", (dialog) => dialog.accept());
    await inviteRow(page, invitedEmail).getByTestId("workspace-invite-revoke").click();
    await expect(page.getByTestId("commissioner-message-banner")).toContainText("Revoked invite");

    const revokedHistoryRow = page
      .getByTestId("workspace-invite-history-section")
      .getByTestId("workspace-invite-row")
      .filter({ hasText: invitedEmail })
      .first();
    await expect(revokedHistoryRow.getByTestId("workspace-invite-status")).toHaveText("Revoked");

    await scopedCommissioner.dispose();
  });

  test("accepted invite rows show accepted status after onboarding completes", async ({
    page,
    baseURL,
  }) => {
    const now = Date.now();
    const leagueId = await createLeague(baseURL as string, now);
    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const invitedEmail = `invite-accepted-${now}@example.test`;

    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Accepted Invite Owner",
        ownerEmail: invitedEmail,
        teamName: `Accepted Invite Team ${now}`,
        teamAbbreviation: "ACC",
        divisionLabel: "North",
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();

    const invite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    const inviteReturnTo = `${new URL(invite.url).pathname}${new URL(invite.url).search}`;

    await page.context().clearCookies();
    await page.goto(invite.url);
    await page.getByTestId("invite-sign-in-link").click();
    await page.getByTestId("login-email-input").fill(invitedEmail);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(invitedEmail);

    const magicLink = await getCapturedMagicLink(baseURL as string, invitedEmail, {
      returnTo: inviteReturnTo,
    });
    await page.goto(magicLink.url);
    await page.getByTestId("invite-accept-button").click();
    await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));

    await openInviteManagerAsCommissioner(page, leagueId);

    const acceptedRow = page
      .getByTestId("workspace-invite-history-section")
      .getByTestId("workspace-invite-row")
      .filter({ hasText: invitedEmail })
      .first();
    await expect(acceptedRow.getByTestId("workspace-invite-status")).toHaveText("Accepted");

    await scopedCommissioner.dispose();
  });

  test("non-commissioners cannot manage league invites", async ({ baseURL }) => {
    const leagueId = await createLeague(baseURL as string);
    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const ownerContext = await apiContext(baseURL as string, OWNER_EMAIL, leagueId);
    const invitedEmail = `invite-owner-blocked-${Date.now()}@example.test`;

    const ownerUser = await prisma.user.findUnique({
      where: {
        email: OWNER_EMAIL,
      },
      select: {
        id: true,
      },
    });
    expect(ownerUser?.id).toBeTruthy();

    await prisma.leagueMembership.create({
      data: {
        userId: ownerUser?.id ?? "",
        leagueId,
        role: "MEMBER",
      },
    });

    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Blocked Invite Owner",
        ownerEmail: invitedEmail,
        teamName: `Blocked Invite Team ${Date.now()}`,
        teamAbbreviation: "BLK",
        divisionLabel: "North",
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();

    const invite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    expect(invite.inviteId).toBeTruthy();

    const response = await ownerContext.post(`/api/league/invites/${invite.inviteId}/revoke`);
    expect(response.status()).toBe(403);

    await ownerContext.dispose();
    await scopedCommissioner.dispose();
  });
});
