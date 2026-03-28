import { Page, expect } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  getCapturedMagicLink,
  OWNER_EMAIL,
} from "../../e2e/helpers/api";

export { COMMISSIONER_EMAIL, OWNER_EMAIL } from "../../e2e/helpers/api";

export type SmokeRole = "commissioner" | "manager" | "read-only";

export interface SmokeUser {
  email: string;
  role: SmokeRole;
  teamId?: string;
  teamName?: string;
}

export const SMOKE_USERS: Record<SmokeRole, SmokeUser> = {
  commissioner: {
    email: COMMISSIONER_EMAIL,
    role: "commissioner",
  },
  manager: {
    email: OWNER_EMAIL,
    role: "manager",
  },
  "read-only": {
    email: "readonly@local.league",
    role: "read-only",
  },
};

/**
 * Logs in a user and navigates to league dashboard
 */
export async function loginAs(
  page: Page,
  role: SmokeRole,
  options: { returnTo?: string } = {}
): Promise<SmokeUser> {
  const user = SMOKE_USERS[role];
  const returnTo = options.returnTo || "/";

  await page.context().clearCookies();
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);

  await expect(page.getByRole("heading", { name: "Sign In", exact: true })).toBeVisible();

  const demoPanel = page.getByTestId("login-demo-auth-panel");
  if (await demoPanel.isVisible().catch(() => false)) {
    const roleTestId =
      role === "commissioner"
        ? "login-role-option-commissioner"
        : role === "manager"
          ? "login-role-option-member-team"
          : "login-role-option-member-no-team";

    await page.getByTestId(roleTestId).click();
    await page.getByTestId("login-identity-select").selectOption(user.email);
    await page.getByTestId("login-demo-submit").click();
  } else {
    await page.getByTestId("login-email-input").fill(user.email);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-magic-link-confirmation")).toContainText(user.email);

    const magicLink = await getCapturedMagicLink(new URL(page.url()).origin, user.email, {
      returnTo,
    });
    await page.goto(magicLink.url);
  }
  
  // Wait for redirect to complete
  await expect(page).toHaveURL(
    returnTo === "/" ? /\/($|league\/[^/]+$)/ : new RegExp(returnTo),
  );

  return user;
}

/**
 * Gets primary league ID for API operations
 */
export async function getPrimaryLeagueId(baseURL: string): Promise<string> {
  const api = await apiContext(baseURL, COMMISSIONER_EMAIL);
  
  const response = await api.get("/api/leagues");
  expect(response.ok()).toBeTruthy();
  
  const payload = await response.json();
  const leagues = payload.leagues as Array<{ id: string; name: string }>;
  
  await api.dispose();
  
  if (leagues.length === 0) {
    throw new Error("No leagues found for smoke tests");
  }
  
  return leagues[0].id;
}

/**
 * Sets up authentication for API context
 */
export async function createSmokeApiContext(baseURL: string, role: SmokeRole) {
  const user = SMOKE_USERS[role];
  return apiContext(baseURL, user.email);
}

/**
 * Verifies user is logged in and on dashboard
 */
export async function verifyLoggedIn(page: Page, role: SmokeRole): Promise<void> {
  await expect(page.getByTestId("role-context-role")).toBeVisible();
  
  const expectedRoleText = 
    role === "commissioner" ? "Commissioner" :
    "Member";
    
  await expect(page.getByTestId("role-context-role")).toHaveText(expectedRoleText);
}

/**
 * Navigates to a specific league workspace
 */
export async function navigateToLeague(page: Page, leagueId: string): Promise<void> {
  await page.goto(`/league/${leagueId}`);
  await expect(page.getByTestId("shell-top-bar")).toBeVisible();
  await expect(page.getByTestId("dashboard-page-eyebrow")).toBeVisible();
}
