import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

async function resolveAnyDraftId(commissioner: Awaited<ReturnType<typeof apiContext>>) {
  const draftsResponse = await commissioner.get("/api/drafts");
  expect(draftsResponse.ok()).toBeTruthy();
  const draftsPayload = await draftsResponse.json();
  const existingDraftId = draftsPayload.drafts?.[0]?.id as string | undefined;
  if (existingDraftId) {
    return existingDraftId;
  }

  const createResponse = await commissioner.post("/api/drafts", {
    data: {
      type: "ROOKIE",
      title: `K Support ${Date.now()}`,
    },
  });
  const createPayload = await createResponse.json();

  if (createResponse.ok()) {
    return createPayload.draft.id as string;
  }

  if (createResponse.status() === 409 && createPayload.context?.draftId) {
    return createPayload.context.draftId as string;
  }

  throw new Error("Unable to resolve draft id for K filter coverage.");
}

test.describe("K Position Support", () => {
  test("player domain accepts K in import, API filtering, and UI position filters", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const externalId = `k-support-${Date.now()}`;

    const importResponse = await commissioner.post("/api/players/import", {
      data: {
        format: "json",
        players: [
          {
            externalId,
            name: "K Support Fixture",
            position: "K",
            nflTeam: "KC",
            age: 28,
            yearsPro: 6,
            isRestricted: false,
          },
        ],
      },
    });
    const importText = await importResponse.text();
    let importPayload: unknown = null;
    try {
      importPayload = JSON.parse(importText);
    } catch {
      importPayload = importText;
    }
    if (!importResponse.ok()) {
      throw new Error(`Expected K import to succeed. status=${importResponse.status()} payload=${JSON.stringify(importPayload)}`);
    }
    expect(importPayload).toMatchObject({
      job: {
        id: expect.any(String),
      },
      summary: {
        totalSubmitted: 1,
      },
      totals: {
        normalized: 1,
      },
    });

    const filteredPlayersResponse = await commissioner.get("/api/players?position=K");
    expect(filteredPlayersResponse.ok()).toBeTruthy();
    const filteredPlayersPayload = await filteredPlayersResponse.json();
    expect(filteredPlayersPayload.players.length).toBeGreaterThan(0);
    expect(
      filteredPlayersPayload.players.every((player: { position: string }) => player.position === "K"),
    ).toBeTruthy();

    const draftId = await resolveAnyDraftId(commissioner);
    const draftPlayersResponse = await commissioner.get(`/api/drafts/${draftId}/players?position=K`);
    expect(draftPlayersResponse.ok()).toBeTruthy();
    const draftPlayersPayload = await draftPlayersResponse.json();
    expect(
      draftPlayersPayload.players.every((player: { position: string }) => player.position === "K"),
    ).toBeTruthy();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/players");

    const positionFilter = page.getByTestId("players-filter-position");
    const hasKOption = await positionFilter.evaluate(
      (select) => Array.from((select as HTMLSelectElement).options).some((option) => option.value === "K"),
    );
    expect(hasKOption).toBeTruthy();
    await positionFilter.selectOption("K");

    await expect.poll(
      async () => {
        const values = await page
          .locator('[data-testid="players-standard-table"] tbody tr td:nth-child(2)')
          .allTextContents();
        return values.length > 0 && values.every((value) => value.trim() === "K");
      },
      { timeout: 15_000 },
    ).toBeTruthy();

    await commissioner.dispose();
  });
});
