import { test, expect } from "@playwright/test";
import { apiContext, createLiveVeteranAuction } from "../helpers/test-context";

const COMMISSIONER_EMAIL = process.env.COMMISSIONER_EMAIL || "test-commissioner@sundayempire.com";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "test-owner@sundayempire.com";

test.describe("Auction Room Responsive Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure consistent rendering for visual tests
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("desktop auction layout visual baseline", async ({ page, context }) => {
    // Setup viewport for desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Desktop Visual Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for board to load
    await expect(page.getByTestId("auction-layout-desktop")).toBeVisible();
    await expect(page.getByTestId("auction-board-desktop")).toBeVisible();
    await expect(page.getByTestId("auction-rail-desktop")).toBeVisible();

    // Take baseline screenshot
    await expect(page).toHaveScreenshot("auction-desktop-baseline.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Select a player and capture workspace state
    const playerRow = page.locator('[data-testid^="auction-row-"]').first();
    await expect(playerRow).toBeVisible();
    await playerRow.click();

    // Wait for workspace to appear
    await expect(page.getByTestId("auction-workspace-desktop")).toBeVisible();

    // Take screenshot with selected player workspace
    await expect(page).toHaveScreenshot("auction-desktop-player-selected.png", {
      fullPage: true,
      animations: "disabled",
    });

    await commissioner.dispose();
  });

  test("tablet auction layout visual baseline", async ({ page, context }) => {
    // Setup viewport for tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Tablet Visual Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for board to load
    await expect(page.getByTestId("auction-layout-tablet")).toBeVisible();
    await expect(page.getByTestId("auction-board-desktop")).toBeVisible(); // Uses desktop board in tablet mode

    // Take baseline screenshot
    await expect(page).toHaveScreenshot("auction-tablet-baseline.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Select a player and capture workspace state
    const playerRow = page.locator('[data-testid^="auction-row-"]').first();
    await expect(playerRow).toBeVisible();
    await playerRow.click();

    // Wait for workspace to appear (should be side-by-side on tablet)
    await expect(page.getByTestId("auction-workspace-tablet")).toBeVisible();

    // Take screenshot with selected player workspace
    await expect(page).toHaveScreenshot("auction-tablet-player-selected.png", {
      fullPage: true,
      animations: "disabled",
    });

    await commissioner.dispose();
  });

  test("mobile auction layout visual baseline", async ({ page, context }) => {
    // Setup viewport for mobile
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Mobile Visual Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for mobile layout to load
    await expect(page.getByTestId("auction-layout-mobile")).toBeVisible();
    await expect(page.getByTestId("auction-board-mobile")).toBeVisible();
    await expect(page.getByTestId("mobile-auction-list")).toBeVisible();

    // Take baseline screenshot
    await expect(page).toHaveScreenshot("auction-mobile-baseline.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Select a player to open mobile workspace
    const mobilePlayerCard = page.locator('[data-testid^="mobile-auction-row-"]').first();
    await expect(mobilePlayerCard).toBeVisible();
    await mobilePlayerCard.click();

    // Wait for mobile workspace to appear
    await expect(page.getByTestId("mobile-auction-workspace")).toBeVisible();

    // Take screenshot with mobile workspace open
    await expect(page).toHaveScreenshot("auction-mobile-workspace-open.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Switch to manager tab
    const managerTab = page.getByTestId("tab-manager");
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await expect(page.getByTestId("mobile-workspace-manager")).toBeVisible();

      // Take screenshot of manager tab
      await expect(page).toHaveScreenshot("auction-mobile-workspace-manager.png", {
        fullPage: true,
        animations: "disabled",
      });
    }

    await commissioner.dispose();
  });

  test("responsive breakpoint transition visual validation", async ({ page, context }) => {
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Breakpoint Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Test key breakpoints
    const breakpoints = [
      { width: 1280, height: 720, name: "desktop" },
      { width: 1024, height: 768, name: "desktop-small" },
      { width: 768, height: 1024, name: "tablet" },
      { width: 375, height: 667, name: "mobile" },
    ];

    for (const breakpoint of breakpoints) {
      await page.setViewportSize({ 
        width: breakpoint.width, 
        height: breakpoint.height 
      });

      // Wait for layout to stabilize
      await page.waitForTimeout(500);

      // Verify appropriate layout is shown
      const layoutVariants = [
        { testId: "auction-layout-desktop", sizes: ["desktop", "desktop-small"] },
        { testId: "auction-layout-tablet", sizes: ["tablet"] },
        { testId: "auction-layout-mobile", sizes: ["mobile"] },
      ];

      for (const variant of layoutVariants) {
        if (variant.sizes.includes(breakpoint.name)) {
          await expect(page.getByTestId(variant.testId)).toBeVisible();
        }
      }

      // Take screenshot for this breakpoint
      await expect(page).toHaveScreenshot(`auction-breakpoint-${breakpoint.name}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    }

    await commissioner.dispose();
  });

  test("auction status states visual validation", async ({ page, context }) => {
    // Setup viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Status States Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for board to load
    await expect(page.getByTestId("auction-layout-desktop")).toBeVisible();

    // Capture auction room with various status states
    await expect(page).toHaveScreenshot("auction-status-states-overview.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Select a player to show detailed status rendering
    const playerRow = page.locator('[data-testid^="auction-row-"]').first();
    await expect(playerRow).toBeVisible();
    await playerRow.click();

    // Wait for workspace
    await expect(page.getByTestId("auction-workspace-desktop")).toBeVisible();

    // Capture workspace with status detail
    await expect(page).toHaveScreenshot("auction-status-states-workspace.png", {
      fullPage: true,
      animations: "disabled",
    });

    await commissioner.dispose();
  });

  test("mobile auction action flow visual states", async ({ page, context }) => {
    // Setup mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Mobile Action Flow Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Step 1: Mobile list state
    await expect(page.getByTestId("auction-layout-mobile")).toBeVisible();
    await expect(page).toHaveScreenshot("mobile-action-flow-01-list.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Step 2: Player selection
    const mobilePlayerCard = page.locator('[data-testid^="mobile-auction-row-"]').first();
    await expect(mobilePlayerCard).toBeVisible();
    await mobilePlayerCard.click();

    // Step 3: Workspace open
    await expect(page.getByTestId("mobile-auction-workspace")).toBeVisible();
    await expect(page).toHaveScreenshot("mobile-action-flow-02-workspace-open.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Step 4: Manager tab
    const managerTab = page.getByTestId("tab-manager");
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await expect(page).toHaveScreenshot("mobile-action-flow-03-manager-tab.png", {
        fullPage: true,
        animations: "disabled",
      });

      // Switch back to player tab
      await page.getByTestId("tab-player").click();
    }

    // Step 5: Bid form interaction (if available)
    const salaryInput = page.locator('input[placeholder*="salary"], input[placeholder*="Salary"]');
    if (await salaryInput.isVisible()) {
      await salaryInput.fill("1000000");
      
      // Capture bid form filled state
      await expect(page).toHaveScreenshot("mobile-action-flow-04-bid-form-filled.png", {
        fullPage: true,
        animations: "disabled",
      });
    }

    await commissioner.dispose();
  });

  test("auction filter states visual validation", async ({ page, context }) => {
    // Setup viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Create test auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Filter States Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for board to load
    await expect(page.getByTestId("auction-layout-desktop")).toBeVisible();

    // Take screenshot with no filters
    await expect(page).toHaveScreenshot("auction-filters-none.png", {
      fullPage: true,
      animations: "disabled",
    });

    // Apply search filter if available
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill("QB");
      await page.waitForTimeout(500); // Allow filter to apply

      await expect(page).toHaveScreenshot("auction-filters-search-active.png", {
        fullPage: true,
        animations: "disabled",
      });
    }

    await commissioner.dispose();
  });
});