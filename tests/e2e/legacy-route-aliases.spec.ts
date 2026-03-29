import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

type DraftType = "ROOKIE" | "VETERAN_AUCTION";

type DraftListPayload = {
  drafts: Array<{
    id: string;
    title: string;
    type: DraftType;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  }>;
};

const DRAFT_ALIAS_SCENARIOS: Array<{
  type: DraftType;
  routeSegment: string;
  heading: string;
}> = [
  {
    type: "ROOKIE",
    routeSegment: "rookie",
    heading: "Rookie Draft Workspace",
  },
  {
    type: "VETERAN_AUCTION",
    routeSegment: "veteran-auction",
    heading: "Veteran Auction Workspace",
  },
];

async function ensureDraftOfType(
  baseURL: string,
  type: DraftType,
) {
  const commissioner = await apiContext(baseURL, COMMISSIONER_EMAIL);

  const listResponse = await commissioner.get(`/api/drafts?type=${type}`);
  expect(listResponse.ok()).toBeTruthy();
  const listPayload = (await listResponse.json()) as DraftListPayload;
  const existingDraft = listPayload.drafts.find((draft) => draft.status !== "COMPLETED");

  if (existingDraft) {
    await commissioner.dispose();
    return existingDraft.id;
  }

  const createResponse = await commissioner.post("/api/drafts", {
    data: {
      type,
      title: `Legacy Alias ${type} ${Date.now()}`,
    },
  });
  const createPayload = await createResponse.json();

  if (createResponse.ok()) {
    await commissioner.dispose();
    return createPayload.draft.id as string;
  }

  if (createResponse.status() === 409 && typeof createPayload.context?.draftId === "string") {
    await commissioner.dispose();
    return createPayload.context.draftId as string;
  }

  await commissioner.dispose();
  throw new Error(`Unable to ensure ${type} draft for alias coverage.`);
}

test.describe("Legacy route aliases", () => {
  test("dashboard alias redirects into the canonical league directory root", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/my-leagues");

    await expect(page).toHaveURL(/\/($|league\/[^/]+$)/);
    if (await page.getByTestId("league-directory-page").isVisible().catch(() => false)) {
      await expect(page.getByRole("heading", { name: "Choose a League" })).toBeVisible();
    } else {
      await expect(page.getByTestId("dashboard-page-eyebrow")).toHaveText("Dashboard");
    }
  });

  for (const scenario of DRAFT_ALIAS_SCENARIOS) {
    test(`draft session alias resolves ${scenario.type} into the typed workspace route`, async ({
      page,
      baseURL,
    }) => {
      const draftId = await ensureDraftOfType(baseURL as string, scenario.type);

      await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
      await page.goto(`/draft/session/${draftId}`);

      await expect(page).toHaveURL(new RegExp(`/draft/${scenario.routeSegment}\\?session=${draftId}$`));
      await expect(page.getByRole("heading", { name: scenario.heading, exact: true })).toBeVisible();
    });
  }

  test("startup route redirects into Picks & Draft retirement messaging", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/draft/startup");

    await expect(page).toHaveURL(/\/draft\?startup=retired$/);
    await expect(page.getByTestId("startup-draft-retired-notice")).toBeVisible();
  });

  test("contracts utility route redirects into commissioner contract operations", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/contracts");

    await expect(page).toHaveURL(/\/commissioner\?legacy=contracts#contract-operations$/);
    await expect(page.getByTestId("commissioner-contract-operations")).toBeVisible();
    await expect(page.getByTestId("contracts-retired-notice")).toBeVisible();
  });

  test("pick utility route redirects into draft pick ownership operations", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/picks");

    await expect(page).toHaveURL(/\/draft\?legacy=picks#pick-ownership-operations$/);
    await expect(page.getByTestId("draft-pick-ownership-operations")).toBeVisible();
    await expect(page.getByTestId("picks-retired-notice")).toBeVisible();
  });

  test("legacy draft execution endpoints return explicit retirement errors", async ({ baseURL }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const selectionResponse = await commissioner.post("/api/drafts/not-real-id/selections", {
      data: { playerId: "not-real-player-id" },
    });
    expect(selectionResponse.status()).toBe(410);
    const selectionPayload = await selectionResponse.json();
    expect(selectionPayload.error?.code).toBe("DRAFT_EXECUTION_ROUTE_RETIRED");

    const undoResponse = await commissioner.post("/api/drafts/not-real-id/undo", {
      data: {},
    });
    expect(undoResponse.status()).toBe(410);
    const undoPayload = await undoResponse.json();
    expect(undoPayload.error?.code).toBe("DRAFT_EXECUTION_ROUTE_RETIRED");

    await commissioner.dispose();
  });
});
