/**
 * Phase 0 — New League Creation
 *
 * Smoke test covering the full commissioner setup flow from a fresh account
 * through the first member accepting an invite. This represents the PRESEASON_SETUP
 * phase of the league lifecycle — no draft, no active season.
 *
 * Steps covered:
 *   01  Commissioner signs in (no existing leagues)
 *   02  Commissioner creates a new league via the wizard
 *   03  Bootstrap dashboard loads with empty checklist
 *   04  Commissioner creates their founder team (validation + happy path)
 *   05  League Members workspace shows correct slot state
 *   06  Commissioner sends a member invite via the table-first slot action
 *   07  Invited member navigates to the invite page and signs in
 *   08  Member accepts the invite and lands on the league dashboard
 *   09  Commissioner re-views the workspace — slot shows "Owner Joined"
 *   10  Setup checklist has progressed from the initial state
 */

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

// Use an account that starts with no leagues so the test always enters
// the league-creation wizard instead of landing on an existing workspace.
const COMMISSIONER_EMAIL = "noleague@local.league";

async function signInWithEmail(page: Page, email: string, returnTo: string): Promise<string> {
  await page.context().clearCookies();
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);

  // Wait for the email input — reliable across demo and magic-link environments
  await expect(page.getByTestId("login-email-input")).toBeVisible({ timeout: 10_000 });

  // Demo auth is hidden behind a dev-access button (only present when demo is enabled).
  // Only use it if the email actually appears in the dropdown — otherwise fall through
  // to magic-link, which works for any email with test-capture enabled.
  let usedDemo = false;
  const devAccessBtn = page.getByTestId("login-show-demo-section");
  if (await devAccessBtn.isVisible().catch(() => false)) {
    await devAccessBtn.click();
    await expect(page.getByTestId("login-demo-auth-panel")).toBeVisible();

    const emailSelect = page.getByTestId("login-demo-email-select");
    const matchingOption = emailSelect.locator(`option[value="${email}"]`);
    if (await matchingOption.count()) {
      const roleOption = page.getByTestId("login-role-option-commissioner");
      if (await roleOption.isVisible().catch(() => false)) {
        await roleOption.click();
      }
      await emailSelect.selectOption(email);
      await page.getByTestId("login-demo-submit").click();
      usedDemo = true;
    } else {
      // Email not in demo dropdown — close the modal so the main form is interactive
      await page.getByTestId("login-demo-close").click();
      await expect(page.getByTestId("login-demo-auth-panel")).not.toBeVisible();
    }
  }

  if (!usedDemo) {
    // Magic-link path — works in any environment when AUTH_MAGIC_LINK_TEST_CAPTURE=1
    await page.getByTestId("login-email-input").fill(email);
    await page.getByTestId("login-submit").click();
    // Login page shows "Sign-in link sent" heading in the success state
    await expect(page.getByText("Sign-in link sent")).toBeVisible({ timeout: 10_000 });

    const origin = new URL(page.url()).origin;
    const magicLink = await getCapturedMagicLink(origin, email, { returnTo });
    await page.goto(magicLink.url);
  }

  await expect(page).not.toHaveURL(/\/login($|\?)/, { timeout: 15_000 });
  return new URL(page.url()).origin;
}

