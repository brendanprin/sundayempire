import { APIRequestContext, expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

type DraftSummary = {
  id: string;
  title: string;
  type: "ROOKIE" | "VETERAN_AUCTION";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
};

async function createOrReuseActiveDraft(
  commissioner: Awaited<ReturnType<typeof apiContext>>,
  titlePrefix: string,
) {
  const draftTypes = ["VETERAN_AUCTION", "ROOKIE"] as const;
  const uniqueSuffix = Date.now();

  for (const draftType of draftTypes) {
    const createResponse = await commissioner.post("/api/drafts", {
      data: {
        type: draftType,
        title: `${titlePrefix} ${draftType} ${uniqueSuffix}`,
      },
    });
    const createPayload = await createResponse.json();

    let draftId: string | null = null;
    let draftTitle = `${titlePrefix} ${draftType} ${uniqueSuffix}`;

    if (createResponse.ok()) {
      draftId = createPayload.draft.id as string;
      draftTitle = createPayload.draft.title as string;
    } else if (createResponse.status() === 409 && createPayload.context?.draftId) {
      draftId = createPayload.context.draftId as string;
      draftTitle = (createPayload.context.draftTitle as string) || draftTitle;
    }

    if (!draftId) {
      continue;
    }

    const startResponse = await commissioner.patch(`/api/drafts/${draftId}`, {
      data: {
        action: "START_DRAFT",
      },
    });
    if (!startResponse.ok() && startResponse.status() !== 409) {
      throw new Error(`Failed to start draft ${draftId}`);
    }

    return { draftId, draftTitle };
  }

  const listResponse = await commissioner.get("/api/drafts");
  expect(listResponse.ok()).toBeTruthy();
  const listPayload = await listResponse.json();
  const fallback = (listPayload.drafts as DraftSummary[]).find((draft) => draft.status !== "COMPLETED");
  expect(fallback).toBeTruthy();
  if (!fallback) {
    throw new Error("Expected at least one non-completed draft.");
  }
  return { draftId: fallback.id, draftTitle: fallback.title };
}

async function readCurrentPickIndex(commissioner: APIRequestContext, draftId: string) {
  const detailResponse = await commissioner.get(`/api/drafts/${draftId}`);
  expect(detailResponse.ok()).toBeTruthy();
  const detailPayload = await detailResponse.json();
  return detailPayload.draft.currentPickIndex as number;
}

test.describe("Draft Split View and Cut Simulation", () => {
  test("draft board and impact context remain visible while submitting from context panel", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const draft = await createOrReuseActiveDraft(commissioner, "SplitView");

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/draft/session/${draft.draftId}`);

    const boardPanel = page.getByTestId("draft-board-panel");
    const impactPanel = page.getByTestId("draft-impact-context-panel");
    await expect(boardPanel).toBeVisible();
    await expect(impactPanel).toBeVisible();

    const playerSelect = page.getByTestId("draft-impact-player-select");
    await expect(playerSelect).toBeVisible();
    await expect
      .poll(async () => playerSelect.locator("option:not([value=''])").count(), { timeout: 15000 })
      .toBeGreaterThan(0);

    let selectedPlayerValue = await playerSelect.inputValue();
    if (!selectedPlayerValue) {
      const fallbackOption = playerSelect.locator("option:not([value=''])").first();
      await expect(fallbackOption).toBeVisible();
      const fallbackValue = await fallbackOption.getAttribute("value");
      expect(fallbackValue).toBeTruthy();
      await playerSelect.selectOption(fallbackValue ?? "");
      selectedPlayerValue = fallbackValue ?? "";
    }

    expect(selectedPlayerValue.length).toBeGreaterThan(0);

    const pickIndexBeforeSubmit = await readCurrentPickIndex(commissioner, draft.draftId);

    await page.getByTestId("draft-impact-submit").click();
    await expect(page.getByTestId("draft-impact-submit")).toHaveText("Draft From Context Panel", {
      timeout: 15000,
    });
    await expect
      .poll(async () => readCurrentPickIndex(commissioner, draft.draftId), { timeout: 15000 })
      .toBeGreaterThan(pickIndexBeforeSubmit);
    await expect(playerSelect.locator(`option[value="${selectedPlayerValue}"]`)).toHaveCount(0, {
      timeout: 15000,
    });

    await commissioner.dispose();
  });

  test("post-draft cut simulator lists required cuts with cap and depth consequences", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const draft = await createOrReuseActiveDraft(commissioner, "CutSim");

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/draft/session/${draft.draftId}`);

    const simulator = page.getByTestId("draft-cut-simulator");
    const pendingPicksInput = page.getByTestId("draft-cut-pending-picks");
    const runSimulationButton = simulator.getByRole("button", {
      name: /Run .* Cut Simulation|Run Post-Draft Simulation/,
    });
    await expect(simulator).toBeVisible();
    await pendingPicksInput.fill("20");
    await runSimulationButton.click();

    const results = page.getByTestId("draft-cut-simulation-results");
    await expect(results).toBeVisible();
    const noCutsRequired = results.getByText("No cuts required under current pending pick projection.");
    if ((await noCutsRequired.count()) > 0) {
      await pendingPicksInput.fill("200");
      await runSimulationButton.click();
    }

    await expect(noCutsRequired).toHaveCount(0);
    await expect(results).toContainText("Cap savings");
    await expect(results).toContainText("Depth impact:");

    await commissioner.dispose();
  });
});
