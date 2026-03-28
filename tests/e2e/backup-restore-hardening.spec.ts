import { expect, Page, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

type SnapshotExportApiPayload = {
  snapshot: Record<string, unknown>;
};

type SnapshotPreviewApiPayload = {
  preview?: {
    snapshotHash: string;
    confirmationPhrase: string;
  };
};

async function snapshotConfirmationPhrase(page: Page) {
  const phraseLabel = await page.getByTestId("snapshot-confirmation-phrase").textContent();
  return phraseLabel?.replace("Confirmation phrase:", "").trim() ?? "";
}

test.describe("Backup and Restore Workflow Hardening", () => {
  test("snapshot restore flow shows explicit sequence guidance and preview-scoped confirmation phrase", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const sequenceGuide = page.getByTestId("snapshot-sequence-guide");
    const applyRestoreButton = page.getByTestId("snapshot-apply-button");
    await expect(sequenceGuide).toBeVisible();
    await expect(sequenceGuide).toContainText("Export a fresh backup snapshot.");
    await expect(sequenceGuide).toContainText("Run preview and review impact details.");
    await expect(sequenceGuide).toContainText("Confirm destructive apply phrase");

    await page.getByTestId("snapshot-export-button").click();
    await page.getByTestId("snapshot-preview-button").click();
    await expect(page.getByTestId("snapshot-preview-status")).toContainText("Preview complete");

    const confirmationPhrase = await snapshotConfirmationPhrase(page);
    expect(confirmationPhrase.startsWith("APPLY RESTORE ")).toBeTruthy();
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-apply-confirm-checkbox").check();
    await page.getByTestId("snapshot-apply-confirm-input").fill("APPLY RESTORE");
    await expect(applyRestoreButton).toBeDisabled();

    await page.getByTestId("snapshot-apply-confirm-input").fill(confirmationPhrase);
    await expect(applyRestoreButton).toBeEnabled();

    await page.getByTestId("snapshot-json-input").press(" ");
    await expect(applyRestoreButton).toBeDisabled();
    await expect(page.getByTestId("snapshot-preview-status")).toContainText(
      "Run preview for the current JSON before apply.",
    );
  });

  test("snapshot apply API requires matching preview hash before destructive restore", async ({
    baseURL,
  }) => {
    const api = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const exportResponse = await api.get("/api/commissioner/snapshot/export");
    expect(exportResponse.ok()).toBeTruthy();
    const exportPayload = (await exportResponse.json()) as SnapshotExportApiPayload;

    const previewResponse = await api.post("/api/commissioner/snapshot/import", {
      data: {
        mode: "preview",
        snapshot: exportPayload.snapshot,
      },
    });
    expect(previewResponse.ok()).toBeTruthy();
    const previewPayload = (await previewResponse.json()) as SnapshotPreviewApiPayload;
    const previewHash = previewPayload.preview?.snapshotHash;
    expect(previewHash).toBeTruthy();

    const applyMissingPreviewHash = await api.post("/api/commissioner/snapshot/import", {
      data: {
        mode: "apply",
        replaceExisting: true,
        snapshot: exportPayload.snapshot,
      },
    });
    expect(applyMissingPreviewHash.status()).toBe(400);
    const missingPayload = await applyMissingPreviewHash.json();
    expect(missingPayload.error?.code).toBe("SNAPSHOT_PREVIEW_REQUIRED");

    const tamperedSnapshot = {
      ...exportPayload.snapshot,
      exportedAt: new Date().toISOString(),
    };
    const applyMismatchedPreview = await api.post("/api/commissioner/snapshot/import", {
      data: {
        mode: "apply",
        replaceExisting: true,
        previewHash,
        snapshot: tamperedSnapshot,
      },
    });
    expect(applyMismatchedPreview.status()).toBe(409);
    const mismatchPayload = await applyMismatchedPreview.json();
    expect(mismatchPayload.error?.code).toBe("SNAPSHOT_PREVIEW_MISMATCH");

    await api.dispose();
  });
});
