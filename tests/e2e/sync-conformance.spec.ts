import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, getPrimaryLeagueId } from "./helpers/api";

async function activateLeagueContext(baseURL: string, email: string, leagueId: string) {
  const ctx = await apiContext(baseURL, email);
  const response = await ctx.post("/api/league/context", {
    data: {
      leagueId,
    },
  });
  expect(response.ok()).toBeTruthy();
  await ctx.dispose();
}

test.describe("Sync conformance", () => {
  test("sync queue prioritizes unresolved issues before run-sync controls", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissioner);
    await activateLeagueContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${leagueId}/sync`);

    const priorityQueue = page.getByTestId("sync-priority-queue");
    const issueGroups = page.getByTestId("sync-issue-groups");
    const runSync = page.getByTestId("sync-run-sync");

    await expect(page.getByRole("heading", { name: "Sync Queue" })).toBeVisible();
    await expect(priorityQueue).toBeVisible();
    await expect(issueGroups).toBeVisible();
    await expect(runSync).toBeVisible();
    await expect(issueGroups.getByText(/high impact/i).first()).toBeVisible();

    const [priorityBox, runBox] = await Promise.all([
      priorityQueue.boundingBox(),
      runSync.boundingBox(),
    ]);

    expect(priorityBox).not.toBeNull();
    expect(runBox).not.toBeNull();
    expect((priorityBox?.y ?? 0)).toBeLessThan(runBox?.y ?? 0);

    const groupCount = await page.locator("[data-testid^='sync-issue-group-summary-']").count();
    expect(groupCount).toBeGreaterThan(0);

    await commissioner.dispose();
  });

  test("sync issue detail explains what happened, affected records, and resolution options", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissioner);
    await activateLeagueContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

    const queueResponse = await commissioner.get("/api/sync/issues?status=OPEN");
    expect(queueResponse.ok()).toBeTruthy();
    const queuePayload = (await queueResponse.json()) as {
      issues: Array<{ id: string }>;
    };
    const issueId = queuePayload.issues[0]?.id ?? null;

    if (!issueId) {
      await commissioner.dispose();
      test.skip(true, "No seeded sync issue was available for detail conformance.");
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${leagueId}/sync/${issueId}`);

    await expect(page.getByRole("heading", { name: "Sync Issue Detail" })).toBeVisible();
    await expect(page.getByTestId("sync-issue-what-happened")).toBeVisible();
    await expect(page.getByTestId("sync-issue-record-comparison")).toBeVisible();
    await expect(page.getByTestId("sync-issue-resolution")).toBeVisible();
    await expect(page.getByTestId("sync-issue-affected-records")).toBeVisible();

    await commissioner.dispose();
  });
});
