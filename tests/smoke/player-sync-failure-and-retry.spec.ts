import { test, expect } from "@playwright/test";
import { loginAs, navigateToLeague, getPrimaryLeagueId } from "./helpers/smoke-auth";
import {
  captureSmokeEvidence,
  saveSmokeTestSummary,
  setupSmokeTestPage,
  waitForPageStable,
} from "./helpers/smoke-evidence";

test.describe("Player Sync Failure and Retry", () => {
  test.beforeEach(async ({ page }) => {
    await setupSmokeTestPage(page);
  });

  test("player refresh workspace renders and shows job history or empty state", async ({
    page,
    baseURL,
  }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      await loginAs(page, "commissioner");
      const leagueId = await getPrimaryLeagueId(baseURL);
      await navigateToLeague(page, leagueId);

      await page.goto("/commissioner/player-refresh");
      await waitForPageStable(page);

      // Workspace shell must render
      await expect(page.getByTestId("player-refresh-jobs-workspace")).toBeVisible();
      evidence = await captureSmokeEvidence(page, test.info(), "01-workspace-loaded");

      // Trigger Refresh section must be present with the Run Refresh button
      const runButton = page.getByRole("button", { name: /run refresh/i });
      await expect(runButton).toBeVisible();
      await expect(runButton).toBeEnabled();

      // Recent Jobs section must show either a job table or an empty-state message —
      // never a blank/crashed state
      const hasJobs = await page.getByRole("table").isVisible();
      const hasEmptyState = await page
        .getByText("No player refresh jobs have been run yet.")
        .isVisible();

      if (!hasJobs && !hasEmptyState) {
        errors.push(
          "Recent Jobs section shows neither a job table nor an empty-state message — possible render failure",
        );
      }

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-jobs-section")).screenshots,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "player-sync-workspace-renders",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("triggering a refresh job produces a job entry and detail page is accessible", async ({
    page,
    baseURL,
  }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      await loginAs(page, "commissioner");
      const leagueId = await getPrimaryLeagueId(baseURL);
      await navigateToLeague(page, leagueId);

      await page.goto("/commissioner/player-refresh");
      await waitForPageStable(page);

      await expect(page.getByTestId("player-refresh-jobs-workspace")).toBeVisible();

      // Trigger a refresh job using the default adapter
      const runButton = page.getByRole("button", { name: /run refresh/i });
      await runButton.click();

      // Wait for success or error feedback — the button goes busy then resolves
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button[disabled]');
          return !btn || !btn.textContent?.includes("Running");
        },
        { timeout: 30_000 },
      );
      await waitForPageStable(page);

      evidence = await captureSmokeEvidence(page, test.info(), "01-after-run-refresh");

      // A job row must now appear — or an error message must be shown
      // (either outcome is valid; what's not valid is a silent blank state)
      const hasJobRow = await page.getByRole("table").isVisible();
      const hasErrorMessage = await page
        .locator(".text-rose-200")
        .first()
        .isVisible()
        .catch(() => false);
      const hasSuccessMessage = await page
        .locator(".text-emerald-200")
        .first()
        .isVisible()
        .catch(() => false);

      if (!hasJobRow && !hasErrorMessage && !hasSuccessMessage) {
        errors.push(
          "After triggering a refresh, no job row, error message, or success message is visible — silent failure",
        );
      }

      evidence.screenshots.push(
        ...(await captureSmokeEvidence(page, test.info(), "02-post-trigger-state")).screenshots,
      );

      // If a job row appeared, navigate into its detail page
      if (hasJobRow) {
        const firstJobLink = page.getByRole("table").getByRole("link").first();
        if (await firstJobLink.isVisible()) {
          await firstJobLink.click();
          await waitForPageStable(page);

          // Detail page must render
          await expect(page.getByTestId("player-refresh-job-detail")).toBeVisible();

          // Status badge must be present — confirms job state is surfaced
          await expect(page.getByText(/Run Status:/)).toBeVisible();

          evidence.screenshots.push(
            ...(await captureSmokeEvidence(page, test.info(), "03-job-detail-rendered")).screenshots,
          );

          // If the job failed, error list must be visible — not a blank panel
          const statusText = await page.getByText(/Run Status:/).textContent();
          if (statusText?.includes("FAILED")) {
            const errorList = page.locator('[data-testid="player-refresh-job-detail"] li');
            const errorCount = await errorList.count();
            if (errorCount === 0) {
              errors.push(
                "Job status is FAILED but no error details are listed — sync failure is silent",
              );
            }

            evidence.screenshots.push(
              ...(await captureSmokeEvidence(page, test.info(), "04-failed-job-errors")).screenshots,
            );
          }

          // Back to Jobs link must be present for recovery navigation
          await expect(page.getByRole("link", { name: "Back to Jobs" })).toBeVisible();
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "player-sync-trigger-and-detail",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });

  test("manager cannot access player refresh workspace", async ({ page, baseURL }) => {
    const startTime = Date.now();
    let evidence = { screenshots: [] as string[] };
    const errors: string[] = [];

    try {
      if (!baseURL) throw new Error("Expected Playwright baseURL to be configured.");

      await loginAs(page, "manager");

      await page.goto("/commissioner/player-refresh");
      await waitForPageStable(page);

      // Must be redirected away — workspace must not render for a non-commissioner
      const workspace = page.getByTestId("player-refresh-jobs-workspace");
      if (await workspace.isVisible()) {
        errors.push(
          "player-refresh-jobs-workspace visible to a manager — role gate missing on /commissioner/player-refresh",
        );
      }

      // Should land on no-access page or a safe non-commissioner route
      const noAccess = page.getByTestId("no-access-page");
      const url = page.url();
      if (!(await noAccess.isVisible()) && url.includes("/commissioner/player-refresh")) {
        errors.push(`Manager not redirected from /commissioner/player-refresh — landed on: ${url}`);
      }

      evidence = await captureSmokeEvidence(page, test.info(), "01-manager-access-denied");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await saveSmokeTestSummary(test.info(), {
        specName: "player-sync-manager-access-denied",
        status: errors.length > 0 ? "failed" : "passed",
        duration,
        evidence,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  });
});