async function requestAndFollowMagicLink(
  page: Page,
  baseURL: string,
  email: string,
  returnTo: string,
): Promise<void> {
  await page.getByTestId("login-email-input").fill(email);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("Sign-in link sent")).toBeVisible({ timeout: 10_000 });

  const magicLink = await getCapturedMagicLink(baseURL, email, { returnTo });
  await page.goto(magicLink.url);
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("Phase 0 — New League Creation", () => {
  test.beforeAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error("baseURL is required for smoke tests.");
    const res = await fetch(`${baseURL}/api/auth/magic-link/test?email=preflight@check`);
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: { message?: string } })?.error?.message ?? "";
      if (msg.includes("disabled")) {
        throw new Error(
          "Magic-link test capture is disabled on the running server.\n" +
          "Kill your dev server and rerun — Playwright will start a fresh one with AUTH_MAGIC_LINK_TEST_CAPTURE=1.\n" +
          "Or: AUTH_MAGIC_LINK_TEST_CAPTURE=1 npm run dev",
        );
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("commissioner creates a league, sets up founder team, invites a member, member accepts", async ({
    page,
    baseURL,
  }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    const runId = Date.now();
    const leagueName = `Phase 0 Smoke ${runId}`;
    const founderTeamName = `Commissioner Franchise ${runId}`;
    const memberEmail = `phase0-member-${runId}@example.test`;
    const memberTeamName = `Member Team ${runId}`;

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      // ── 01  Commissioner signs in ─────────────────────────────────────────
      const appOrigin = await signInWithEmail(page, COMMISSIONER_EMAIL, "/my-leagues");
      await waitForPageStable(page);
      evidence = await captureSmokeEvidence(page, test.info(), "01-commissioner-signed-in");

      await expect(page.getByTestId("my-leagues-page")).toBeVisible({ timeout: 10_000 });

      // ── 02  Create a new league ───────────────────────────────────────────
      // create-league-button = empty state; create-league-button-secondary = when leagues exist
      const createLeagueBtn = page
        .getByTestId("create-league-button")
        .or(page.getByTestId("create-league-button-secondary"));
      await createLeagueBtn.first().click();

      await expect(page.getByTestId("league-create-wizard")).toBeVisible();
      await page.getByTestId("no-league-create-name").fill(leagueName);
      await page.getByTestId("no-league-create-season-year").fill("2026");
      await page.getByTestId("league-create-next-options").click();
      await page.getByTestId("no-league-create-description").fill(
        "Phase 0 smoke — new league creation through first member acceptance.",
      );
      await page.getByTestId("league-create-next-review").click();
      await page.getByTestId("league-create-submit-button").click();

      await expect(page).toHaveURL(/\/league\/[^/]+$/, { timeout: 20_000 });
      const leagueId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
      expect(leagueId, "League ID must be present in URL after creation").toBeTruthy();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-league-created")).screenshots,
      );

      // ── 03  Bootstrap dashboard loads ─────────────────────────────────────
      await waitForPageStable(page);
      await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();
      await expect(page.getByTestId("bootstrap-dashboard-eyebrow")).toContainText("New League Setup");
      await expect(page.getByTestId("bootstrap-dashboard-league-name")).toContainText(leagueName);

      // Expand the checklist if it auto-collapsed (first-visit state)
      const checklistCollapse = page.getByTestId("bootstrap-checklist-collapse");
      await expect(checklistCollapse).toBeVisible();
      const expandBtn = checklistCollapse.getByRole("button");
      if ((await expandBtn.getAttribute("aria-expanded")) !== "true") {
        await expandBtn.click();
      }
      await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
      // No items complete on a brand-new league
      await expect(page.getByTestId("bootstrap-progress-overview").getByText(/0\/\d+ Complete/i).first()).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "03-bootstrap-dashboard")).screenshots,
      );

      // ── 04  Commissioner creates their founder team ───────────────────────
      await expect(page.getByTestId("bootstrap-founder-team-setup")).toBeVisible();
      await expect(page.getByTestId("bootstrap-founder-status")).toHaveText("Required");

      // Validation: name too short
      await page.getByTestId("bootstrap-founder-name-input").fill("X");
      await page.getByTestId("bootstrap-founder-create-submit").click();
      await expect(
        page.getByTestId("bootstrap-founder-team-setup").getByText(/at least 2 characters/i),
      ).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "04a-founder-name-validation")).screenshots,
      );

      // Happy path
      await page.getByTestId("bootstrap-founder-name-input").fill(founderTeamName);
      await page.getByTestId("bootstrap-founder-abbr-input").fill("CMR");
      await page.getByTestId("bootstrap-founder-division-input").fill("North");
      await page.getByTestId("bootstrap-founder-create-submit").click();

      // Founder panel collapses / disappears once complete
      await expect(page.getByTestId("bootstrap-founder-team-setup")).not.toBeVisible({
        timeout: 12_000,
      });

      // Checklist advances
      await expect(page.getByTestId("bootstrap-progress-overview").getByText(/[1-9]\/\d+ Complete/i).first()).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "04b-founder-team-created")).screenshots,
      );

      // Confirm via API that the commissioner now has a team
      const commCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
      try {
        const authMe = await commCtx.get("/api/auth/me");
        expect(authMe.ok()).toBeTruthy();
        const { actor } = (await authMe.json()) as {
          actor: { leagueRole: string; teamId: string | null } | null;
        };
        expect(actor?.leagueRole).toBe("COMMISSIONER");
        expect(actor?.teamId, "Commissioner should have a teamId after founder setup").toBeTruthy();
      } finally {
        await commCtx.dispose();
      }

      // ── 05  League Members workspace shows slot state ─────────────────────
      await expect(page.getByTestId("league-members-workspace")).toBeVisible();

      // Slot 1 belongs to the commissioner's founder team
      const slot1 = page.getByTestId("team-slot-row-1");
      await expect(slot1).toBeVisible();
      await expect(slot1).toContainText(founderTeamName);

      // Slot 2 should be open
      const slot2 = page.getByTestId("team-slot-row-2");
      await expect(slot2).toBeVisible();
      await expect(page.getByTestId("team-slot-status-2")).toContainText("Open Slot");

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "05-members-workspace")).screenshots,
      );

      // ── 06  Commissioner sends invite via slot table ───────────────────────
      const inviteBtn = slot2.getByTestId("slot-invite-user-btn");
      await expect(inviteBtn).toBeVisible();
      await inviteBtn.click();

      // Invite modal opens
      await expect(page.getByTestId("slot-invite-modal")).toBeVisible();
      await expect(page.getByTestId("slot-invite-team-name-input")).toBeVisible();
      await expect(page.getByTestId("slot-invite-owner-name-input")).toBeVisible();
      await expect(page.getByTestId("slot-invite-owner-email-input")).toBeVisible();

      await page.getByTestId("slot-invite-team-name-input").fill(memberTeamName);
      await page.getByTestId("slot-invite-owner-name-input").fill("Smoke Member");
      await page.getByTestId("slot-invite-owner-email-input").fill(memberEmail);
      await page.getByTestId("slot-invite-submit-btn").click();

      // Modal closes and slot status updates — owner is pre-assigned at invite time
      await expect(page.getByTestId("slot-invite-modal")).not.toBeVisible({ timeout: 8_000 });
      await expect(page.getByTestId("team-slot-status-2")).toContainText(
        /Invite Pending|Invite Created|Owner Joined/i,
        { timeout: 8_000 },
      );

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "06-invite-sent")).screenshots,
      );

      // ── 07  Invited member navigates to invite page and signs in ──────────
      const capturedInvite = await getCapturedLeagueInvite(baseURL, memberEmail, { leagueId });
      expect(capturedInvite.email).toBe(memberEmail);
      expect(capturedInvite.leagueId).toBe(leagueId);

      // Clear cookies — now acting as the invited member
      await page.context().clearCookies();
      await page.goto(capturedInvite.url);

      await expect(page.getByTestId("invite-page")).toBeVisible();
      await expect(page.getByText(leagueName)).toBeVisible();
      await expect(page.getByText(memberTeamName)).toBeVisible();

      // Tap "Sign in" link → lands on /login
      await page.getByTestId("invite-sign-in-link").click();
      await expect(page).toHaveURL(/\/login\?/);

      const inviteReturnTo = `${new URL(capturedInvite.url).pathname}${new URL(capturedInvite.url).search}`;

      await requestAndFollowMagicLink(page, baseURL, memberEmail, inviteReturnTo);

      // Back on the invite page, now authenticated
      await expect(page).toHaveURL(/\/invite\?token=/, { timeout: 12_000 });
      await expect(page.getByTestId("invite-authenticated-email")).toContainText(memberEmail);

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "07-invite-authenticated")).screenshots,
      );

      // ── 08  Member accepts the invite ─────────────────────────────────────
      await expect(page.getByTestId("invite-accept-button")).toBeVisible();
      await page.getByTestId("invite-accept-button").click();

      await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`), { timeout: 15_000 });
      await expect(page.getByTestId("shell-top-bar")).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "08-member-accepted")).screenshots,
      );

      // ── 09  Commissioner re-views workspace — slot shows Owner Joined ──────
      await page.context().clearCookies();
      const commOrigin = await signInWithEmail(page, COMMISSIONER_EMAIL, `/league/${leagueId}`);
      await page.goto(`${commOrigin}/league/${leagueId}`);
      await waitForPageStable(page);

      await expect(page.getByTestId("league-members-workspace")).toBeVisible();
      await expect(page.getByTestId("team-slot-status-2")).toContainText("Owner Joined", {
        timeout: 10_000,
      });

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "09-owner-joined")).screenshots,
      );

      // ── 10  Checklist has progressed ──────────────────────────────────────
      const checklistCollapseReturn = page.getByTestId("bootstrap-checklist-collapse");
      const expandBtnReturn = checklistCollapseReturn.getByRole("button");
      if ((await expandBtnReturn.getAttribute("aria-expanded")) !== "true") {
        await expandBtnReturn.click();
      }
      await expect(page.getByTestId("bootstrap-progress-overview")).toBeVisible();
      // At least founder team + invite-member steps should be complete
      await expect(page.getByTestId("bootstrap-progress-overview").getByText(/[2-9]\/\d+ Complete/i).first()).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "10-checklist-progressed")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await saveSmokeTestSummary(test.info(), {
        specName: "phase-0-new-league-creation",
        status: errors.length > 0 ? "failed" : "passed",
        duration: Date.now() - startTime,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
