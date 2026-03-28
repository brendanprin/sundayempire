import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL, READ_ONLY_EMAIL } from "./helpers/api";

type LeaguePhase = "PRESEASON" | "REGULAR_SEASON" | "PLAYOFFS" | "OFFSEASON";

function formatLeaguePhase(phase: LeaguePhase) {
  if (phase === "PRESEASON") return "Preseason";
  if (phase === "REGULAR_SEASON") return "Regular Season";
  if (phase === "PLAYOFFS") return "Playoffs";
  return "Offseason";
}

test.describe("Role Context Header", () => {
  test("commissioner sees role, workspace context, and season phase", async ({ page, baseURL }) => {
    const api = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueResponse = await api.get("/api/league");
    expect(leagueResponse.ok()).toBeTruthy();
    const leaguePayload = (await leagueResponse.json()) as {
      season: {
        phase: LeaguePhase;
      };
    };
    const expectedPhase = formatLeaguePhase(leaguePayload.season.phase);
    await api.dispose();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-role")).toHaveText("Commissioner");
    await expect(page.getByTestId("role-context-team")).toHaveText("League Workspace");
    await expect(page.getByTestId("role-context-phase")).toHaveText(`Current phase: ${expectedPhase}`);
  });

  test("team-assigned member sees role, team context, and season phase", async ({ page, baseURL }) => {
    const api = await apiContext(baseURL as string, OWNER_EMAIL);
    const [authResponse, leagueResponse] = await Promise.all([
      api.get("/api/auth/me"),
      api.get("/api/league"),
    ]);
    expect(authResponse.ok()).toBeTruthy();
    expect(leagueResponse.ok()).toBeTruthy();

    const authPayload = (await authResponse.json()) as {
      actor: {
        teamName: string | null;
      };
    };
    const leaguePayload = (await leagueResponse.json()) as {
      season: {
        phase: LeaguePhase;
      };
    };
    const expectedTeamName = authPayload.actor.teamName;
    const expectedPhase = formatLeaguePhase(leaguePayload.season.phase);
    expect(expectedTeamName).toBeTruthy();
    if (!expectedTeamName) {
      throw new Error("Team-assigned member actor must include teamName for role-context header test.");
    }
    await api.dispose();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/");

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-role")).toHaveText("Member");
    await expect(page.getByTestId("role-context-team")).toHaveText(expectedTeamName);
    await expect(page.getByTestId("role-context-phase")).toHaveText(`Current phase: ${expectedPhase}`);
  });

  test("member without team sees role, workspace context, and season phase", async ({ page, baseURL }) => {
    const api = await apiContext(baseURL as string, READ_ONLY_EMAIL);
    const leagueResponse = await api.get("/api/league");
    expect(leagueResponse.ok()).toBeTruthy();
    const leaguePayload = (await leagueResponse.json()) as {
      season: {
        phase: LeaguePhase;
      };
    };
    const expectedPhase = formatLeaguePhase(leaguePayload.season.phase);
    await api.dispose();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": READ_ONLY_EMAIL });
    await page.goto("/");

    await expect(page.getByTestId("shell-top-bar")).toBeVisible();
    await expect(page.getByTestId("role-context-role")).toHaveText("Member");
    await expect(page.getByTestId("role-context-team")).toHaveText("League Workspace");
    await expect(page.getByTestId("role-context-phase")).toHaveText(`Current phase: ${expectedPhase}`);
  });
});
