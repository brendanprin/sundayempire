import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

async function countUiEvent(
  commissioner: Awaited<ReturnType<typeof apiContext>>,
  eventType: string,
) {
  const response = await commissioner.get(
    `/api/commissioner/analytics/events?sinceHours=2&limit=300&eventType=${encodeURIComponent(eventType)}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.totals?.events ?? 0;
}

test.describe("Auth Flow Telemetry", () => {
  test("login view, magic-link request, and session reset emit auth UI telemetry events", async ({
    page,
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    await page.context().clearCookies();
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/login?switch=1&returnTo=%2Ftrades");

    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await page.getByTestId("login-email-input").fill(COMMISSIONER_EMAIL);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(
      COMMISSIONER_EMAIL,
    );

    await page.getByTestId("login-sign-out").click();

    await expect
      .poll(() => countUiEvent(commissioner, "ui.auth.login.viewed"), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => countUiEvent(commissioner, "ui.auth.magic_link.requested"), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => countUiEvent(commissioner, "ui.auth.session.reset"), { timeout: 15_000 })
      .toBeGreaterThan(0);

    await commissioner.dispose();
  });
});
