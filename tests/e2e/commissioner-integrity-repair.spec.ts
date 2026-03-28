import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getCapturedLeagueInvite,
} from "./helpers/api";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Commissioner Integrity Repair", () => {
  test("settings governance reports missing commissioner and repairs safely", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Integrity Repair ${Date.now()}`,
        description: "Commissioner integrity repair coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createdLeague = await createLeagueResponse.json();
    const leagueId = createdLeague.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Repair Target Owner",
        ownerEmail: OWNER_EMAIL,
        teamName: `Repair Target Team ${Date.now()}`,
        teamAbbreviation: `RP${Math.floor(Math.random() * 900 + 100)}`,
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

    await prisma.leagueMembership.updateMany({
      where: {
        leagueId,
        role: "COMMISSIONER",
      },
      data: {
        role: "MEMBER",
      },
    });

    const ownerScoped = await apiContext(baseURL as string, OWNER_EMAIL, leagueId);
    const governanceBefore = await ownerScoped.get("/api/league/commissioner");
    expect(governanceBefore.ok()).toBeTruthy();
    const governanceBeforePayload = await governanceBefore.json();
    expect(governanceBeforePayload.integrity.status).toBe("MISSING_COMMISSIONER");
    expect(governanceBeforePayload.commissioner).toBeNull();
    expect(
      governanceBeforePayload.integrity.issues.some(
        (issue: { code: string }) => issue.code === "MISSING_ACTIVE_COMMISSIONER",
      ),
    ).toBeTruthy();

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": OWNER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto("/settings");

    await expect(page.getByTestId("settings-commissioner-governance")).toBeVisible();
    await expect(page.getByTestId("settings-commissioner-integrity-status")).toContainText(
      "Missing Commissioner",
    );
    await expect(page.getByTestId("settings-current-commissioner-missing")).toBeVisible();
    await expect(page.getByTestId("settings-commissioner-repair")).toBeVisible();

    await page.getByTestId("settings-commissioner-repair-button").click();
    await expect(page.getByTestId("settings-commissioner-success")).toContainText(
      "Commissioner governance repaired",
    );
    await expect(page.getByTestId("settings-commissioner-history")).toBeVisible();
    await expect(page.getByTestId("settings-commissioner-history-entry").first()).toContainText(
      "Repaired commissioner integrity",
    );

    const governanceAfter = await ownerScoped.get("/api/league/commissioner");
    expect(governanceAfter.ok()).toBeTruthy();
    const governanceAfterPayload = await governanceAfter.json();
    expect(governanceAfterPayload.integrity.status).toBe("HEALTHY");
    expect(governanceAfterPayload.commissioner.email).toBe(OWNER_EMAIL);
    expect(
      governanceAfterPayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);
    expect(
      governanceAfterPayload.history.some((entry: { kind: string }) => entry.kind === "COMMISSIONER_REPAIR"),
    ).toBeTruthy();

    const latestRepairTransaction = await prisma.transaction.findFirst({
      where: {
        leagueId,
        summary: {
          contains: "Repaired commissioner integrity",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        summary: true,
      },
    });
    expect(latestRepairTransaction?.id).toBeTruthy();
    expect(latestRepairTransaction?.summary).toContain("Repaired commissioner integrity");

    await ownerScoped.dispose();
    await owner.dispose();
    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });
});
