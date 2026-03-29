import { expect, test, type Page } from "@playwright/test";
import {
  apiContext,
  getCapturedLeagueInvite,
  getCapturedMagicLink,
} from "../e2e/helpers/api";
import {
  captureSmokeEvidence,
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable,
} from "./helpers/smoke-evidence";

type AuthMePayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    teamId: string | null;
  } | null;
};

async function loginWithEmail(page: Page, email: string, returnTo: string) {
  await page.context().clearCookies();
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await expect(page.getByRole("heading", { name: "Sign In", exact: true })).toBeVisible();

  const demoPanel = page.getByTestId("login-demo-auth-panel");
  if (await demoPanel.isVisible().catch(() => false)) {
    await page.getByTestId("login-role-option-commissioner").click();
    const identitySelect = page.getByTestId("login-identity-select");
    const matchingOption = identitySelect.locator(`option[value="${email}"]`);
    if (await matchingOption.count()) {
      await identitySelect.selectOption(email);
    }
    await page.getByTestId("login-demo-submit").click();
  } else {
    await page.getByTestId("login-email-input").fill(email);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(email);

    const magicLink = await getCapturedMagicLink(new URL(page.url()).origin, email, {
      returnTo,
    });
    await page.goto(magicLink.url);
  }

  await expect(page).not.toHaveURL(/\/login($|\?)/);
  return new URL(page.url()).origin;
}

async function readAuthMe(baseURL: string, email: string, leagueId: string) {
  const actorApi = await apiContext(baseURL, email, leagueId);
  try {
    const authMeResponse = await actorApi.get("/api/auth/me");
    expect(authMeResponse.ok()).toBeTruthy();
    return (await authMeResponse.json()) as AuthMePayload;
  } finally {
    await actorApi.dispose();
  }
}

