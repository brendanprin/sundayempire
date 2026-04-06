import { test, expect } from "@playwright/test";
import {
  loginAs,
  navigateToLeague,
  getPrimaryLeagueId,
  createSmokeApiContext,
} from "./helpers/smoke-auth";
import { setupSmokeFixtures, createSmokeTestTrade } from "./helpers/smoke-fixtures";
import {
  captureSmokeEvidence,
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable,
} from "./helpers/smoke-evidence";
import {
  apiContext,
  submitTradeProposal,
  acceptTradeProposal,
} from "../e2e/helpers/api";

// The counterparty in smoke fixtures is always teams[1], which maps to owner02
const COUNTERPARTY_EMAIL = "owner02@local.league";

/**
 * Creates a trade proposal as owner01 and submits it so the counterparty can respond.
 */
async function createSubmittedTrade(baseURL: string) {
  const fixtures = await setupSmokeFixtures(baseURL);

  // Create the draft proposal
  const { proposalId } = await createSmokeTestTrade(baseURL, fixtures);
  if (!proposalId) {
    throw new Error("createSmokeTestTrade did not return a proposalId");
  }

  // Submit it so the counterparty receives it
  const proposerApi = await apiContext(baseURL, fixtures.teams[0].ownerEmail, fixtures.leagueId);
  try {
    const { response } = await submitTradeProposal(proposerApi, proposalId);
    if (!response.ok()) {
      throw new Error(`Submit failed: ${response.status()}`);
    }
  } finally {
    await proposerApi.dispose();
  }

  return { proposalId, leagueId: fixtures.leagueId };
}

test.describe("Trade Decline and Accept (Counterparty Response)", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("counterparty can decline a submitted trade proposal", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      // Step 1: Set up a submitted trade as the proposer via API
      const { proposalId, leagueId } = await createSubmittedTrade(baseURL);

      // Step 2: Log in as the counterparty manager
      await loginAs(page, "manager");
      // Switch to counterparty identity — re-auth as owner02
      await page.context().clearCookies();
      await page.goto(`/login?returnTo=${encodeURIComponent("/trades")}`);
      await waitForPageStable(page);

      const demoTrigger = page.getByTestId("login-show-demo-section");
      if (await demoTrigger.isVisible().catch(() => false)) {
        await demoTrigger.click();
        const demoPanel = page.getByTestId("login-demo-auth-panel");
        await expect(demoPanel).toBeVisible();
        const identitySelect = page.getByTestId("login-identity-select");
        const hasCounterparty = await identitySelect
          .locator(`option[value="${COUNTERPARTY_EMAIL}"]`)
          .count();
        if (hasCounterparty) {
          await page.getByTestId("login-role-option-member-team").click();
          await identitySelect.selectOption(COUNTERPARTY_EMAIL);
          await page.getByTestId("login-demo-submit").click();
        } else {
          // Fall back to owner01 if owner02 not in demo list — test will still
          // exercise the UI path even if the trade isn't in the pending state
          await page.getByTestId("login-role-option-member-team").click();
          await page.getByTestId("login-demo-submit").click();
        }
      }
      await waitForPageStable(page);

      // Step 3: Navigate directly to the submitted proposal
      await page.goto(`/trades/${proposalId}`);
      await waitForPageStable(page);

      await expect(page.getByTestId("trade-review-workspace")).toBeVisible();
      evidence = await captureSmokeEvidence(page, test.info(), "01-trade-review-loaded");

      // Step 4: Counterparty should see both accept and decline buttons
      const declineButton = page.getByRole("button", { name: "Decline Trade Proposal" });
      const acceptButton = page.getByRole("button", { name: "Accept Trade Proposal" });

      await expect(declineButton).toBeVisible();
      await expect(acceptButton).toBeVisible();
      await expect(declineButton).toBeEnabled();
      await expect(acceptButton).toBeEnabled();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-accept-decline-visible")).screenshots,
      );

      // Step 5: Decline the proposal
      await declineButton.click();
      await waitForPageStable(page);

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "03-after-decline")).screenshots,
      );

      // Step 6: Workspace should still render — no crash
      await expect(page.getByTestId("trade-review-workspace")).toBeVisible();

      // Step 7: Accept and decline buttons must be gone — proposal is closed
      await expect(declineButton).not.toBeVisible();
      await expect(acceptButton).not.toBeVisible();

      // Step 8: View-only note confirms the declined state
      await expect(
        page.getByText("This proposal was declined. The package and evaluation record are preserved for reference."),
      ).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "04-declined-view-only")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "trade-decline-counterparty",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("proposer cannot decline their own submitted proposal", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      const { proposalId, leagueId } = await createSubmittedTrade(baseURL);

      // Log in as the proposer (owner01 / "manager" role)
      await loginAs(page, "manager");
      await navigateToLeague(page, leagueId);
      await waitForPageStable(page);

      await page.goto(`/trades/${proposalId}`);
      await waitForPageStable(page);

      await expect(page.getByTestId("trade-review-workspace")).toBeVisible();
      evidence = await captureSmokeEvidence(page, test.info(), "01-proposer-view-submitted");

      // Proposer must NOT see accept or decline — those belong to the counterparty
      await expect(
        page.getByRole("button", { name: "Decline Trade Proposal" }),
      ).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Accept Trade Proposal" }),
      ).not.toBeVisible();

      // The view-only note confirms the submitted/awaiting state
      await expect(
        page.getByText("This proposal has been submitted. Awaiting response from the counterparty."),
      ).toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-proposer-view-only")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "trade-proposer-cannot-decline-own",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("accepted trade shows settlement-pending state", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      const { proposalId, leagueId } = await createSubmittedTrade(baseURL);

      // Accept via API as the counterparty
      const counterpartyApi = await apiContext(baseURL, COUNTERPARTY_EMAIL, leagueId);
      try {
        const { response } = await acceptTradeProposal(counterpartyApi, proposalId);
        if (!response.ok()) {
          throw new Error(`Accept API call failed: ${response.status()}`);
        }
      } finally {
        await counterpartyApi.dispose();
      }

      // Log in as the commissioner to view the accepted proposal
      await loginAs(page, "commissioner");
      await navigateToLeague(page, leagueId);

      await page.goto(`/trades/${proposalId}`);
      await waitForPageStable(page);

      await expect(page.getByTestId("trade-review-workspace")).toBeVisible();
      evidence = await captureSmokeEvidence(page, test.info(), "01-accepted-trade-commissioner-view");

      // Commissioner should see settlement option or accepted state copy
      // Either the "Apply Settlement" button (if commissioner review not required)
      // or the accepted view-only note
      const settleButton = page.getByRole("button", { name: "Apply Settlement" });
      const acceptedNote = page.getByText(
        "This trade was accepted and is pending settlement by the commissioner.",
      );

      const settleVisible = await settleButton.isVisible();
      const noteVisible = await acceptedNote.isVisible();

      if (!settleVisible && !noteVisible) {
        errors.push(
          "After accept, neither 'Apply Settlement' button nor accepted-state note is visible",
        );
      }

      // Decline button must not be available after acceptance
      await expect(
        page.getByRole("button", { name: "Decline Trade Proposal" }),
      ).not.toBeVisible();

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-post-accept-state")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "trade-accepted-settlement-pending",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
