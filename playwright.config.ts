import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const allowLegacyIdentity = process.env.AUTH_COMPAT_ALLOW_LEGACY_IDENTITY ?? "1";
const demoAuthLoginEnabled = process.env.AUTH_DEMO_LOGIN_ENABLED ?? "0";
const magicLinkTestCapture = process.env.AUTH_MAGIC_LINK_TEST_CAPTURE ?? "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      `AUTH_COMPAT_ALLOW_LEGACY_IDENTITY=${allowLegacyIdentity} ` +
      `AUTH_DEMO_LOGIN_ENABLED=${demoAuthLoginEnabled} ` +
      `AUTH_MAGIC_LINK_TEST_CAPTURE=${magicLinkTestCapture} ` +
      `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "smoke",
      testDir: "./tests/smoke",
      use: {
        ...devices["Desktop Chrome"],
        trace: "on", // Always capture traces for smoke tests
        screenshot: "on", // Always capture screenshots for smoke tests
        video: "on", // Always capture videos for smoke tests
      },
      outputDir: "./artifacts/smoke/test-results",
      fullyParallel: false, // Run smoke tests sequentially for stability
      retries: 1, // Allow one retry for smoke tests
    },
  ],
});
