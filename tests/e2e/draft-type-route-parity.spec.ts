import { APIRequestContext, expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

type DraftType = "ROOKIE" | "VETERAN_AUCTION";

type DraftListPayload = {
  drafts: Array<{
    id: string;
    title: string;
    type: DraftType;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  }>;
};

type DraftDetailPayload = {
  draft: {
    id: string;
    type: DraftType;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  };
};

const DRAFT_TYPE_SCENARIOS: Array<{
  type: DraftType;
  route: string;
  heading: string;
  routeViewTestId: string;
  liveOrSetupMarker: RegExp;
  overlayTestId?: string;
}> = [
  {
    type: "ROOKIE",
    route: "/draft/rookie",
    heading: "Rookie Draft Workspace",
    routeViewTestId: "rookie-draft-workspace",
    liveOrSetupMarker: /Generated Draft Order|Live Rookie Board/,
  },
  {
    type: "VETERAN_AUCTION",
    route: "/draft/veteran-auction",
    heading: "Veteran Auction Workspace",
    routeViewTestId: "veteran-auction-workspace",
    liveOrSetupMarker: /Pool Generation and Start Controls|Live Veteran Auction Board/,
  },
];

async function fetchDraftsByType(commissioner: APIRequestContext, type: DraftType) {
  const response = await commissioner.get(`/api/drafts?type=${type}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as DraftListPayload;
}

async function ensureDraftByType(
  commissioner: APIRequestContext,
  type: DraftType,
  title: string,
) {
  const existing = await fetchDraftsByType(commissioner, type);
  const activeDraft = existing.drafts.find((draft) => draft.status !== "COMPLETED");
  if (activeDraft) {
    return activeDraft;
  }

  const createResponse = await commissioner.post("/api/drafts", {
    data: {
      type,
      title,
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const createPayload = (await createResponse.json()) as {
    draft: DraftListPayload["drafts"][number];
  };
  return createPayload.draft;
}

for (const scenario of DRAFT_TYPE_SCENARIOS) {
  test(`parity: ${scenario.type} route keeps shared workspace behavior and type scoping`, async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const uniqueTitle = `Parity ${scenario.type} ${Date.now()}`;
    const activeDraft = await ensureDraftByType(commissioner, scenario.type, uniqueTitle);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`${scenario.route}?session=${encodeURIComponent(activeDraft.id)}`);

    await expect(page.getByRole("heading", { name: scenario.heading, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Picks & Draft" })).toBeVisible();
    await expect(page.getByText("Draft Type")).toHaveCount(0);

    await expect(page.getByTestId(scenario.routeViewTestId)).toBeVisible();
    await expect(page.getByText(scenario.liveOrSetupMarker)).toBeVisible();

    if (scenario.overlayTestId) {
      await expect(page.getByTestId(scenario.overlayTestId)).toBeVisible();
    } else {
      await expect(page.getByTestId("draft-tiered-overlay")).toHaveCount(0);
    }

    const detailResponse = await commissioner.get(`/api/drafts/${activeDraft.id}`);
    expect(detailResponse.ok()).toBeTruthy();
    const detailPayload = (await detailResponse.json()) as DraftDetailPayload;
    expect(detailPayload.draft.type).toBe(scenario.type);
    expect(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).toContain(detailPayload.draft.status);

    for (const other of DRAFT_TYPE_SCENARIOS) {
      if (other.type === scenario.type) {
        continue;
      }
      const otherPayload = await fetchDraftsByType(commissioner, other.type);
      expect(otherPayload.drafts.some((draft) => draft.id === activeDraft.id)).toBeFalsy();
    }

    await commissioner.dispose();
  });
}
