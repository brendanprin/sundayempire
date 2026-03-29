import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getCapturedLeagueInvite,
  OWNER_EMAIL,
  READ_ONLY_EMAIL,
} from "./helpers/api";

test.describe("Role-Aware Landing Routes", () => {
  test("new-league commissioner can bootstrap teams and invites from league home setup", async ({
    page,
    baseURL,
  }) => {
    const now = Date.now();
    const founderEmail = "noleague@local.league";
    const founderApi = await apiContext(baseURL as string, founderEmail);
    const createLeagueResponse = await founderApi.post("/api/leagues", {
      data: {
        name: `Landing Setup Checklist ${now}`,
        description: "Checklist-first league home coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;
    await founderApi.dispose();

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": founderEmail,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("dashboard-setup-checklist")).toBeVisible();
    await expect(page.getByTestId("dashboard-setup-checklist-progress")).toContainText("0 / 5 complete");
    await expect(page.getByTestId("dashboard-setup-checklist-item-founder-team-status")).toBeVisible();
    await expect(page.getByTestId("commissioner-action-link-setup-primary")).toBeVisible();
    await expect(page.getByTestId("dashboard-first-action-hint")).toBeVisible();
    await expect(page.getByTestId("dashboard-first-action-link")).toBeVisible();
    await expect(page.getByTestId("dashboard-secondary-priority-copy")).toContainText("League Activity");
    await expect(page.getByTestId("dashboard-secondary-recommended-activity")).toBeVisible();
    await expect(page.getByTestId("setup-bootstrap-panel")).toBeVisible();

    const createdTeamName = `Landing Team ${now}`;
    await page.getByTestId("setup-create-team-name").fill(createdTeamName);
    await page.getByTestId("setup-create-team-abbr").fill(`L${String(now).slice(-3)}`);
    await page.getByTestId("setup-create-team-division").fill("North");
    await page.getByTestId("setup-create-team-submit").click();
    await expect(
      page.getByTestId("setup-bootstrap-panel").getByText(`Created team ${createdTeamName}.`),
    ).toBeVisible();

    const invitedEmail = `landing-setup-invite-${now}@example.test`;
    const invitedTeamName = `Landing Invite Team ${now}`;
    await page.getByTestId("setup-invite-owner-name").fill("Landing Invite Owner");
    await page.getByTestId("setup-invite-owner-email").fill(invitedEmail);
    await page.getByTestId("setup-invite-team-name").fill(invitedTeamName);
    await page.getByTestId("setup-invite-team-abbr").fill(`I${String(now).slice(-3)}`);
    await page.getByTestId("setup-invite-division").fill("South");
    await page.getByTestId("setup-invite-submit").click();
    await expect(
      page.getByTestId("setup-bootstrap-panel").getByText("Invited Landing Invite Owner and created"),
    ).toBeVisible();
    await expect(page.getByTestId("workspace-invite-capture-note")).toBeVisible();

    const pendingRow = page.getByTestId("workspace-invite-row").filter({ hasText: invitedEmail }).first();
    await expect(pendingRow).toBeVisible();
    await expect(pendingRow.getByTestId("workspace-invite-status")).toHaveText("Pending");

    await expect(page.getByTestId("dashboard-setup-checklist-progress")).toContainText("2 / 5 complete");
    await expect(page.getByTestId("dashboard-setup-checklist-status-add-teams")).toHaveText("Complete");
    await expect(page.getByTestId("dashboard-setup-checklist-status-invite-members")).toHaveText("Complete");

    const capturedInvite = await getCapturedLeagueInvite(baseURL as string, invitedEmail, {
      leagueId,
    });
    expect(capturedInvite.leagueId).toBe(leagueId);
    expect(capturedInvite.email).toBe(invitedEmail);
  });

  test("founder postpone flow recovers through duplicate and validation failures, then completes", async ({
    page,
    baseURL,
  }) => {
    const now = Date.now();
    const founderEmail = "noleague@local.league";
    const founderApi = await apiContext(baseURL as string, founderEmail);
    const createLeagueResponse = await founderApi.post("/api/leagues", {
      data: {
        name: `Landing Setup Recovery ${now}`,
        description: "Founder postpone and retry coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;
    await founderApi.dispose();

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": founderEmail,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("founder-team-setup-panel")).toBeVisible();
    await page.getByTestId("founder-team-skip").click();
    await expect(page.getByTestId("founder-team-postponed-note")).toBeVisible();
    await expect(page.getByTestId("founder-team-setup-status")).toHaveText("Postponed");
    await expect(page.getByTestId("dashboard-setup-checklist-status-founder-team-status")).toHaveText(
      "Postponed",
    );

    const duplicateTeamName = `Recovery Duplicate ${now}`;
    await page.getByTestId("setup-create-team-name").fill(duplicateTeamName);
    await page.getByTestId("setup-create-team-abbr").fill(`R${String(now).slice(-3)}`);
    await page.getByTestId("setup-create-team-division").fill("Recovery");
    await page.getByTestId("setup-create-team-submit").click();
    await expect(
      page.getByTestId("setup-bootstrap-panel").getByText(`Created team ${duplicateTeamName}.`),
    ).toBeVisible();

    await page.getByTestId("founder-team-create-name-input").fill(duplicateTeamName);
    await page.getByTestId("founder-team-create-abbreviation-input").fill(`F${String(now).slice(-3)}`);
    await page.getByTestId("founder-team-create-submit").click();
    await expect(page.getByTestId("founder-team-setup-panel").getByText("already exists")).toBeVisible();

    const founderScopeAfterDuplicate = await apiContext(baseURL as string, founderEmail, leagueId);
    const authAfterDuplicate = await founderScopeAfterDuplicate.get("/api/auth/me");
    expect(authAfterDuplicate.ok()).toBeTruthy();
    const authAfterDuplicatePayload = await authAfterDuplicate.json();
    expect(authAfterDuplicatePayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authAfterDuplicatePayload.actor?.teamId).toBeNull();

    const founderStateAfterDuplicate = await founderScopeAfterDuplicate.get("/api/league/founder-team");
    expect(founderStateAfterDuplicate.ok()).toBeTruthy();
    const founderStateAfterDuplicatePayload = await founderStateAfterDuplicate.json();
    expect(founderStateAfterDuplicatePayload.founderSetup.status).toBe("INCOMPLETE_POSTPONED");
    await founderScopeAfterDuplicate.dispose();

    const founderRecoveryTeamName = `Recovery Founder ${now}`;
    await page.getByTestId("founder-team-create-name-input").fill(founderRecoveryTeamName);
    await page.getByTestId("founder-team-create-abbreviation-input").fill(`FC${String(now).slice(-2)}`);
    await page.getByTestId("founder-team-create-division-input").fill("Recovery");
    await page.getByTestId("founder-team-create-submit").click();
    await expect(page.getByTestId("founder-team-setup-panel")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-setup-checklist-status-founder-team-status")).toHaveText(
      "Complete",
    );

    await page.getByTestId("setup-invite-owner-name").fill("Recovery Invite Owner");
    await page.getByTestId("setup-invite-owner-email").fill("not-an-email");
    await page.getByTestId("setup-invite-team-name").fill(`Recovery Invite Team ${now}`);
    await page.getByTestId("setup-invite-team-abbr").fill(`IV${String(now).slice(-2)}`);
    await page.getByTestId("setup-invite-submit").click();
    await expect(
      page.getByTestId("setup-bootstrap-panel").getByText("Owner email must be a valid email address."),
    ).toBeVisible();

    const invitedEmail = `landing-recovery-invite-${now}@example.test`;
    await page.getByTestId("setup-invite-owner-name").fill("Recovery Invite Owner");
    await page.getByTestId("setup-invite-owner-email").fill(invitedEmail);
    await page.getByTestId("setup-invite-team-name").fill(`Recovery Invite Team ${now}`);
    await page.getByTestId("setup-invite-team-abbr").fill(`IV${String(now).slice(-2)}`);
    await page.getByTestId("setup-invite-division").fill("South");
    await page.getByTestId("setup-invite-submit").click();
    await expect(
      page.getByTestId("setup-bootstrap-panel").getByText("Invited Recovery Invite Owner and created"),
    ).toBeVisible();

    await page.getByTestId("setup-invite-owner-name").fill("Recovery Invite Owner");
    await page.getByTestId("setup-invite-owner-email").fill(invitedEmail);
    await page.getByTestId("setup-invite-team-name").fill(`Recovery Duplicate Invite Team ${now}`);
    await page.getByTestId("setup-invite-team-abbr").fill(`DU${String(now).slice(-2)}`);
    await page.getByTestId("setup-invite-division").fill("East");
    await page.getByTestId("setup-invite-submit").click();
    await expect(page.getByTestId("setup-bootstrap-panel").getByText("conflicts", { exact: false })).toBeVisible();

    const founderScopeAfterRecovery = await apiContext(baseURL as string, founderEmail, leagueId);
    const authAfterRecovery = await founderScopeAfterRecovery.get("/api/auth/me");
    expect(authAfterRecovery.ok()).toBeTruthy();
    const authAfterRecoveryPayload = await authAfterRecovery.json();
    expect(authAfterRecoveryPayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authAfterRecoveryPayload.actor?.teamId).toBeTruthy();
    await founderScopeAfterRecovery.dispose();
  });

  test("commissioner can validate and apply bulk bootstrap template from setup panel", async ({
    page,
    baseURL,
  }) => {
    const now = Date.now();
    const founderEmail = "noleague@local.league";
    const founderApi = await apiContext(baseURL as string, founderEmail);
    const createLeagueResponse = await founderApi.post("/api/leagues", {
      data: {
        name: `Landing Bulk Bootstrap ${now}`,
        description: "Bulk bootstrap setup panel coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;
    await founderApi.dispose();

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": founderEmail,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("setup-bulk-import-panel")).toBeVisible();
    await expect(page.getByTestId("setup-bulk-template-hint")).toContainText("ownerName");

    await page.getByTestId("setup-bulk-csv-input").fill(
      "ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel\nBad Owner,not-an-email,Bulk Team One,BT1,North",
    );
    await page.getByTestId("setup-bulk-validate-submit").click();
    await expect(page.getByTestId("setup-bulk-summary")).toContainText("0 valid");
    await expect(page.getByTestId("setup-bulk-row-2")).toContainText("valid email");

    const inviteEmailOne = `bulk-owner-1-${now}@example.test`;
    const inviteEmailTwo = `bulk-owner-2-${now}@example.test`;
    await page.getByTestId("setup-bulk-csv-input").fill(
      [
        "ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel",
        `Bulk Owner One,${inviteEmailOne},Bulk Team One ${now},B1${String(now).slice(-2)},North`,
        `Bulk Owner Two,${inviteEmailTwo},Bulk Team Two ${now},B2${String(now).slice(-2)},South`,
      ].join("\n"),
    );
    await page.getByTestId("setup-bulk-validate-submit").click();
    await expect(page.getByTestId("setup-bulk-summary")).toContainText("2 rows");
    await expect(page.getByTestId("setup-bulk-summary")).toContainText("2 valid");
    await expect(page.getByTestId("setup-bulk-apply-submit")).toBeEnabled();

    await page.getByTestId("setup-bulk-apply-submit").click();
    await expect(page.getByTestId("setup-bulk-message")).toContainText("2 created");
    await expect(
      page.getByTestId("workspace-invite-row").filter({ hasText: inviteEmailOne }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("workspace-invite-row").filter({ hasText: inviteEmailTwo }).first(),
    ).toBeVisible();
  });

  test("commissioner root reflects zero/one/many league entry behavior", async ({
    page,
    baseURL,
  }) => {
    const commissionerApi = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leaguesResponse = await commissionerApi.get("/api/leagues");
    expect(leaguesResponse.ok()).toBeTruthy();
    const leaguesPayload = await leaguesResponse.json();
    const leagueCount = (leaguesPayload.leagues as Array<{ id: string }>).length;
    await commissionerApi.dispose();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/");

    if (leagueCount <= 1) {
      await expect(page).toHaveURL(/\/league\/[^/]+$/);
      await expect(page.getByTestId("dashboard-page-eyebrow")).toHaveText("Dashboard");
    } else {
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Choose a League" })).toBeVisible();
    }
  });

  test("owner can reach league home and sees owner action queue", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/");

    await page.waitForLoadState("networkidle");

    if (!/\/league\/[^/]+$/.test(page.url()) && (await page.getByTestId("league-directory-card").count()) > 0) {
      await page.getByTestId("league-directory-card").first().click();
    }

    await expect(page).toHaveURL(/\/league\/[^/]+$/);
    await expect(page.getByTestId("dashboard-page-eyebrow")).toHaveText("Dashboard");
    await expect(page.getByTestId("owner-action-queue")).toBeVisible();
    await expect(page.getByTestId("dashboard-first-action-hint")).toBeVisible();
    await expect(page.getByTestId("dashboard-secondary-priority-copy")).toContainText("Picks & Draft");
    await expect(page.getByTestId("dashboard-secondary-recommended-draft")).toBeVisible();
    await expect(page.getByTestId("dashboard-setup-checklist")).toHaveCount(0);
  });

  test("read-only can access league home without owner or commissioner action queues", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": READ_ONLY_EMAIL });
    await page.goto("/");

    await page.waitForLoadState("networkidle");

    if (!/\/league\/[^/]+$/.test(page.url()) && (await page.getByTestId("league-directory-card").count()) > 0) {
      await page.getByTestId("league-directory-card").first().click();
    }

    await expect(page).toHaveURL(/\/league\/[^/]+$/);
    await expect(page.getByTestId("owner-action-queue")).toHaveCount(0);
    await expect(page.getByTestId("commissioner-action-queue")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-first-action-hint")).toBeVisible();
    await expect(page.getByTestId("dashboard-secondary-priority-copy")).toContainText("League Activity");
    await expect(page.getByTestId("dashboard-secondary-recommended-activity")).toBeVisible();
    await expect(page.getByTestId("dashboard-setup-checklist")).toHaveCount(0);
  });
});
