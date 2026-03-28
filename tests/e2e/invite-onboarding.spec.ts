import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getCapturedLeagueInvite,
  getCapturedMagicLink,
} from "./helpers/api";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Invite Onboarding", () => {
  test("commissioner invite can be authenticated and accepted into the correct league", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const now = Date.now();
    const invitedEmail = `invite-owner-${now}@example.test`;
    const leagueName = `Invite Flow League ${now}`;
    const teamName = `Invite Flow Team ${now}`;

    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "Invite onboarding e2e",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Invite Owner",
        ownerEmail: invitedEmail,
        teamName,
        teamAbbreviation: "IFO",
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

    await expect(page.getByTestId("invite-page")).toBeVisible();
    await expect(page.getByTestId("invite-sign-in-link")).toBeVisible();
    await expect(page.getByText(leagueName)).toBeVisible();
    await expect(page.getByText(teamName)).toBeVisible();

    await page.getByTestId("invite-sign-in-link").click();
    await expect(page).toHaveURL(/\/login\?/);
    await page.getByTestId("login-email-input").fill(invitedEmail);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(invitedEmail);

    const magicLink = await getCapturedMagicLink(baseURL as string, invitedEmail, {
      returnTo: inviteReturnTo,
    });
    await page.goto(magicLink.url);

    await expect(page).toHaveURL(new RegExp(`/invite\\?token=`));
    await expect(page.getByTestId("invite-authenticated-email")).toContainText(invitedEmail);
    await expect(page.getByTestId("invite-accept-button")).toBeVisible();

    await page.getByTestId("invite-accept-button").click();

    await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-role")).toHaveText("Owner");
    await expect(page.getByTestId("role-context-league-name")).toHaveText(leagueName);
    await expect(page.getByTestId("role-context-team")).toContainText(teamName);

    await page.reload();
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-role")).toHaveText("Owner");

    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });

  test("wrong signed-in email cannot accept another user's invite", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const now = Date.now();
    const invitedEmail = `wrong-account-owner-${now}@example.test`;

    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Wrong Invite League ${now}`,
        description: "Wrong-account invite e2e",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Wrong Account Owner",
        ownerEmail: invitedEmail,
        teamName: `Wrong Account Team ${now}`,
        teamAbbreviation: "WAI",
        divisionLabel: "North",
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();

    const invite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });

    await page.context().clearCookies();
    await page.goto("/login?returnTo=%2F");
    await page.getByTestId("login-email-input").fill(COMMISSIONER_EMAIL);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(
      COMMISSIONER_EMAIL,
    );
    const magicLink = await getCapturedMagicLink(baseURL as string, COMMISSIONER_EMAIL, {
      returnTo: "/",
    });
    await page.goto(magicLink.url);
    await expect(page).toHaveURL(/\/$/);

    await page.goto(invite.url);
    await expect(page.getByTestId("invite-email-mismatch-panel")).toBeVisible();
    await expect(page.getByTestId("invite-email-mismatch-panel")).toContainText(invitedEmail);
    await expect(page.getByTestId("invite-email-mismatch-panel")).toContainText(COMMISSIONER_EMAIL);
    await expect(page.getByTestId("invite-switch-account-link")).toBeVisible();

    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });

  test("expired invites render the expired state", async ({ page, baseURL }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const now = Date.now();
    const invitedEmail = `expired-owner-${now}@example.test`;

    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Expired Invite League ${now}`,
        description: "Expired invite e2e",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Expired Owner",
        ownerEmail: invitedEmail,
        teamName: `Expired Team ${now}`,
        teamAbbreviation: "EXP",
        divisionLabel: "North",
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();

    const invite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    expect(invite.inviteId).toBeTruthy();

    await prisma.leagueInvite.update({
      where: {
        id: invite.inviteId ?? "",
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await page.context().clearCookies();
    await page.goto(invite.url);

    await expect(page.getByTestId("invite-expired-panel")).toBeVisible();
    await expect(page.getByTestId("invite-expired-panel")).toContainText("expired");

    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });
});
