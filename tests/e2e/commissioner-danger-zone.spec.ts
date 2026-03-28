import { expect, Page, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

async function snapshotConfirmationPhrase(page: Page) {
  const phraseLabel = await page.getByTestId("snapshot-confirmation-phrase").textContent();
  return phraseLabel?.replace("Confirmation phrase:", "").trim() ?? "";
}

test.describe("Commissioner Danger Zone Safeguards", () => {
  test("snapshot restore apply stays blocked until preview and explicit confirmations are complete", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const dangerZone = page.getByTestId("commissioner-danger-zone");
    const applyRestoreButton = page.getByTestId("snapshot-apply-button");

    await expect(dangerZone).toBeVisible();
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-export-button").click();
    await page.getByTestId("snapshot-preview-button").click();

    await expect(page.getByTestId("snapshot-preview-status")).toContainText("Preview complete");
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-apply-confirm-checkbox").check();
    await page.getByTestId("snapshot-apply-confirm-input").fill("wrong phrase");
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-apply-confirm-input").fill(await snapshotConfirmationPhrase(page));
    await expect(applyRestoreButton).toBeEnabled();
  });

  test("emergency fix apply stays blocked until dry-run preflight and confirmations are complete", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const applyFixButton = page.getByTestId("fix-apply-button");
    await expect(applyFixButton).toBeDisabled();

    await page.getByTestId("fix-apply-confirm-checkbox").check();
    await page.getByTestId("fix-apply-confirm-input").fill("APPLY FIX");
    await expect(applyFixButton).toBeDisabled();

    const previewButton = page.getByTestId("fix-preview-button");
    await expect(previewButton).toBeEnabled();
    await previewButton.click();

    await expect(page.getByTestId("fix-preview-status")).toContainText("Dry run for current settings is complete");
    await page.getByTestId("fix-apply-confirm-checkbox").check();
    await page.getByTestId("fix-apply-confirm-input").fill("APPLY FIX");
    await expect(applyFixButton).toBeEnabled();
  });
});
