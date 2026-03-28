import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getTeams,
  OWNER_EMAIL,
} from "./helpers/api";

async function ownerTeamContext(baseURL: string) {
  const owner = await apiContext(baseURL, OWNER_EMAIL);
  const ownerTeams = await getTeams(owner);
  expect(ownerTeams.length).toBeGreaterThan(0);
  const team = ownerTeams[0];
  return {
    owner,
    team,
  };
}

test.describe("Persona Wave D Remaining Stories", () => {
  test("PERS-JORDAN-1: lineup lock assistant ranks risky starters with legal pivots", async ({
    page,
    baseURL,
  }) => {
    const { owner, team } = await ownerTeamContext(baseURL as string);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${team.id}?lineupLockInHours=1`);

    const assistant = page.getByTestId("lineup-lock-assistant");
    await expect(assistant).toBeVisible();
    await expect(assistant).toContainText("Lineup Lock Assistant");
    await expect.poll(async () => assistant.getByTestId("lineup-risk-item").count()).toBeGreaterThan(0);

    await owner.dispose();
  });

  test("PERS-CHRIS-1: draft room shows tier overlays with pick ownership context", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/draft/rookie");

    await page.getByPlaceholder("2026 Rookie Draft").fill(`Persona Draft ${Date.now()}`);
    await page.getByRole("button", { name: "Create Draft Session" }).click();

    const overlay = page.getByTestId("draft-tiered-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.getByTestId("draft-scarcity-indicator")).toHaveCount(6);
    await expect(overlay.getByTestId("draft-pick-ownership-context")).toBeVisible();

    const tierProspectButton = overlay.getByTestId("draft-tier-player-option").first();
    await expect(tierProspectButton).toBeVisible();
    await tierProspectButton.click();
    await expect(page.getByTestId("draft-impact-selected-prospect")).toContainText("Tier");
  });

  test("PERS-MORGAN-1: owner remediation transitions to pending review and commissioner sees evidence", async ({
    page,
    baseURL,
  }) => {
    const { owner, team } = await ownerTeamContext(baseURL as string);
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${team.id}`);

    await page.evaluate(({ teamId, teamName }) => {
      const storageKey = "dynasty:compliance:remediation:v1";
      const raw = window.localStorage.getItem(storageKey);
      const existing = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
      const nowIso = new Date().toISOString();
      const seededRecord = {
        id: `seeded:${teamId}:PERS-MORGAN-1`,
        teamId,
        teamName,
        ruleCode: "CAP_SOFT_EXCEEDED",
        message: "Seeded assigned finding for guided remediation workflow.",
        severity: "warning",
        dueAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
        acknowledgedAt: null,
        status: "Assigned",
        steps: [
          {
            id: `seeded:${teamId}:step:1`,
            label: "Review cap context and choose remediation move.",
            completed: false,
            completedAt: null,
          },
          {
            id: `seeded:${teamId}:step:2`,
            label: "Apply remediation action and verify cap totals.",
            completed: false,
            completedAt: null,
          },
          {
            id: `seeded:${teamId}:step:3`,
            label: "Re-run compliance and prepare evidence for review.",
            completed: false,
            completedAt: null,
          },
        ],
        updatedAt: nowIso,
      };

      const filtered = existing.filter((record) => {
        if (!record || typeof record !== "object") return true;
        return (record as { id?: string }).id !== seededRecord.id;
      });
      window.localStorage.setItem(storageKey, JSON.stringify([seededRecord, ...filtered]));
    }, { teamId: team.id, teamName: team.name });

    await page.reload();

    const workflow = page.getByTestId("remediation-workflow");
    await expect(workflow).toBeVisible();
    const firstRecord = workflow.getByTestId("remediation-record").first();
    await expect(firstRecord).toBeVisible();

    const stepToggles = firstRecord.getByTestId("remediation-step-toggle");
    const stepCount = await stepToggles.count();
    expect(stepCount).toBeGreaterThan(0);
    for (let index = 0; index < stepCount; index += 1) {
      await stepToggles.nth(index).check();
    }
    await firstRecord.getByTestId("remediation-ack-toggle").check();
    await expect(firstRecord.getByTestId("remediation-status")).toContainText("Pending review");

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");
    const evidence = page.getByTestId("commissioner-remediation-evidence");
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText("Pending review");
    await expect(evidence).toContainText(team.name);

    await owner.dispose();
  });

  test("PERS-RILEY-2: orphan strategy selector creates a tailored 4-week plan", async ({
    page,
    baseURL,
  }) => {
    const { owner, team } = await ownerTeamContext(baseURL as string);
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${team.id}?orphan=1`);

    const strategySelector = page.getByTestId("strategy-path-selector");
    await expect(strategySelector).toBeVisible();
    await expect(strategySelector.getByTestId("strategy-path-option")).toHaveCount(2);
    await strategySelector.getByTestId("strategy-path-option").first().click();

    const actionPlan = page.getByTestId("strategy-action-plan");
    await expect(actionPlan).toBeVisible();
    await expect(actionPlan).toContainText("Week 1");
    await expect(actionPlan).toContainText("Week 4");

    await owner.dispose();
  });

  test("PERS-CASEY-1: dashboard shows top 3 weekly actions above other owner content", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/");

    if (await page.getByTestId("league-directory-page").isVisible().catch(() => false)) {
      await page.getByTestId("league-directory-card").first().click();
    }

    await expect(page).toHaveURL(/\/league\/[^/]+$/);

    const digest = page.getByTestId("dashboard-top-3-digest");
    await expect(digest).toBeVisible();
    const actionLinks = digest.getByTestId("dashboard-top-3-action-link");
    const count = await actionLinks.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
    await expect(actionLinks.first()).toHaveAttribute("href", /.+/);
  });
});
