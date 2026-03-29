import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("League Workspace Bootstrap", () => {
  test("commissioner can create a new league, invite 12 owners, and start draft flow", async ({
    baseURL,
    page,
  }) => {
    const now = Date.now();
    const leagueName = `E2E 12 Team League ${now}`;
    const draftTitle = `${leagueName} Rookie Draft`;
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "E2E workspace bootstrap verification",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;
    expect(leagueId).toBeTruthy();

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    for (let slot = 1; slot <= 12; slot += 1) {
      const inviteResponse = await scopedCommissioner.post("/api/league/invites", {
        data: {
          ownerName: `Bootstrap Owner ${String(slot).padStart(2, "0")}`,
          ownerEmail: `bootstrap-owner-${slot}-${now}@example.test`,
          teamName: `Bootstrap Team ${String(slot).padStart(2, "0")}`,
          teamAbbreviation: `B${String(slot).padStart(2, "0")}`,
          divisionLabel: slot <= 6 ? "North" : "South",
        },
      });
      expect(inviteResponse.ok()).toBeTruthy();
      const invitePayload = await inviteResponse.json();
      expect(invitePayload.picksCreated).toBe(6);
    }

    const teamsResponse = await scopedCommissioner.get("/api/teams");
    expect(teamsResponse.ok()).toBeTruthy();
    const teamsPayload = await teamsResponse.json();
    expect(teamsPayload.teams).toHaveLength(12);

    const createDraftResponse = await scopedCommissioner.post("/api/drafts", {
      data: {
        type: "ROOKIE",
        title: draftTitle,
      },
    });
    expect(createDraftResponse.ok()).toBeTruthy();
    const createDraftPayload = await createDraftResponse.json();
    const draftId = createDraftPayload.draft.id as string;
    expect(draftId).toBeTruthy();

    const setupDraftResponse = await scopedCommissioner.post("/api/drafts/setup", {
      data: {
        type: "ROOKIE",
        draftId,
        title: draftTitle,
      },
    });
    expect(setupDraftResponse.ok()).toBeTruthy();

    const startDraftResponse = await scopedCommissioner.patch(`/api/drafts/${draftId}`, {
      data: {
        action: "START_DRAFT",
      },
    });
    expect(startDraftResponse.ok()).toBeTruthy();

    const availablePlayersResponse = await scopedCommissioner.get(
      `/api/drafts/${draftId}/players?rostered=false&sortBy=name&sortDir=asc`,
    );
    expect(availablePlayersResponse.ok()).toBeTruthy();
    const availablePlayersPayload = await availablePlayersResponse.json();
    expect(availablePlayersPayload.players.length).toBeGreaterThan(0);

    const firstPickResponse = await scopedCommissioner.post(`/api/drafts/${draftId}/actions/select`, {
      data: {
        playerId: availablePlayersPayload.players[0].id,
      },
    });
    expect(firstPickResponse.ok()).toBeTruthy();
    const firstPickPayload = await firstPickResponse.json();
    expect(firstPickPayload.draft.progress.picksMade).toBe(1);

    const draftBoardResponse = await scopedCommissioner.get(`/api/drafts/${draftId}`);
    expect(draftBoardResponse.ok()).toBeTruthy();
    const draftBoardPayload = await draftBoardResponse.json();
    expect(draftBoardPayload.draft.status).toBe("IN_PROGRESS");
    expect(draftBoardPayload.draft.progress.picksMade).toBe(1);

    await page.setExtraHTTPHeaders({
      "x-dynasty-user-email": COMMISSIONER_EMAIL,
      "x-dynasty-league-id": leagueId,
    });
    await page.goto("/commissioner");
    const advancedOperationsToggle = page.getByTestId("commissioner-advanced-operations-toggle");
    await advancedOperationsToggle.scrollIntoViewIfNeeded();
    if ((await advancedOperationsToggle.getAttribute("aria-expanded")) !== "true") {
      await advancedOperationsToggle.click();
    }
    await expect(page.getByTestId("workspace-active-name")).toHaveText(leagueName);
    await expect(page.getByTestId("workspace-active-team-count")).toHaveText("12");

    await page.goto("/draft/rookie");
    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace" })).toBeVisible();
    await expect(page.getByText("Live Rookie Board")).toBeVisible();
    await expect(page.getByText(draftTitle)).toBeVisible();

    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });

  test("bulk bootstrap endpoint validates malformed rows and applies valid template rows", async ({
    baseURL,
  }) => {
    const now = Date.now();
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const createLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `Bulk Template League ${now}`,
        description: "Bulk bootstrap endpoint coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const malformedTemplate = [
      "ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel",
      `Bad Owner,not-an-email,Bulk Invalid Team ${now},INV1,North`,
      `,bulk-owner-dup-${now}@example.test,Bulk Invalid Team ${now},INV2,South`,
    ].join("\n");

    const validateResponse = await scopedCommissioner.post("/api/teams/bootstrap", {
      data: {
        mode: "validate",
        csvText: malformedTemplate,
      },
    });
    expect(validateResponse.ok()).toBeTruthy();
    const validatePayload = await validateResponse.json();
    expect(validatePayload.summary.totalRows).toBe(2);
    expect(validatePayload.summary.invalidRows).toBe(2);
    expect(validatePayload.rows[0].errors.join(" ")).toContain("valid email");
    expect(validatePayload.rows[1].errors.join(" ")).toContain("Owner name");

    const validEmailOne = `bulk-api-owner-1-${now}@example.test`;
    const validEmailTwo = `bulk-api-owner-2-${now}@example.test`;
    const validTemplate = [
      "ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel",
      `Bulk API Owner One,${validEmailOne},Bulk API Team One ${now},A1${String(now).slice(-2)},North`,
      `Bulk API Owner Two,${validEmailTwo},Bulk API Team Two ${now},A2${String(now).slice(-2)},South`,
    ].join("\n");

    const applyResponse = await scopedCommissioner.post("/api/teams/bootstrap", {
      data: {
        mode: "apply",
        csvText: validTemplate,
      },
    });
    expect(applyResponse.ok()).toBeTruthy();
    const applyPayload = await applyResponse.json();
    expect(applyPayload.summary.totalRows).toBe(2);
    expect(applyPayload.summary.createdRows).toBe(2);
    expect(applyPayload.summary.failedRows).toBe(0);

    const teamsResponse = await scopedCommissioner.get("/api/teams");
    expect(teamsResponse.ok()).toBeTruthy();
    const teamsPayload = await teamsResponse.json();
    expect(teamsPayload.teams).toHaveLength(2);

    const invitesResponse = await scopedCommissioner.get("/api/league/invites");
    expect(invitesResponse.ok()).toBeTruthy();
    const invitesPayload = await invitesResponse.json();
    const inviteEmails = (invitesPayload.invites as Array<{ email: string }>).map((invite) => invite.email);
    expect(inviteEmails).toContain(validEmailOne);
    expect(inviteEmails).toContain(validEmailTwo);

    await scopedCommissioner.dispose();
    await commissioner.dispose();
  });
});