test.describe("Founder First Run", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("founder first-run path reaches draft-ready setup posture", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    const runId = Date.now();
    const founderEmail = "noleague@local.league";
    const leagueName = `Founder Smoke League ${runId}`;
    const founderTeamName = `Founder Franchise ${runId}`;
    const addedTeamName = `Expansion ${runId}`;
    const invitedEmail = `founder-invite-${runId}@example.test`;
    const invitedTeamName = `Invite Team ${runId}`;
    const rookieDraftTitle = `Founder Rookie Draft ${runId}`;

    try {
      if (!baseURL) {
        throw new Error("Expected Playwright baseURL to be configured.");
      }

      const appOrigin = await loginWithEmail(page, founderEmail, "/");
      await waitForPageStable(page);
      evidence = await captureSmokeEvidence(page, test.info(), "01-founder-signed-in");

      if (!(await page.getByTestId("league-directory-page").isVisible().catch(() => false))) {
        await page.goto(`${appOrigin}/`);
        await waitForPageStable(page);
      }
      await expect(page.getByTestId("league-directory-page")).toBeVisible();

      if (await page.getByTestId("no-league-create-button").isVisible().catch(() => false)) {
        await page.getByTestId("no-league-create-button").click();
      } else {
        await page.getByTestId("league-directory-open-create-wizard").click();
      }

      await expect(page.getByTestId("league-create-wizard")).toBeVisible();
      await page.getByTestId("no-league-create-name").fill(leagueName);
      await page.getByTestId("no-league-create-season-year").fill("2026");
      await page.getByTestId("league-create-next-options").click();
      await page.getByTestId("no-league-create-description").fill(
        "Founder-first-run smoke coverage from clean sign-in through draft readiness.",
      );
      await page.getByTestId("league-create-next-review").click();
      await page.getByTestId("league-create-submit-button").click();
      await expect(page).toHaveURL(/\/league\/[^/]+$/, { timeout: 20_000 });
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "02-workspace-created")).screenshots);

      const leagueId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
      expect(leagueId).toBeTruthy();

      await page.goto(`${appOrigin}/league/${leagueId}`);
      await waitForPageStable(page);
      await expect(page.getByTestId("dashboard-setup-checklist")).toBeVisible();
      await expect(page.getByTestId("dashboard-setup-checklist-progress")).toContainText("0 / 5 complete");
      await expect(page.getByTestId("founder-team-setup-panel")).toBeVisible();
      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "03-founder-setup-incomplete")).screenshots,
      );

      const authBeforeFounderTeam = await readAuthMe(baseURL, founderEmail, leagueId);
      expect(authBeforeFounderTeam.actor?.leagueRole).toBe("COMMISSIONER");
      expect(authBeforeFounderTeam.actor?.teamId).toBeNull();

      await page.getByTestId("founder-team-create-name-input").fill(founderTeamName);
      await page.getByTestId("founder-team-create-abbreviation-input").fill("FND");
      await page.getByTestId("founder-team-create-division-input").fill("North");
      await page.getByTestId("founder-team-create-submit").click();

      await expect(page.getByTestId("dashboard-setup-checklist-status-founder-team-status")).toHaveText(
        "Complete",
      );
      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "04-founder-team-complete")).screenshots,
      );

      const authAfterFounderTeam = await readAuthMe(baseURL, founderEmail, leagueId);
      expect(authAfterFounderTeam.actor?.leagueRole).toBe("COMMISSIONER");
      expect(authAfterFounderTeam.actor?.teamId).toBeTruthy();

      await expect(page.getByTestId("setup-bootstrap-panel")).toBeVisible();
      await page.getByTestId("setup-create-team-name").fill(addedTeamName);
      await page.getByTestId("setup-create-team-abbr").fill("EXP");
      await page.getByTestId("setup-create-team-division").fill("South");
      await page.getByTestId("setup-create-team-submit").click();
      await expect(
        page.getByTestId("setup-bootstrap-panel").getByText(`Created team ${addedTeamName}.`),
      ).toBeVisible();

      await page.getByTestId("setup-invite-owner-name").fill("Founder Smoke Invite");
      await page.getByTestId("setup-invite-owner-email").fill(invitedEmail);
      await page.getByTestId("setup-invite-team-name").fill(invitedTeamName);
      await page.getByTestId("setup-invite-team-abbr").fill("INV");
      await page.getByTestId("setup-invite-division").fill("South");
      await page.getByTestId("setup-invite-submit").click();
      await expect(
        page.getByTestId("setup-bootstrap-panel").getByText("Invited Founder Smoke Invite and created"),
      ).toBeVisible();
      await expect(page.getByTestId("workspace-invite-capture-note")).toBeVisible();

      const pendingInviteRow = page
        .getByTestId("workspace-invite-row")
        .filter({ hasText: invitedEmail })
        .first();
      await expect(pendingInviteRow).toBeVisible();
      await expect(pendingInviteRow.getByTestId("workspace-invite-status")).toHaveText("Pending");

      await expect(page.getByTestId("dashboard-setup-checklist-status-add-teams")).toHaveText("Complete");
      await expect(page.getByTestId("dashboard-setup-checklist-status-invite-members")).toHaveText("Complete");
      await expect(page.getByTestId("dashboard-setup-checklist-progress")).toContainText("3 / 5 complete");
      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "05-bootstrap-progressed")).screenshots,
      );

      const capturedInvite = await getCapturedLeagueInvite(baseURL, invitedEmail, { leagueId });
      expect(capturedInvite.leagueId).toBe(leagueId);
      expect(capturedInvite.email).toBe(invitedEmail);

      await expect(page.getByTestId("commissioner-action-draft-ready")).toBeVisible();
      await page.getByTestId("commissioner-action-link-draft-ready").click();
      await expect(page).toHaveURL(/\/draft$/);
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "06-draft-home")).screenshots);

      await page.goto(`${appOrigin}/draft/rookie`);
      await waitForPageStable(page);
      await expect(page.getByTestId("rookie-draft-workspace")).toBeVisible();
      await page.getByLabel("Session Title").fill(rookieDraftTitle);
      await page.getByRole("button", { name: /Create Draft & Generate Board|Generate Board/i }).click();
      await expect(page.getByText("Generated Draft Order")).toBeVisible({ timeout: 20_000 });

      await page.goto(`${appOrigin}/league/${leagueId}`);
      await waitForPageStable(page);
      await expect(page.getByTestId("dashboard-setup-checklist-status-draft-prep-readiness")).toHaveText(
        "Complete",
      );
      await expect(page.getByTestId("commissioner-action-draft-ready")).toBeVisible();
      evidence.screenshots.push(...(await captureSmokeEvidence(page, test.info(), "07-draft-ready")).screenshots);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "founder-first-run-to-draft-ready",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
