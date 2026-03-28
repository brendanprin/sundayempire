import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createPickForPickTradeProposalWithRetry,
  createSettlementReadyTradeProposalWithRetry,
  evaluateTradeProposal,
  getTeams,
} from "./helpers/api";

test.describe("Trades conformance", () => {
  test("trade home and builder use canonical workflow hierarchy", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });

    await page.goto("/trades");
    await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
    
    // Prevent regression to pilot/operator language  
    const tradesPageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(tradesPageContent?.toLowerCase()).not.toMatch(/workflow home|proposal workflow|workflow|pilot|prototype/i);
    
    await expect(page.getByTestId("trades-home-priority-section")).toBeVisible();
    await expect(page.getByTestId("trades-home-settlement-section")).toBeVisible();
    await expect(page.getByTestId("trades-home-drafts-section")).toBeVisible();
    await expect(page.getByTestId("trades-home-open-section")).toBeVisible();
    await expect(page.getByTestId("trades-home-history-section")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Trade Builder" })).toBeVisible();
    await expect(page.getByTestId("trades-home-history-section")).toContainText(
      "quick context without dropping far below the active queues",
    );

    await page.goto("/trades/new");
    await expect(page.getByRole("heading", { name: "Trade Builder" })).toBeVisible();
    
    // Prevent regression to pilot/operator language
    const builderPageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(builderPageContent?.toLowerCase()).not.toMatch(/proposal workflow|workflow|pilot|prototype/i);
    
    await expect(page.getByTestId("trade-builder-header")).toBeVisible();
    await expect(page.getByTestId("trade-builder-canvas")).toBeVisible();
    await expect(page.getByTestId("trade-builder-asset-selection")).toBeVisible();
    await expect(page.getByTestId("trade-builder-validation")).toBeVisible();
    await expect(page.getByTestId("trade-builder-impact")).toBeVisible();
    await expect(page.getByTestId("trade-builder-actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Trade Draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Trade Validation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Trade Proposal" })).toBeVisible();
  });

  test("trade detail keeps decision context and available actions together", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);

    const proposal = await createPickForPickTradeProposalWithRetry(commissioner, {
      proposerTeamId: teams[0].id,
      counterpartyTeamId: teams[1].id,
    });
    expect(proposal.response.ok()).toBeTruthy();
    const proposalId = (proposal.payload as { proposal: { id: string } }).proposal.id;

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/trades/${proposalId}`);

    await expect(page.getByRole("heading", { name: "Trade Review" })).toBeVisible();
    
    // Prevent regression to pilot/operator language
    const reviewPageContent = await page.textContent("[data-testid='page-header-band'], main");
    expect(reviewPageContent?.toLowerCase()).not.toMatch(/proposal workflow|workflow|pilot|prototype/i);
    
    await expect(page.getByTestId("trade-review-header")).toBeVisible();
    await expect(page.getByTestId("trade-review-canvas")).toBeVisible();
    await expect(page.getByTestId("trade-review-validation")).toBeVisible();
    await expect(page.getByTestId("trade-review-actions")).toBeVisible();
    await expect(page.getByText(/authoritative validator/i)).toHaveCount(0);

    await commissioner.dispose();
  });

  test("hard-blocked trade drafts do not show a misleading submit CTA", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);

    const proposal = await createPickForPickTradeProposalWithRetry(commissioner, {
      proposerTeamId: teams[0].id,
      counterpartyTeamId: teams[1].id,
    });
    expect(proposal.response.ok()).toBeTruthy();
    const proposalId = (proposal.payload as { proposal: { id: string } }).proposal.id;

    const evaluation = await evaluateTradeProposal(commissioner, proposalId);
    expect(evaluation.response.ok()).toBeTruthy();
    expect(
      (evaluation.payload as { currentEvaluation: { outcome: string } | null }).currentEvaluation?.outcome,
    ).toBe("FAIL_HARD_BLOCK");

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto(`/trades/${proposalId}`);

    await expect(page.getByTestId("trade-review-actions")).toBeVisible();
    await expect(page.getByTestId("trade-review-blocked-note")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Trade Proposal" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Draft in Trade Builder" })).toBeVisible();

    await commissioner.dispose();
  });

  test("commissioner can settle accepted proposals from the canonical trade review path", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);
    const proposerTeam = teams.at(-1);
    const counterpartyTeam = teams.at(-2);
    expect(proposerTeam).toBeTruthy();
    expect(counterpartyTeam).toBeTruthy();
    if (!proposerTeam || !counterpartyTeam) {
      throw new Error("Expected at least two teams for commissioner settlement coverage.");
    }

    const submitted = await createSettlementReadyTradeProposalWithRetry(commissioner, {
      proposerTeamId: proposerTeam.id,
      counterpartyTeamId: counterpartyTeam.id,
      maxAttempts: 10,
    });
    expect(submitted.response.ok()).toBeTruthy();
    const proposalId = (submitted.payload as { proposal: { id: string } }).proposal.id;

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/trades");

    const settlementSection = page.getByTestId("trades-home-settlement-section");
    await expect(settlementSection).toBeVisible();
    await expect(settlementSection).toContainText("Settlement Queue");
    await expect(settlementSection).toContainText(/ACCEPTED|REVIEW APPROVED/);

    await page.goto(`/trades/${proposalId}`);
    await expect(page.getByRole("button", { name: "Settle Trade Now" })).toBeVisible();

    await commissioner.dispose();
  });
});
