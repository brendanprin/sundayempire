import { expect, test, type Page } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getCapturedLeagueInvite,
  getCapturedMagicLink,
} from "../e2e/helpers/api";
import {
  captureSmokeEvidence,
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable,
} from "./helpers/smoke-evidence";

async function getLeagueId(baseURL: string): Promise<string> {
  const api = await apiContext(baseURL, COMMISSIONER_EMAIL);
  try {
    const response = await api.get("/api/leagues");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { leagues: Array<{ id: string }> };
    expect(payload.leagues.length).toBeGreaterThan(0);
    return payload.leagues[0].id;
  } finally {
    await api.dispose();
  }
}

async function createInvite(
  baseURL: string,
  leagueId: string,
  invitedEmail: string,
): Promise<void> {
  const api = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
  try {
    const response = await api.post("/api/league/invites", {
      data: { email: invitedEmail, role: "MEMBER" },
    });
    expect(response.ok()).toBeTruthy();
  } finally {
    await api.dispose();
  }
}

async function loginWithMagicLink(page: Page, baseURL: string, email: string, returnTo: string) {
  await page.context().clearCookies();
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await expect(page.getByRole("heading", { name: "Sign In", exact: true })).toBeVisible();

  const demoTrigger = page.getByTestId("login-show-demo-section");
  if (await demoTrigger.isVisible().catch(() => false)) {
    await demoTrigger.click();
    const demoPanel = page.getByTestId("login-demo-auth-panel");
    await expect(demoPanel).toBeVisible();
    const identitySelect = page.getByTestId("login-identity-select");
    const matchingOption = identitySelect.locator(`option[value="${email}"]`);
    if (await matchingOption.count()) {
      await identitySelect.selectOption(email);
      await page.getByTestId("login-demo-submit").click();
    } else {
      // invited email not in demo list — fall through to magic link
      await page.keyboard.press("Escape");
      await page.getByTestId("login-email-input").fill(email);
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(email);
      const magicLink = await getCapturedMagicLink(baseURL, email, { returnTo });
      await page.goto(magicLink.url);
    }
  } else {
    await page.getByTestId("login-email-input").fill(email);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(email);
    const magicLink = await getCapturedMagicLink(baseURL, email, { returnTo });
    await page.goto(magicLink.url);
  }
}

