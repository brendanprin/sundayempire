import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL } from "./helpers/api";

test.describe("Diagnostics Utility", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("commissioner sees pass/warn/fail subsystem checks with remediation links", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/diagnostics");

    await expect(page.getByRole("heading", { name: "Diagnostics Utility" })).toBeVisible();
    await expect(page.getByTestId("diagnostics-page")).toBeVisible();
    await expect(page.getByTestId("diagnostics-compatibility-notice")).toBeVisible();

    await expect(page.getByTestId("diagnostics-summary-pass")).toBeVisible();
    await expect(page.getByTestId("diagnostics-summary-warn")).toBeVisible();
    await expect(page.getByTestId("diagnostics-summary-fail")).toBeVisible();

    const subsystems = page.getByTestId("diagnostics-subsystem");
    await expect.poll(async () => subsystems.count()).toBeGreaterThan(0);

    await expect(page.getByText("Role Access", { exact: true })).toBeVisible();
    await expect(page.getByText("Commissioner Integrity", { exact: true })).toBeVisible();
    await expect(page.getByText("Trade Queue Backlog", { exact: true })).toBeVisible();
    await expect(page.getByText("League Compliance Risk", { exact: true })).toBeVisible();

    const remediationLinks = page.getByTestId("diagnostics-remediation-link");
    await expect
      .poll(async () => {
        const [subsystemCount, remediationCount] = await Promise.all([
          subsystems.count(),
          remediationLinks.count(),
        ]);
        return remediationCount >= subsystemCount && remediationCount > 0;
      })
      .toBeTruthy();
  });

  test("platform-admin commissioner can deep-link to support from diagnostics commissioner integrity", async ({
    page,
  }) => {
    await prisma.user.updateMany({
      where: {
        email: COMMISSIONER_EMAIL,
      },
      data: {
        platformRole: "ADMIN",
      },
    });

    try {
      await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
      await page.goto("/diagnostics");

      const supportLink = page.getByTestId("diagnostics-support-link");
      await expect(supportLink).toBeVisible();

      const href = await supportLink.getAttribute("href");
      expect(href).toContain("/support/commissioner?");

      await supportLink.click();

      await expect(page.getByTestId("support-commissioner-page")).toBeVisible();
      await expect(page.getByTestId("settings-admin-commissioner-support")).toBeVisible();
    } finally {
      await prisma.user.updateMany({
        where: {
          email: COMMISSIONER_EMAIL,
        },
        data: {
          platformRole: "USER",
        },
      });
    }
  });

  test("owner is denied diagnostics API and cannot access diagnostics page", async ({ page, baseURL }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const response = await ownerApi.get("/api/commissioner/diagnostics");
    expect(response.status()).toBe(403);

    const payload = await response.json();
    expect(payload.error?.code).toBe("FORBIDDEN");
    await ownerApi.dispose();

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/diagnostics");

    await expect(page.getByTestId("diagnostics-access-denied")).toBeVisible();
    await expect(page.getByTestId("diagnostics-compatibility-notice")).toBeVisible();
    await expect(page.getByText("Only commissioners can view diagnostics.")).toBeVisible();
    await expect(page.getByTestId("diagnostics-subsystem")).toHaveCount(0);
  });
});
