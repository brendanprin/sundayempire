/**
 * League Setup — Full Journey
 *
 * End-to-end smoke test covering the full commissioner setup flow from a fresh
 * account through full commissioner dashboard activation. This represents the
 * entire PRESEASON_SETUP phase of the league lifecycle.
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
 *   09  Commissioner returns — slot shows "Owner Joined", checklist at 3/5
 *   10  Commissioner saves rules → "review-settings-rules" completes (4/5)
 *   11  Commissioner generates rookie draft board → "draft-prep-readiness" completes (5/5)
 *   12  Full commissioner dashboard activates — bootstrap wizard is gone
 *   13  Full dashboard phase badge shows "Preseason"
 *   14  Commissioner page shows phase card with current phase
 *   15  Rules page shows the saved version
 *   16  Bulk-invite 10 smoke members; all 12 team slots filled
 *   17  Commissioner starts the rookie draft via UI
 *   18  Commissioner makes the first pick via UI
 *   19  All remaining picks made via API — draft completes
 *   20  Every team has exactly 2 drafted players on their roster
 *   21  Commissioner creates veteran auction + auto-generates player pool
 *   22  Commissioner finalizes the auction pool
 *   23  Commissioner starts the veteran auction
 *   24  Each team places one open bid on a unique pool entry
 *   25  Bid windows expire; sync awards all bidded entries; auction completes
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

test.describe("League Setup — Full Journey", () => {
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

  test("commissioner creates a league, completes setup checklist, full dashboard activates", async ({
    page,
    baseURL,
  }) => {
    // Full journey: league creation + 12-team fill + draft completion takes ~2 min
    test.setTimeout(240_000);

    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    const runId = Date.now();
    const leagueName = `Smoke League ${runId}`;
    const founderTeamName = `Commissioner Franchise ${runId}`;
    const memberEmail = `smoke-member-${runId}@example.test`;
    const memberTeamName = `Member Team ${runId}`;

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      // Cross-step state — declared here so all step callbacks can share them
      let leagueId = "";
      let commOrigin = "";
      let draftId = "";
      let auctionDraftId = "";
      const teamEmailMap = new Map<string, string>();

      // ── Given a fresh commissioner account with no leagues ─────────────────
      await test.step("Given a fresh commissioner account with no leagues", async () => {
        // ── 01  Commissioner signs in ──────────────────────────────────────
        await signInWithEmail(page, COMMISSIONER_EMAIL, "/my-leagues");
        await waitForPageStable(page);
        evidence = await captureSmokeEvidence(page, test.info(), "01-commissioner-signed-in");

        await expect(page.getByTestId("my-leagues-page")).toBeVisible({ timeout: 10_000 });
      });

      // ── When the commissioner creates a new league and founds their team ───
      await test.step("When the commissioner creates a new league and founds their team", async () => {
        // ── 02  Create a new league ────────────────────────────────────────
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
          "Smoke — full setup journey from new league through commissioner dashboard activation.",
        );
        await page.getByTestId("league-create-next-review").click();
        await page.getByTestId("league-create-submit-button").click();

        await expect(page).toHaveURL(/\/league\/[^/]+$/, { timeout: 20_000 });
        leagueId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
        expect(leagueId, "League ID must be present in URL after creation").toBeTruthy();

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "02-league-created")).screenshots,
        );

        // ── 03  Bootstrap dashboard loads ──────────────────────────────────
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

        // ── 04  Commissioner creates their founder team ────────────────────
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

        // ── 05  League Members workspace shows slot state ──────────────────
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
      });

      // ── When a member accepts the commissioner's invite ────────────────────
      await test.step("When a member accepts the commissioner's invite", async () => {
        // ── 06  Commissioner sends invite via slot table ───────────────────
        const slot2 = page.getByTestId("team-slot-row-2");
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

        // ── 07  Invited member navigates to invite page and signs in ────────
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

        // ── 08  Member accepts the invite ──────────────────────────────────
        await expect(page.getByTestId("invite-accept-button")).toBeVisible();
        await page.getByTestId("invite-accept-button").click();

        await expect(page).toHaveURL(new RegExp(`/league/${leagueId}$`), { timeout: 15_000 });
        await expect(page.getByTestId("shell-top-bar")).toBeVisible();

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "08-member-accepted")).screenshots,
        );

        // ── 09  Commissioner returns — "Owner Joined", checklist at 3/5 ────
        await page.context().clearCookies();
        // Brief pause lets the server-side session fully flush before re-auth
        await page.waitForTimeout(300);
        commOrigin = await signInWithEmail(page, COMMISSIONER_EMAIL, `/league/${leagueId}`);
        await page.goto(`${commOrigin}/league/${leagueId}`);
        await waitForPageStable(page);

        await expect(page.getByTestId("league-members-workspace")).toBeVisible();
        await expect(page.getByTestId("team-slot-status-2")).toContainText("Owner Joined", {
          timeout: 10_000,
        });

        // Expand checklist and confirm partial progress (founder, add-teams, invite-members done)
        const checklistCollapseReturn = page.getByTestId("bootstrap-checklist-collapse");
        const expandBtnReturn = checklistCollapseReturn.getByRole("button");
        if ((await expandBtnReturn.getAttribute("aria-expanded")) !== "true") {
          await expandBtnReturn.click();
        }
        await expect(
          page.getByTestId("bootstrap-progress-overview").getByText(/[2-9]\/\d+ Complete/i).first(),
        ).toBeVisible();
        // Bootstrap dashboard is still showing — setup not yet complete
        await expect(page.getByTestId("league-bootstrap-dashboard")).toBeVisible();

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "09-owner-joined-checklist-partial")).screenshots,
        );
      });

      // ── When the commissioner completes setup ──────────────────────────────
      await test.step("When the commissioner completes setup: saves rules and generates draft board", async () => {
        // ── 10  Commissioner saves rules → "review-settings-rules" completes
        await page.goto(`${commOrigin}/rules`);
        await waitForPageStable(page);
        await expect(page.getByTestId("rules-deadlines-view")).toBeVisible({ timeout: 10_000 });

        // Change the notes field so the PATCH creates a new version (no-op saves are skipped)
        const notesInput = page.getByTestId("rules-notes-input");
        await expect(notesInput).toBeVisible({ timeout: 8_000 });
        await notesInput.fill(`Smoke review — run ${runId}`);

        await page.getByTestId("rules-save-btn").click();

        // Success message confirms a new version was written
        await expect(page.getByText(/Ruleset v\d+ is now active/i)).toBeVisible({ timeout: 10_000 });

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "10-rules-saved")).screenshots,
        );

        // ── 11  Commissioner generates rookie draft board ──────────────────
        await page.goto(`${commOrigin}/draft/rookie`);
        await waitForPageStable(page);
        await expect(page.getByTestId("rookie-draft-workspace")).toBeVisible({ timeout: 10_000 });

        const generateBtn = page.getByTestId("rookie-draft-generate-board-btn");
        await expect(generateBtn).toBeVisible();
        await generateBtn.click();

        // Board should populate — slot count changes from 0 to N
        await expect(page.getByTestId("rookie-draft-slot-count")).not.toContainText("0 slots", {
          timeout: 15_000,
        });

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "11-draft-board-generated")).screenshots,
        );
      });

      // ── Then the full commissioner dashboard activates ─────────────────────
      await test.step("Then the full commissioner dashboard activates", async () => {
        // ── 12  Full dashboard activates — bootstrap wizard is gone ────────
        await page.goto(`${commOrigin}/league/${leagueId}`);
        await waitForPageStable(page);

        await expect(page.getByTestId("league-landing-dashboard")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId("league-bootstrap-dashboard")).not.toBeVisible();

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "12-full-dashboard-active")).screenshots,
        );

        // ── 13  Phase badge shows "Preseason" ──────────────────────────────
        await expect(page.getByTestId("league-landing-phase-badge")).toBeVisible();
        await expect(page.getByTestId("league-landing-phase-badge")).toContainText(/Preseason/i);

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "13-phase-badge")).screenshots,
        );

        // ── 14  Commissioner page shows current phase ──────────────────────
        await page.goto(`${commOrigin}/commissioner`);
        await waitForPageStable(page);

        // Phase card lives in the "Deep Operations" tab
        await page.getByTestId("commissioner-tab-operations").click();
        await expect(page.getByTestId("commissioner-routine-phase-card")).toBeVisible({
          timeout: 10_000,
        });
        await expect(page.getByTestId("commissioner-routine-phase-card")).toContainText(/preseason/i);

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "14-commissioner-phase-card")).screenshots,
        );

        // ── 15  Rules page shows the saved version ─────────────────────────
        await page.goto(`${commOrigin}/rules`);
        await waitForPageStable(page);

        await expect(page.getByTestId("rules-deadlines-view")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId("rules-deadlines-view")).toContainText(/v\d+.*Active/i);

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "15-rules-page")).screenshots,
        );
      });

      // ── When all 12 team slots are filled ─────────────────────────────────
      await test.step("When all 12 team slots are filled", async () => {
        // ── 16  Fill remaining 10 slots via API ───────────────────────────
        // We've proven the full invite UI flow in steps 06-08. For the remaining
        // slots we drive through the API so the test stays fast. These users are
        // pre-seeded with no league memberships and accept via legacy header auth.
        const smokeMembers = Array.from({ length: 10 }, (_, i) => {
          const n = String(i + 1).padStart(2, "0");
          return { email: `smoke-member-${n}@local.league`, name: `Smoke Member ${n}`, abbr: `S${n}` };
        });

        const bulkCommCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          for (const member of smokeMembers) {
            const inviteRes = await bulkCommCtx.post("/api/league/invites", {
              data: {
                ownerName: member.name,
                ownerEmail: member.email,
                teamName: `${member.name} FC`,
                teamAbbreviation: member.abbr,
              },
            });
            expect(inviteRes.status(), `Invite created for ${member.email}`).toBe(201);

            const captured = await getCapturedLeagueInvite(baseURL, member.email, { leagueId });
            const token = new URL(captured.url).searchParams.get("token") ?? "";
            expect(token, `Invite token present for ${member.email}`).toBeTruthy();

            const memberCtx = await apiContext(baseURL, member.email);
            try {
              const acceptRes = await memberCtx.post("/api/league/invites/accept", {
                data: { token },
              });
              expect(acceptRes.status(), `Invite accepted by ${member.email}`).toBe(200);
            } finally {
              await memberCtx.dispose();
            }
          }
        } finally {
          await bulkCommCtx.dispose();
        }

        // Verify via API: all 12 slots are now occupied
        const verifyCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const teamsRes = await verifyCtx.get("/api/teams");
          expect(teamsRes.ok()).toBeTruthy();
          const { teams } = (await teamsRes.json()) as { teams: unknown[] };
          expect(teams.length, "League should have 12 teams after bulk fill").toBe(12);
        } finally {
          await verifyCtx.dispose();
        }

        // Regenerate the draft board so it includes all 12 teams.
        // The board from step 11 only had 2 teams — the 10 smoke members joined
        // after generation, so we must regenerate before starting the draft.
        const regenCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const regenRes = await regenCtx.post("/api/drafts/setup", {
            data: { type: "ROOKIE", regenerate: true },
          });
          expect(
            regenRes.ok(),
            `Draft board regeneration should succeed (status ${regenRes.status()})`,
          ).toBeTruthy();
        } finally {
          await regenCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "16-all-slots-filled")).screenshots,
        );
      });

      // ── When the commissioner starts the rookie draft and makes the first pick
      await test.step("When the commissioner starts the rookie draft and makes the first pick", async () => {
        // ── 17  Commissioner starts the rookie draft ───────────────────────
        // Board was regenerated above to include all 12 teams. Navigate to the
        // workspace where the "Start Rookie Draft" button should be available.
        await page.goto(`${commOrigin}/draft/rookie`);
        await waitForPageStable(page);
        await expect(page.getByTestId("rookie-draft-workspace")).toBeVisible({ timeout: 10_000 });

        const startDraftBtn = page.getByRole("button", { name: "Start Rookie Draft" });
        await expect(startDraftBtn).toBeVisible({ timeout: 10_000 });
        await startDraftBtn.click();

        // Poll until the draft enters IN_PROGRESS, then capture the draft ID
        const draftPollCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          await expect
            .poll(
              async () => {
                const res = await draftPollCtx.get("/api/drafts?type=ROOKIE");
                const payload = (await res.json()) as {
                  drafts: Array<{ id: string; status: string }>;
                };
                const active = payload.drafts.find((d) => d.status === "IN_PROGRESS");
                draftId = active?.id ?? "";
                return draftId;
              },
              { timeout: 15_000, message: "Expected rookie draft to enter IN_PROGRESS." },
            )
            .not.toBe("");
        } finally {
          await draftPollCtx.dispose();
        }

        // Navigate to the session path so the workspace loads the live room
        await page.goto(`${commOrigin}/draft/rookie?session=${encodeURIComponent(draftId)}`);
        await waitForPageStable(page);
        await expect(page.getByTestId("rookie-draft-room-status")).toBeVisible({ timeout: 15_000 });

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "17-draft-room-live")).screenshots,
        );

        // ── 18  Commissioner makes the first pick ──────────────────────────
        // Click the first available prospect in the pool and submit the pick.
        // The commissioner always has override access regardless of which team is
        // currently on the clock.
        const firstProspect = page.locator('tr[role="button"][aria-label^="Select "]').first();
        await firstProspect.scrollIntoViewIfNeeded();
        await expect(firstProspect).toBeVisible({ timeout: 10_000 });
        await firstProspect.click();

        const makePickBtn = page
          .getByRole("button", { name: /^(Make Pick:|Commissioner Pick:)/ })
          .first();
        await expect(makePickBtn).toBeEnabled({ timeout: 10_000 });
        await makePickBtn.click();

        // Poll API until the pick is recorded
        const pickVerifyCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          await expect
            .poll(
              async () => {
                const res = await pickVerifyCtx.get(`/api/drafts/${draftId}`);
                const payload = (await res.json()) as {
                  draft: { progress: { picksMade: number } };
                };
                return payload.draft.progress.picksMade;
              },
              { timeout: 15_000, message: "Expected first rookie draft pick to be recorded." },
            )
            .toBe(1);
        } finally {
          await pickVerifyCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "18-first-pick-made")).screenshots,
        );
      });

      // ── When all remaining picks are made and the draft completes ──────────
      await test.step("When all remaining picks are made and the draft completes", async () => {
        // ── 19  Every team makes their real picks until the draft completes ──
        // Build a teamId → email lookup from the teams list. Each team's
        // abbreviation maps to its owner email:
        //   "CMR"       → commissioner
        //   "S01"–"S10" → smoke-member-01 … smoke-member-10
        //   name match  → the invited member from step 06–08
        const teamMapCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const teamsRes = await teamMapCtx.get("/api/teams");
          const { teams } = (await teamsRes.json()) as {
            teams: Array<{ id: string; name: string; abbreviation: string | null }>;
          };
          for (const t of teams) {
            const abbr = t.abbreviation ?? "";
            if (abbr === "CMR") {
              teamEmailMap.set(t.id, COMMISSIONER_EMAIL);
            } else if (/^S\d{2}$/.test(abbr)) {
              // "S01" → "smoke-member-01@local.league"
              const num = abbr.slice(1); // "01"
              teamEmailMap.set(t.id, `smoke-member-${num}@local.league`);
            } else if (t.name === memberTeamName) {
              teamEmailMap.set(t.id, memberEmail);
            }
          }
        } finally {
          await teamMapCtx.dispose();
        }

        // Loop: poll the room endpoint to find who's on the clock, then pick for them.
        // Each iteration uses a fresh apiContext scoped to the selecting team's email
        // so the server validates the correct actor is making the selection.
        let draftDone = false;
        const MAX_PICKS = 200; // safety cap — well above any realistic total
        for (let attempt = 0; attempt < MAX_PICKS && !draftDone; attempt++) {
          // Fetch the live room as commissioner (they can always read the board)
          const roomCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
          let selectingTeamId: string | null = null;
          let availablePlayerId: string | null = null;
          let draftStatus = "IN_PROGRESS";
          try {
            const roomRes = await roomCtx.get(`/api/drafts/${draftId}/room`);
            expect(roomRes.ok(), "Room endpoint should respond OK").toBeTruthy();
            const roomPayload = (await roomRes.json()) as {
              draft: { status: string };
              currentPick: { selectingTeam: { id: string } } | null;
              availablePlayers: Array<{ id: string }>;
            };
            draftStatus = roomPayload.draft.status;
            selectingTeamId = roomPayload.currentPick?.selectingTeam?.id ?? null;
            availablePlayerId = roomPayload.availablePlayers[0]?.id ?? null;
          } finally {
            await roomCtx.dispose();
          }

          if (draftStatus === "COMPLETED") {
            draftDone = true;
            break;
          }

          expect(
            selectingTeamId,
            `Pick ${attempt + 2}: draft is IN_PROGRESS but no team is on the clock`,
          ).toBeTruthy();
          expect(
            availablePlayerId,
            `Pick ${attempt + 2}: no available players remaining`,
          ).toBeTruthy();

          const pickerEmail = teamEmailMap.get(selectingTeamId!);
          expect(
            pickerEmail,
            `No email mapping for team ${selectingTeamId} — check abbreviation seed data`,
          ).toBeTruthy();

          // Make the pick as the team that's on the clock
          const pickCtx = await apiContext(baseURL, pickerEmail!, leagueId);
          try {
            const pickRes = await pickCtx.post(`/api/drafts/${draftId}/actions/select`, {
              data: { playerId: availablePlayerId! },
            });
            expect(pickRes.ok(), `Pick ${attempt + 2} by ${pickerEmail} should succeed`).toBeTruthy();
          } finally {
            await pickCtx.dispose();
          }
        }

        // Final confirmation: draft must be COMPLETED
        const finalCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const finalRes = await finalCtx.get(`/api/drafts/${draftId}`);
          const finalPayload = (await finalRes.json()) as {
            draft: { status: string; progress: { picksMade: number; totalPicks: number } };
          };
          expect(finalPayload.draft.status, "Draft should be COMPLETED after all picks").toBe(
            "COMPLETED",
          );
          expect(finalPayload.draft.progress.picksMade).toBe(finalPayload.draft.progress.totalPicks);
        } finally {
          await finalCtx.dispose();
        }

        // Confirm the UI reflects the completed draft — after completion the setup
        // projection no longer returns the draft (it filters to NOT_STARTED/IN_PROGRESS),
        // so the workspace shows the setup view ready for a future draft session.
        await page.reload();
        await waitForPageStable(page);
        await expect(page.getByTestId("rookie-draft-workspace")).toBeVisible({ timeout: 10_000 });

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "19-draft-completed")).screenshots,
        );
      });

      // ── Then every team has exactly 2 drafted players on their roster ──────
      await test.step("Then every team has exactly 2 drafted players on their roster", async () => {
        // ── 20  Verify every team received their drafted players ───────────
        // The rookie selection service creates a contract + rosterSlot for each
        // pick. In a 2-round, 12-team draft every team should have exactly 2
        // players on their roster from draft adds.
        const rosterCheckCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const teamsRes = await rosterCheckCtx.get("/api/teams");
          expect(teamsRes.ok(), "Teams list should be accessible").toBeTruthy();
          const { teams } = (await teamsRes.json()) as { teams: Array<{ id: string; name: string }> };
          expect(teams.length, "Expected 12 teams in the league").toBe(12);

          for (const team of teams) {
            const rosterRes = await rosterCheckCtx.get(`/api/teams/${team.id}/roster`);
            expect(rosterRes.ok(), `Roster for ${team.name} should be accessible`).toBeTruthy();
            const rosterPayload = (await rosterRes.json()) as {
              rosterSlots: Array<{ player: { id: string; name: string } | null }>;
            };
            const filledSlots = rosterPayload.rosterSlots.filter((s) => s.player !== null);
            expect(
              filledSlots.length,
              `${team.name} should have 2 drafted players on their roster (one per round)`,
            ).toBe(2);
          }
        } finally {
          await rosterCheckCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "20-rosters-populated")).screenshots,
        );
      });

      // ── When the commissioner creates and starts the veteran auction ────────
      await test.step("When the commissioner creates and starts the veteran auction", async () => {
        // ── 21  Create veteran auction + generate pool ─────────────────────
        // The pool is auto-generated from all eligible (non-rostered) players.
        // We set a 2-second open-bid window and a 5-second overall end time so the
        // auction resolves within the test without any real waiting.
        const auctionEndsAt = new Date(Date.now() + 5_000).toISOString();
        const setupCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const setupRes = await setupCtx.post("/api/drafts/setup", {
            data: {
              type: "VETERAN_AUCTION",
              auctionOpenBidWindowSeconds: 2,
              auctionBidResetSeconds: 2,
              auctionEndsAt,
            },
          });
          expect(setupRes.ok(), `Veteran auction setup should succeed: ${await setupRes.text()}`).toBeTruthy();
          const setupPayload = (await setupRes.json()) as {
            setup: { draft: { id: string } | null };
          };
          auctionDraftId = setupPayload.setup.draft?.id ?? "";
          expect(auctionDraftId, "Veteran auction draft id should be set").toBeTruthy();
        } finally {
          await setupCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "21-auction-pool-generated")).screenshots,
        );

        // ── 22  Finalize the auction pool ──────────────────────────────────
        // Finalizing locks the pool and allows the auction to be started.
        const finalizeCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const finalizeRes = await finalizeCtx.post("/api/drafts/setup", {
            data: {
              type: "VETERAN_AUCTION",
              draftId: auctionDraftId,
              finalizePool: true,
            },
          });
          expect(finalizeRes.ok(), `Finalize pool should succeed: ${await finalizeRes.text()}`).toBeTruthy();
        } finally {
          await finalizeCtx.dispose();
        }

        // ── 23  Start the veteran auction ──────────────────────────────────
        const startAuctionCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const startRes = await startAuctionCtx.patch(`/api/drafts/${auctionDraftId}`, {
            data: { action: "START_DRAFT" },
          });
          expect(startRes.ok(), `Start veteran auction should succeed: ${await startRes.text()}`).toBeTruthy();
          const startPayload = (await startRes.json()) as { draft: { status: string } };
          expect(startPayload.draft.status, "Auction should be IN_PROGRESS after start").toBe("IN_PROGRESS");
        } finally {
          await startAuctionCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "23-auction-started")).screenshots,
        );
      });

      // ── When each team places a bid and the auction syncs to completion ────
      await test.step("When each team places a bid and the auction syncs to completion", async () => {
        // ── 24  Each team places a bid on a unique pool entry ──────────────
        // Commissioner bids on behalf of each team (one entry per team) at $1 / 1 year.
        // We fetch the pool from the auction room and assign one entry per team.
        const roomForBidsCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const roomRes = await roomForBidsCtx.get(`/api/drafts/${auctionDraftId}/auction-room`);
          expect(roomRes.ok(), "Auction room should load for bid assignment").toBeTruthy();
          const roomPayload = (await roomRes.json()) as {
            entries: Array<{ id: string; status: string }>;
          };

          // Get the list of team IDs in the same order as teamEmailMap entries
          const teamIds = [...teamEmailMap.keys()];
          expect(teamIds.length, "Expected 12 teams for bid assignment").toBe(12);

          // Assign one entry per team (take the first 12 ELIGIBLE entries)
          const eligibleEntries = roomPayload.entries
            .filter((e) => e.status === "ELIGIBLE")
            .slice(0, teamIds.length);
          expect(
            eligibleEntries.length,
            `Need at least ${teamIds.length} eligible pool entries to bid`,
          ).toBeGreaterThanOrEqual(teamIds.length);

          for (let i = 0; i < teamIds.length; i++) {
            const teamId = teamIds[i]!;
            const entry = eligibleEntries[i]!;
            const bidRes = await roomForBidsCtx.post(`/api/drafts/${auctionDraftId}/auction/open-bids`, {
              data: {
                poolEntryId: entry.id,
                salaryAmount: 1,
                contractYears: 1,
                teamId,
              },
            });
            expect(
              bidRes.ok(),
              `Bid for team ${teamId} on entry ${entry.id} should succeed: ${await bidRes.text()}`,
            ).toBeTruthy();
          }
        } finally {
          await roomForBidsCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "24-bids-placed")).screenshots,
        );

        // ── 25  Wait for bid windows to close, sync, verify auction completes
        // Sleep past the 2-second open bid window and the 5-second auctionEndsAt.
        // Sync awards all entries with bids and expires the rest.
        await page.waitForTimeout(6_000);

        let auctionCompleted = false;
        const MAX_SYNCS = 5;
        for (let attempt = 0; attempt < MAX_SYNCS && !auctionCompleted; attempt++) {
          const syncCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
          try {
            const syncRes = await syncCtx.post(`/api/drafts/${auctionDraftId}/auction/status/sync`);
            expect(syncRes.ok(), `Auction sync should succeed: ${await syncRes.text()}`).toBeTruthy();
            const syncPayload = (await syncRes.json()) as {
              ok: boolean;
              summary: { completed: boolean; awardsCreated: number; expiredCount: number };
            };
            if (syncPayload.summary.completed) {
              auctionCompleted = true;
            }
          } finally {
            await syncCtx.dispose();
          }
          if (!auctionCompleted) {
            await page.waitForTimeout(1_000);
          }
        }

        expect(auctionCompleted, "Veteran auction should be COMPLETED after sync").toBeTruthy();

        // Verify each team that placed a bid received an awarded player
        const awardCheckCtx = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
        try {
          const auctionDraftRes = await awardCheckCtx.get(`/api/drafts/${auctionDraftId}`);
          expect(auctionDraftRes.ok(), "Auction draft detail should be accessible").toBeTruthy();
          const auctionDraftPayload = (await auctionDraftRes.json()) as {
            draft: { status: string };
          };
          expect(
            auctionDraftPayload.draft.status,
            "Veteran auction draft status should be COMPLETED",
          ).toBe("COMPLETED");
        } finally {
          await awardCheckCtx.dispose();
        }

        evidence.screenshots.push(
          ...(await captureSmokeEvidence(page, test.info(), "25-auction-completed")).screenshots,
        );
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await saveSmokeTestSummary(test.info(), {
        specName: "league-setup-full-journey",
        status: errors.length > 0 ? "failed" : "passed",
        duration: Date.now() - startTime,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
