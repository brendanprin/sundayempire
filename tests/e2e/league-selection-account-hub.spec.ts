import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

/**
 * League Selection Account Hub Experience Tests
 * 
 * Ensures the pre-selection experience feels like an account home
 * rather than a league workspace, with clean navigation and language.
 */
test.describe("League Selection Account Hub", () => {
  test.describe.configure({ mode: "serial" });

  test("my-leagues page feels like account home, not workspace", async ({ page, baseURL }) => {
    // Create a user with no leagues to test account home experience
    const testEmail = `account-home-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/my-leagues");
    
    // === ACCOUNT-FOCUSED LANGUAGE ===
    // Should use account-focused language, not league workspace language
    await expect(page.getByText("Dynasty Football Hub")).toBeVisible();
    await expect(page.getByText("Welcome to your dynasty football account")).toBeVisible();
    await expect(page.getByText("Start your dynasty football journey")).toBeVisible();
    
    // Should NOT use workspace language
    await expect(page.getByText("Workspace")).not.toBeVisible();
    await expect(page.getByText("Open League")).not.toBeVisible();
    await expect(page.getByText("League Workspace")).not.toBeVisible();
    
    // === NO LEAGUE-SPECIFIC CHROME ===
    // Should not show league-specific navigation or context
    await expect(page.getByTestId("shell-side-nav")).not.toBeVisible();
    await expect(page.getByTestId("shell-top-bar")).not.toBeVisible();
    await expect(page.getByText("Current League")).not.toBeVisible();
    
    // === CLEAN LAYOUT ===
    // Should have clean, account-focused layout
    await expect(page.getByText("SundayEmpire")).toBeVisible();
    await expect(page.getByTestId("user-identity-summary")).toBeVisible();
    await expect(page.getByTestId("my-leagues-empty-state")).toBeVisible();
    
    // === ACTION-FOCUSED LANGUAGE ===
    // Actions should focus on entering leagues, not managing workspaces
    await expect(page.getByText("Create New League")).toBeVisible();
    await expect(page.getByText("Ready to Start Playing?")).toBeVisible();
  });

  test("select-league page has account home feel", async ({ page, baseURL }) => {
    const testEmail = `select-league-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/select-league");
    
    // === ACCOUNT HUB LANGUAGE ===
    await expect(page.getByText("Dynasty Football Hub")).toBeVisible();
    await expect(page.getByText("Welcome to your dynasty football account")).toBeVisible();
    
    // === NO MISLEADING CURRENT LEAGUE FRAMING ===
    await expect(page.getByText("Current League")).not.toBeVisible();
    await expect(page.getByText("Active League")).not.toBeVisible();
    await expect(page.getByText("Selected League")).not.toBeVisible();
    
    // === ENTRY-FOCUSED ACTIONS ===
    await expect(page.getByText("Enter League")).toBeVisible();
    await expect(page.getByText("Create New League")).toBeVisible();
  });

  test("league list uses entry language, not workspace language", async ({ page, baseURL }) => {
    // Create a user with multiple leagues to test selection experience
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    
    // Create multiple leagues
    const league1 = await ctx.post("/api/leagues", {
      name: `Hub Test League 1 ${Date.now()}`,
      seasonYear: 2026
    });
    
    const league2 = await ctx.post("/api/leagues", {
      name: `Hub Test League 2 ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/my-leagues");
    
    // === ENTRY-FOCUSED BUTTON LANGUAGE ===
    const leagueCards = page.getByTestId("league-card");
    const firstCard = leagueCards.first();
    
    // Should say "Enter League" not "Open League"
    await expect(firstCard.getByText("Enter League")).toBeVisible();
    await expect(firstCard.getByText("Open League")).not.toBeVisible();
    
    // === WELCOME BACK LANGUAGE ===
    await expect(page.getByText("Welcome back! Choose from your")).toBeVisible();
    await expect(page.getByText("continue playing dynasty football")).toBeVisible();
    
    // === NO WORKSPACE MANAGEMENT LANGUAGE ===
    await expect(page.getByText("Manage your")).not.toBeVisible();
    await expect(page.getByText("workspace you want to use")).not.toBeVisible();
  });

  test("redirect from /dashboard goes straight to account hub", async ({ page, baseURL }) => {
    const testEmail = `redirect-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    // Start at /dashboard - should redirect immediately to clean account hub
    await page.goto("/dashboard");
    
    // Should redirect to /my-leagues
    await expect(page).toHaveURL("/my-leagues");
    
    // Should land on clean account page, not workspace
    await expect(page.getByText("Dynasty Football Hub")).toBeVisible();
    await expect(page.getByTestId("my-leagues-page")).toBeVisible();
    
    // Should not show any league workspace chrome
    await expect(page.getByTestId("shell-top-bar")).not.toBeVisible();
    await expect(page.getByTestId("shell-side-nav")).not.toBeVisible();
  });

  test("no intermediate loading states show league workspace language", async ({ page, baseURL }) => {
    const testEmail = `loading-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/my-leagues");
    
    // === LOADING STATE LANGUAGE ===
    // Even loading states should use account language
    const loadingContent = page.getByText("Loading your dynasty football account");
    if (await loadingContent.isVisible()) {
      // Should use account-focused loading language
      await expect(page.getByText("Account Overview")).toBeVisible();
      await expect(page.getByText("Loading your dynasty football account and leagues")).toBeVisible();
      
      // Should NOT use workspace loading language
      await expect(page.getByText("Loading Your Leagues")).not.toBeVisible();
      await expect(page.getByText("Checking your league memberships")).not.toBeVisible();
    }
  });

  test("user is not confused about league entry state", async ({ page, baseURL }) => {
    // Test that language makes it clear users haven't entered a league yet
    const testEmail = `confusion-test-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": testEmail });
    
    await page.goto("/my-leagues");
    
    // === CLEAR PRE-ENTRY STATE ===
    // Language should make it clear user hasn't entered a league yet
    await expect(page.getByText("Create a new league or join an existing one")).toBeVisible();
    await expect(page.getByText("Start your dynasty football journey")).toBeVisible();
    
    // === NO AMBIGUOUS LANGUAGE ===
    // Should not suggest user is already "in" a league context
    await expect(page.getByText("current league")).not.toBeVisible();
    await expect(page.getByText("active league")).not.toBeVisible();
    await expect(page.getByText("this league")).not.toBeVisible();
    
    // === CLEAR NEXT STEPS ===
    // Should be clear what the user needs to do
    await expect(page.getByText("Create New League")).toBeVisible();
    await expect(page.getByText("Join League")).toBeVisible();
  });

  test("visual hierarchy prioritizes league list and actions", async ({ page, baseURL }) => {
    // Create leagues to test visual hierarchy
    const ctx = apiContext(baseURL!, COMMISSIONER_EMAIL);
    const league1 = await ctx.post("/api/leagues", {
      name: `Hierarchy Test League ${Date.now()}`,
      seasonYear: 2026
    });
    
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/my-leagues");
    
    // === LEAGUE CARDS PROMINENT ===
    const leagueGrid = page.getByTestId("my-leagues-grid");
    await expect(leagueGrid).toBeVisible();
    
    // League cards should be main focus
    const leagueCards = page.getByTestId("league-card");
    await expect(leagueCards).toHaveCount(1);
    
    // === ACTION BUTTONS PROMINENT ===
    const enterButton = page.getByText("Enter League");
    await expect(enterButton).toBeVisible();
    
    const createButton = page.getByText("Create New League");
    await expect(createButton).toBeVisible();
    
    // === USER INFO SECONDARY ===
    // User identity should be present but secondary
    const userInfo = page.getByTestId("user-identity-summary");
    await expect(userInfo).toBeVisible();
    
    // Sign out should be smaller/secondary action
    await expect(page.getByText("Sign out")).toBeVisible();
  });
});