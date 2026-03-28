import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getCapturedLeagueInvite,
} from "./helpers/api";

const PLATFORM_ADMIN_EMAIL = "platform-admin@local.league";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Admin Commissioner Support", () => {
  test.describe.configure({ mode: "serial" });

  test("platform admin can repair commissioner integrity across leagues", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Admin Support Repair ${Date.now()}`,
        description: "Cross-league admin commissioner repair coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createdLeague = await createLeagueResponse.json();
    const leagueId = createdLeague.league.id as string;
    const leagueName = createdLeague.league.name as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Admin Support Target",
        ownerEmail: OWNER_EMAIL,
        teamName: `Admin Support Team ${Date.now()}`,
        teamAbbreviation: `AS${Math.floor(Math.random() * 900 + 100)}`,
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

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": PLATFORM_ADMIN_EMAIL,
    });
    const deepLinkParams = new URLSearchParams({
      leagueId,
      q: leagueName,
      status: "UNHEALTHY",
      sort: "INTEGRITY_SEVERITY_DESC",
      page: "1",
      pageSize: "10",
    });
    await page.goto(`/support/commissioner?${deepLinkParams.toString()}`);

    await expect(page.getByTestId("support-commissioner-page")).toBeVisible();
    await expect(page.getByRole("link", { name: "Commissioner Support", exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-admin-commissioner-support")).toBeVisible();
    await expect(page.getByTestId("settings-admin-commissioner-search-input")).toHaveValue(leagueName);
    await expect(page.getByTestId("settings-admin-commissioner-status-filter")).toHaveValue("UNHEALTHY");
    await expect(page.getByTestId("settings-admin-commissioner-sort")).toHaveValue(
      "INTEGRITY_SEVERITY_DESC",
    );
    await expect(page.getByTestId("settings-admin-commissioner-page-size")).toHaveValue("10");

    await expect(page.getByTestId("settings-admin-commissioner-index-summary")).toContainText(
      "Showing",
    );
    await expect(page.getByTestId("settings-admin-commissioner-integrity-status")).toContainText(
      leagueName,
    );

    await page.reload();
    await expect(page.getByTestId("settings-admin-commissioner-search-input")).toHaveValue(leagueName);
    await expect(page.getByTestId("settings-admin-commissioner-status-filter")).toHaveValue("UNHEALTHY");
    await expect(page.getByTestId("settings-admin-commissioner-sort")).toHaveValue(
      "INTEGRITY_SEVERITY_DESC",
    );
    await expect(page.getByTestId("settings-admin-commissioner-page-size")).toHaveValue("10");

    const refreshedUrl = new URL(page.url());
    expect(refreshedUrl.searchParams.get("leagueId")).toBe(leagueId);
    expect(refreshedUrl.searchParams.get("q")).toBe(leagueName);
    expect(refreshedUrl.searchParams.get("status")).toBe("UNHEALTHY");
    expect(refreshedUrl.searchParams.get("sort")).toBe("INTEGRITY_SEVERITY_DESC");
    expect(refreshedUrl.searchParams.get("page")).toBe("1");
    expect(refreshedUrl.searchParams.get("pageSize")).toBe("10");

    await page.getByTestId("settings-admin-commissioner-index-select").first().click();

    await expect(page.getByTestId("settings-admin-commissioner-integrity-status")).toContainText(
      "Missing Commissioner",
    );
    await expect(page.getByTestId("settings-admin-commissioner-repair")).toBeVisible();

    await page.getByTestId("settings-admin-commissioner-repair-button").click();
    await expect(page.getByTestId("settings-admin-commissioner-success")).toContainText(
      "Commissioner integrity repaired",
    );
    await expect(page.getByTestId("settings-admin-commissioner-history-entry").first()).toContainText(
      "Repaired commissioner integrity",
    );

    const governanceAfter = await scopedCommissioner.get("/api/league/commissioner");
    expect(governanceAfter.ok()).toBeTruthy();
    const governanceAfterPayload = await governanceAfter.json();

    expect(governanceAfterPayload.integrity.status).toBe("HEALTHY");
    expect(
      governanceAfterPayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);

    await owner.dispose();
    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });

  test("platform-admin commissioner can deep-link into support from governance history", async ({
    page,
  }) => {
    await prisma.user.updateMany({
      where: {
        email: COMMISSIONER_EMAIL,
      },
      data: {
        platformRole: "ADMIN",
      },
    });

    try {
      await page.setExtraHTTPHeaders({
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
      });
      await page.goto("/settings");

      const historySupportLink = page.getByTestId("settings-commissioner-history-support-link");
      await expect(historySupportLink).toBeVisible();

      const href = await historySupportLink.getAttribute("href");
      expect(href).toContain("/support/commissioner?");

      await historySupportLink.click();

      await expect(page.getByTestId("support-commissioner-page")).toBeVisible();
      await expect(page.getByTestId("settings-admin-commissioner-support")).toBeVisible();

      const supportUrl = new URL(page.url());
      expect(supportUrl.pathname).toBe("/support/commissioner");
      expect(supportUrl.searchParams.get("leagueId")).toBeTruthy();
    } finally {
      await prisma.user.updateMany({
        where: {
          email: COMMISSIONER_EMAIL,
        },
        data: {
          platformRole: "USER",
        },
      });
    }
  });
});