test.describe("Invite Acceptance Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("invited member receives invite, authenticates, and joins league", async ({
    page,
    baseURL,
  }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    const runId = Date.now();
    const invitedEmail = `smoke-invite-${runId}@example.test`;

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      // Step 1: Commissioner creates an invite
      const leagueId = await getLeagueId(baseURL);
      await createInvite(baseURL, leagueId, invitedEmail);

      // Step 2: Capture the invite URL issued by the system
      const invite = await getCapturedLeagueInvite(baseURL, invitedEmail, { leagueId });
      expect(invite.url).toBeTruthy();
      expect(invite.leagueId).toBe(leagueId);

      // Step 3: Unauthenticated user visits the invite URL
      await page.context().clearCookies();
      await page.goto(invite.url);
      await waitForPageStable(page);

      await expect(page.getByTestId("invite-page")).toBeVisible();
      await expect(page.getByTestId("invite-status-heading")).toHaveText("Join League");
      await expect(page.getByTestId("invite-sign-in-panel")).toBeVisible();
      await expect(page.getByTestId("invite-sign-in-link")).toBeVisible();

      evidence = await captureSmokeEvidence(page, test.info(), "01-invite-landing-unauthenticated");

      // Step 4: User clicks "Continue to Sign In" — preserves returnTo back to invite URL
      const inviteReturnPath = new URL(invite.url).pathname + new URL(invite.url).search;
      await page.getByTestId("invite-sign-in-link").click();
      await waitForPageStable(page);

      await expect(page).toHaveURL(/\/login/);
      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-redirected-to-login")).screenshots,
      );

      // Step 5: Authenticate as the invited email
      await loginWithMagicLink(page, baseURL, invitedEmail, inviteReturnPath);
      await waitForPageStable(page);

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "03-authenticated-returned-to-invite")).screenshots,
      );

      // Step 6: Now authenticated and on the invite page — accept button should be visible
      await expect(page.getByTestId("invite-page")).toBeVisible();
      await expect(page.getByTestId("invite-status-heading")).toHaveText("Join League");
      await expect(page.getByTestId("invite-authenticated-email")).toContainText(invitedEmail);
      await expect(page.getByTestId("invite-accept-button")).toBeVisible();
      await expect(page.getByTestId("invite-accept-button")).toBeEnabled();

      // Email mismatch panel must NOT be shown
      await expect(page.getByTestId("invite-email-mismatch-panel")).not.toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "04-ready-to-accept")).screenshots,
      );

      // Step 7: Accept the invitation
      await page.getByTestId("invite-accept-button").click();
      await waitForPageStable(page);

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "05-post-acceptance")).screenshots,
      );

      // Step 8: User should land inside the league workspace (not back on invite or login)
      await page.waitForURL((url) => !url.pathname.startsWith("/invite") && !url.pathname.startsWith("/login"), {
        timeout: 15_000,
      });
      expect(page.url()).toMatch(/\/(league|teams|commissioner)/);

      // Returning to the invite URL should now show "already accepted"
      await page.goto(invite.url);
      await waitForPageStable(page);
      await expect(page.getByTestId("invite-accepted-panel")).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "06-invite-already-accepted")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "invite-acceptance-flow",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("invite link shows correct error states for invalid tokens", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      // No token — should show invalid state
      await page.context().clearCookies();
      await page.goto("/invite");
      await waitForPageStable(page);

      await expect(page.getByTestId("invite-page")).toBeVisible();
      await expect(page.getByTestId("invite-invalid-panel")).toBeVisible();
      await expect(page.getByTestId("invite-accept-button")).not.toBeVisible();

      evidence = await captureSmokeEvidence(page, test.info(), "01-no-token-invalid");

      // Garbage token — should also show invalid
      await page.goto("/invite?token=not-a-real-token-abc123");
      await waitForPageStable(page);

      await expect(page.getByTestId("invite-page")).toBeVisible();
      await expect(page.getByTestId("invite-invalid-panel")).toBeVisible();
      await expect(page.getByTestId("invite-accept-button")).not.toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-bad-token-invalid")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "invite-acceptance-flow-error-states",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("wrong-account user sees email mismatch warning", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    const runId = Date.now();
    const invitedEmail = `smoke-mismatch-${runId}@example.test`;

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      const leagueId = await getLeagueId(baseURL);
      await createInvite(baseURL, leagueId, invitedEmail);
      const invite = await getCapturedLeagueInvite(baseURL, invitedEmail, { leagueId });

      // Sign in as the commissioner (wrong account for this invite)
      await page.context().clearCookies();
      await page.goto(`/login?returnTo=${encodeURIComponent(new URL(invite.url).pathname + new URL(invite.url).search)}`);
      await waitForPageStable(page);

      const demoTrigger = page.getByTestId("login-show-demo-section");
      if (await demoTrigger.isVisible().catch(() => false)) {
        await demoTrigger.click();
        await page.getByTestId("login-role-option-commissioner").click();
        await page.getByTestId("login-demo-submit").click();
      } else {
        await page.getByTestId("login-email-input").fill(COMMISSIONER_EMAIL);
        await page.getByTestId("login-submit").click();
        const magicLink = await getCapturedMagicLink(baseURL, COMMISSIONER_EMAIL, {
          returnTo: new URL(invite.url).pathname + new URL(invite.url).search,
        });
        await page.goto(magicLink.url);
      }

      await waitForPageStable(page);

      // Should land on invite page with mismatch warning
      await expect(page.getByTestId("invite-page")).toBeVisible();
      await expect(page.getByTestId("invite-email-mismatch-panel")).toBeVisible();
      await expect(page.getByTestId("invite-switch-account-link")).toBeVisible();
      // Accept button must NOT be shown when emails don't match
      await expect(page.getByTestId("invite-accept-button")).not.toBeVisible();

      evidence = await captureSmokeEvidence(page, test.info(), "01-email-mismatch");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "invite-acceptance-flow-mismatch",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
