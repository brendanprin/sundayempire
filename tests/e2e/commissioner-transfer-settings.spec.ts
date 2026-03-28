import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL, getCapturedLeagueInvite } from "./helpers/api";

test.describe("Commissioner Transfer in Settings", () => {
  test("current commissioner can transfer commissioner authority from League Settings", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Settings Transfer ${Date.now()}`,
        description: "League Settings commissioner transfer coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createdLeague = await createLeagueResponse.json();
    const leagueId = createdLeague.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Transfer Target Owner",
        ownerEmail: OWNER_EMAIL,
        teamName: `Transfer Target Team ${Date.now()}`,
        teamAbbreviation: `TT${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();

    const capturedInvite = await getCapturedLeagueInvite(baseURL as string, OWNER_EMAIL, {
      leagueId,
    });
    const inviteToken = new URL(capturedInvite.url).searchParams.get("token");
    expect(inviteToken).toBeTruthy();

    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const acceptInviteResponse = await owner.post("/api/league/invites/accept", {
      data: {
        token: inviteToken,
        returnTo: "/",
      },
    });
    expect(acceptInviteResponse.ok()).toBeTruthy();

    const governanceBefore = await scopedCommissioner.get("/api/league/commissioner");
    expect(governanceBefore.ok()).toBeTruthy();
    const governanceBeforePayload = await governanceBefore.json();
    expect(
      governanceBeforePayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);
    const ownerMembership = governanceBeforePayload.members.find(
      (member: { email: string }) => member.email === OWNER_EMAIL,
    );
    expect(ownerMembership).toBeTruthy();
    expect(ownerMembership.leagueRole).toBe("MEMBER");

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto("/settings");

    await expect(page.getByTestId("settings-commissioner-governance")).toBeVisible();
    await expect(page.getByTestId("settings-current-commissioner")).toContainText(COMMISSIONER_EMAIL);
    await page
      .getByTestId("settings-commissioner-transfer-select")
      .selectOption(String(ownerMembership.userId));
    await page.getByTestId("settings-commissioner-transfer-button").click();
    await expect(page.getByTestId("settings-commissioner-success")).toContainText(OWNER_EMAIL);

    const ownerScoped = await apiContext(baseURL as string, OWNER_EMAIL, leagueId);
    const governanceAfter = await ownerScoped.get("/api/league/commissioner");
    expect(governanceAfter.ok()).toBeTruthy();
    const governanceAfterPayload = await governanceAfter.json();
    expect(governanceAfterPayload.commissioner.email).toBe(OWNER_EMAIL);
    expect(governanceAfterPayload.commissioner.leagueRole).toBe("COMMISSIONER");
    expect(
      governanceAfterPayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);
    expect(
      governanceAfterPayload.members.every(
        (member: { leagueRole: string }) =>
          member.leagueRole === "COMMISSIONER" || member.leagueRole === "MEMBER",
      ),
    ).toBeTruthy();

    await ownerScoped.dispose();
    await owner.dispose();
    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });
});
