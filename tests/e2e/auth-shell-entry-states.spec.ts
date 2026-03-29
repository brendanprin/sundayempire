import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getCapturedLeagueInvite,
  getCapturedMagicLink,
} from "./helpers/api";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function signInWithMagicLink(input: {
  page: Page;
  baseURL: string;
  email: string;
  returnTo?: string;
}) {
  const returnTo = input.returnTo ?? "/";

  await input.page.context().clearCookies();
  await input.page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await input.page.getByTestId("login-email-input").fill(input.email);
  await input.page.getByTestId("login-submit").click();
  await expect(input.page.getByTestId("login-magic-link-confirmation")).toContainText(input.email);

  const magicLink = await getCapturedMagicLink(input.baseURL, input.email, {
    returnTo,
  });
  await input.page.goto(magicLink.url);
}

test.describe("Auth Shell Entry States", () => {
  test("single-league users route directly into their league after sign-in", async ({
    page,
    baseURL,
  }) => {
    const email = `single-league-${Date.now()}@example.test`;
    await prisma.user.create({
      data: {
        email,
        name: "Single League Member",
      },
    });

    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Single League Entry ${Date.now()}`,
        description: "Single-league auth entry verification",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createdLeague = await createLeagueResponse.json();
    const leagueId = createdLeague.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Single League Owner",
        ownerEmail: email,
        teamName: `Single League Team ${Date.now()}`,
        teamAbbreviation: `SL${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();

    const capturedInvite = await getCapturedLeagueInvite(baseURL as string, email, { leagueId });
    const inviteToken = new URL(capturedInvite.url).searchParams.get("token");
    expect(inviteToken).toBeTruthy();

    const invitedUserContext = await apiContext(baseURL as string, email);
    const acceptInviteResponse = await invitedUserContext.post("/api/league/invites/accept", {
      data: {
        token: inviteToken,
        returnTo: "/",
      },
    });
    expect(acceptInviteResponse.ok()).toBeTruthy();
    await invitedUserContext.dispose();
    await scopedCommissioner.dispose();
    await commissioner.dispose();

    await signInWithMagicLink({
      page,
      baseURL: baseURL as string,
      email,
      returnTo: "/",
    });

    await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`));
    await expect(page.getByTestId("role-context-role")).toHaveText("Member");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
  });

  test("multi-league users land on the league chooser instead of an implicit identity workspace", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createdLeague = await commissioner.post("/api/leagues", {
      data: {
        name: `League Picker ${Date.now()}`,
        description: "Multiple league auth entry verification",
        seasonYear: 2026,
      },
    });
    expect(createdLeague.ok()).toBeTruthy();

    await signInWithMagicLink({
      page,
      baseURL: baseURL as string,
      email: COMMISSIONER_EMAIL,
      returnTo: "/",
    });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("league-directory-page")).toBeVisible();
    await expect(
      page.getByTestId("league-directory-page").getByRole("heading", { name: "Choose a League" }),
    ).toBeVisible();
    await expect(page.getByTestId("league-directory-open-create-wizard")).toBeVisible();

    await commissioner.dispose();
  });

  test("signed-in users with no leagues see the authenticated empty state", async ({
    page,
    baseURL,
  }) => {
    const email = `no-league-${Date.now()}@example.test`;
    await prisma.user.create({
      data: {
        email,
        name: "No League User",
      },
    });

    await signInWithMagicLink({
      page,
      baseURL: baseURL as string,
      email,
      returnTo: "/",
    });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("league-entry-empty-state")).toBeVisible();
    await expect(page.getByTestId("league-entry-empty-state")).toContainText(
      "No league memberships are attached to this signed-in account yet.",
    );
    await expect(page.getByTestId("no-league-create-button")).toBeVisible();
    await expect(page.getByTestId("no-league-join-button")).toBeVisible();
    await expect(page.getByTestId("no-league-sign-out")).toBeVisible();
  });

  test("no-league users can create through the guided wizard and land in league home", async ({
    page,
    baseURL,
  }) => {
    const email = `wizard-create-${Date.now()}@example.test`;
    await prisma.user.create({
      data: {
        email,
        name: "Wizard Create User",
      },
    });

    await signInWithMagicLink({
      page,
      baseURL: baseURL as string,
      email,
      returnTo: "/",
    });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("league-entry-empty-state")).toBeVisible();

    await page.getByTestId("no-league-create-button").click();
    await expect(page.getByTestId("league-create-wizard")).toBeVisible();
    await expect(page.getByTestId("league-create-step-basics")).toHaveAttribute("aria-current", "step");

    const nextToOptionsButton = page.getByTestId("league-create-next-options");
    await expect(nextToOptionsButton).toBeDisabled();

    await page.getByTestId("no-league-create-name").fill("A");
    await page.getByTestId("no-league-create-season-year").fill("2026");
    await expect(page.getByTestId("league-create-name-error")).toBeVisible();
    await expect(nextToOptionsButton).toBeDisabled();

    await page.getByTestId("no-league-create-name").fill(`Wizard League ${Date.now()}`);
    await page.getByTestId("no-league-create-season-year").fill("1999");
    await expect(page.getByTestId("league-create-season-year-error")).toBeVisible();
    await expect(nextToOptionsButton).toBeDisabled();

    await page.getByTestId("no-league-create-season-year").fill("2026");
    await expect(nextToOptionsButton).toBeEnabled();
    await nextToOptionsButton.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("league-create-step-options")).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("no-league-create-description")).toBeFocused();

    await page.getByTestId("no-league-create-designated-commissioner-email").fill("not-an-email");
    await expect(page.getByTestId("league-create-designated-commissioner-error")).toBeVisible();
    await expect(page.getByTestId("league-create-next-review")).toBeDisabled();

    await page.getByTestId("no-league-create-designated-commissioner-email").fill("");
    await page.getByTestId("no-league-create-description").fill("Wizard setup flow test");
    await expect(page.getByTestId("league-create-next-review")).toBeEnabled();
    await page.getByTestId("league-create-next-review").focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("league-create-step-review")).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("league-create-review-step")).toBeVisible();
    await expect(page.getByTestId("league-create-submit-button")).toBeFocused();

    await page.getByTestId("league-create-submit-button").click();

    await expect(page).toHaveURL(/\/league\/[^/]+$/);
    await expect(page.getByTestId("role-context-role")).toHaveText("Commissioner");
    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
  });

  test("revoked sessions redirect to login with a recovery message", async ({
    page,
    baseURL,
  }) => {
    await signInWithMagicLink({
      page,
      baseURL: baseURL as string,
      email: OWNER_EMAIL,
      returnTo: "/",
    });

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "dynasty_session");
    expect(sessionCookie?.value).toBeTruthy();
    const sessionId = sessionCookie?.value.split(".")[0] ?? "";
    expect(sessionId).not.toEqual("");

    await prisma.authSession.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
      },
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?returnTo=%2F(?:&error=session_expired)?$/);
    if ((await page.url()).includes("error=session_expired")) {
      await expect(page.getByText("Your session expired or was revoked.")).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Sign In", exact: true })).toBeVisible();
    }
  });
});
