import { expect, test } from "@playwright/test";
import {
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  apiContext,
  createLiveRookieDraft,
  createLiveVeteranAuction,
} from "./helpers/api";

test.describe("Draft conformance", () => {
  test("draft home emphasizes canonical rookie and veteran workspaces", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/draft");

    await expect(page.getByRole("heading", { name: "Picks & Draft" })).toBeVisible();
    await expect(page.getByTestId("draft-primary-workspaces")).toBeVisible();
    await expect(page.getByTestId("draft-rookie-card")).toBeVisible();
    await expect(page.getByTestId("draft-veteran-card")).toBeVisible();
    await expect(page.getByTestId("startup-draft-retired-notice")).toHaveCount(0);
    await expect(page.getByText("Pick ownership snapshot")).toBeVisible();
    await expect(page.getByTestId("draft-pick-ownership-operations")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick Ownership Operations" })).toBeVisible();
    await expect(page.getByTestId("picks-retired-notice")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Pick Ownership Compatibility Route" })).toHaveCount(0);
  });

  test("pick ownership operations stay commissioner-only inside the canonical draft workspace", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/draft");

    await expect(page.getByRole("heading", { name: "Picks & Draft" })).toBeVisible();
    await expect(page.getByText("Pick ownership snapshot")).toBeVisible();
    await expect(page.getByTestId("draft-pick-ownership-operations")).toHaveCount(0);
  });

  test("rookie and veteran workspaces use consistent canonical headings and back links", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto("/draft/rookie");
    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Picks & Draft" })).toBeVisible();
    await expect(
      page.getByText("Generated Draft Order").or(page.getByText("Live Rookie Board")),
    ).toBeVisible();

    await page.goto("/draft/veteran-auction");
    await expect(page.getByRole("heading", { name: "Veteran Auction Workspace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Picks & Draft" })).toBeVisible();
    await expect(
      page
        .getByText("Pool Generation and Start Controls")
        .or(page.getByText("Live Veteran Auction Board")),
    ).toBeVisible();
  });

  test("live rookie draft keeps state copy aligned and hides commissioner-only controls from owners", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const draft = await createLiveRookieDraft(
      commissioner,
      `Trust Fix Rookie ${Date.now()}`,
    );
    expect(draft.draftId).toBeTruthy();
    if (draft.setupResponse) {
      expect(draft.setupResponse.ok()).toBeTruthy();
    }
    if (draft.startResponse) {
      expect(draft.startResponse.ok()).toBeTruthy();
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/draft/rookie?session=${encodeURIComponent(draft.draftId)}`);
    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace" })).toBeVisible();
    await expect(page.getByTestId("rookie-draft-room-actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Forfeit Pick" })).toBeVisible();
    await expect(page.getByText("Draft complete")).toHaveCount(0);
    await expect(page.getByText(/authoritative room state/i)).toHaveCount(0);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/rookie?session=${encodeURIComponent(draft.draftId)}`);
    await expect(page.getByRole("heading", { name: "Rookie Draft Workspace" })).toBeVisible();
    await expect(page.getByText("Commissioner room controls")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Forfeit Pick" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh Room" })).toBeVisible();

    await commissioner.dispose();
  });

  test("live veteran auction keeps commissioner controls out of owner view", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Trust Fix Veteran ${Date.now()}`,
    );
    expect(auction.draftId).toBeTruthy();
    if (auction.setupResponse) {
      expect(auction.setupResponse.ok()).toBeTruthy();
    }
    if (auction.startResponse) {
      expect(auction.startResponse.ok()).toBeTruthy();
    }

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByRole("heading", { name: "Veteran Auction Workspace" })).toBeVisible();
    await expect(page.getByTestId("veteran-auction-room-controls")).toBeVisible();
    
    // Verify responsive auction layout components
    await expect(page.getByTestId("auction-layout-desktop").or(page.getByTestId("auction-layout-tablet")).or(page.getByTestId("auction-layout-mobile"))).toBeVisible();
    await expect(page.getByTestId("auction-board-desktop").or(page.getByTestId("auction-board-mobile"))).toBeVisible();
    
    await expect(page.getByText("Commissioner room controls")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sync Status / Awards" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh Room" })).toBeVisible();

    await commissioner.dispose();
  });
});
