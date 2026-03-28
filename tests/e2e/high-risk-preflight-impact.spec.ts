import { expect, Page, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

async function snapshotConfirmationPhrase(page: Page) {
  const phraseLabel = await page.getByTestId("snapshot-confirmation-phrase").textContent();
  return phraseLabel?.replace("Confirmation phrase:", "").trim() ?? "";
}

test.describe("High-Risk Preflight Impact", () => {
  test("snapshot restore preview shows impact summary and keeps apply gated by acknowledgments", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const applyRestoreButton = page.getByTestId("snapshot-apply-button");
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-export-button").click();
    await page.getByTestId("snapshot-preview-button").click();

    const impactSummary = page.getByTestId("snapshot-impact-summary");
    await expect(impactSummary).toBeVisible();
    await expect(impactSummary).toContainText("Preflight Impact Summary");
    await expect(impactSummary).toContainText("Records to delete:");
    await expect(impactSummary).toContainText("Records to insert:");
    await expect(impactSummary).toContainText("Active season:");
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-apply-confirm-checkbox").check();
    await page.getByTestId("snapshot-apply-confirm-input").fill(await snapshotConfirmationPhrase(page));
    await expect(applyRestoreButton).toBeEnabled();
  });

  test("emergency fix dry run shows preflight impact summary before apply can be enabled", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const applyFixButton = page.getByTestId("fix-apply-button");
    await expect(applyFixButton).toBeDisabled();

    await page.getByTestId("fix-preview-button").click();

    const impactSummary = page.getByTestId("fix-impact-summary");
    await expect(impactSummary).toBeVisible();
    await expect(impactSummary).toContainText("Preflight Impact Summary");
    await expect(impactSummary).toContainText("Players to Drop:");
    await expect(applyFixButton).toBeDisabled();

    await page.getByTestId("fix-apply-confirm-checkbox").check();
    await page.getByTestId("fix-apply-confirm-input").fill("APPLY FIX");
    await expect(applyFixButton).toBeEnabled();
  });
});
