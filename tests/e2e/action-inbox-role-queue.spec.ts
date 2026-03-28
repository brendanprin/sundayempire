import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createSettlementReadyTradeProposalWithRetry,
  createSubmittedPickForPickTradeProposalWithRetry,
  getPrimaryLeagueId,
  getTeams,
  OWNER_EMAIL,
} from "./helpers/api";

type DraftSummary = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
};

async function ensureActiveDraft(ctx: Awaited<ReturnType<typeof apiContext>>): Promise<DraftSummary> {
  const existingResponse = await ctx.get("/api/drafts");
  expect(existingResponse.ok()).toBeTruthy();
  const existingPayload = (await existingResponse.json()) as {
    drafts: DraftSummary[];
  };

  const activeDraft = existingPayload.drafts.find(
    (draft) => draft.status === "IN_PROGRESS" || draft.status === "NOT_STARTED",
  );
  if (activeDraft) {
    return activeDraft;
  }

  const draftTypes = ["ROOKIE", "VETERAN_AUCTION"] as const;
  for (const draftType of draftTypes) {
    const createResponse = await ctx.post("/api/drafts", {
      data: {
        type: draftType,
        title: `e2e-action-inbox-${draftType}-${Date.now()}`,
      },
    });

    if (createResponse.status() === 201) {
      const createPayload = (await createResponse.json()) as {
        draft: DraftSummary;
      };
      return createPayload.draft;
    }

    if (createResponse.status() === 409) {
      continue;
    }

    throw new Error(`Unexpected draft creation failure: ${createResponse.status()}`);
  }

  throw new Error("Unable to ensure active draft session for action inbox test.");
}

test.describe("Role-Aware Action Inbox", () => {
  test("commissioner inbox surfaces trade queues and draft actions with direct CTAs", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagueId = await getPrimaryLeagueId(commissioner);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);

    const teamA = teams.at(-1);
    const teamB = teams.at(-2);
    if (!teamA || !teamB) {
      throw new Error("Expected at least two teams for commissioner inbox setup.");
    }

    const proposedTrade = await createSubmittedPickForPickTradeProposalWithRetry(commissioner, {
      proposerTeamId: teamA.id,
      counterpartyTeamId: teamB.id,
    });
    expect(proposedTrade.response.ok()).toBeTruthy();

    const toApproveThenProcess = await createSettlementReadyTradeProposalWithRetry(commissioner, {
      proposerTeamId: teamA.id,
      counterpartyTeamId: teamB.id,
    });
    expect(toApproveThenProcess.response.ok()).toBeTruthy();

    const activeDraft = await ensureActiveDraft(commissioner);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("commissioner-action-queue")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Action Inbox" })).toBeVisible();
    await expect(page.getByTestId("commissioner-action-trade-approvals")).toBeVisible();
    await expect(page.getByTestId("commissioner-action-trade-processing")).toBeVisible();

    const approvalsLink = page.getByTestId("commissioner-action-link-trade-approvals");
    await expect(approvalsLink).toHaveAttribute("href", "/trades");
    await approvalsLink.click();
    await expect(page).toHaveURL(/\/trades$/);

    await page.goto(`/league/${leagueId}`);
    if (activeDraft.status === "IN_PROGRESS") {
      await expect(page.getByTestId("commissioner-action-draft-live")).toBeVisible();
      await expect(page.getByTestId("commissioner-action-link-draft-live")).toHaveAttribute(
        "href",
        "/draft",
      );
    } else {
      await expect(page.getByTestId("commissioner-action-draft-ready")).toBeVisible();
      await expect(page.getByTestId("commissioner-action-link-draft-ready")).toHaveAttribute(
        "href",
        "/draft",
      );
    }

    await commissioner.dispose();
  });

  test("owner inbox includes draft preparation action with direct picks CTA", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const leagueId = await getPrimaryLeagueId(owner);
    await ensureActiveDraft(commissioner);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/league/${leagueId}`);

    await expect(page.getByTestId("owner-action-queue")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Action Inbox" })).toBeVisible();
    await expect(page.getByTestId("owner-action-draft-prep")).toBeVisible();

    const picksLink = page.getByTestId("owner-action-link-draft-prep");
    await expect(picksLink).toHaveAttribute("href", "/draft");
    await picksLink.click();
    await expect(page).toHaveURL(/\/draft$/);

    await owner.dispose();
    await commissioner.dispose();
  });
});
