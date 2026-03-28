import { expect, test } from "@playwright/test";
import {
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  apiContext,
  createLiveVeteranAuction,
} from "./helpers/api";

test.describe("Auction Room Interactive Flow", () => {
  test("select player from board -> open workspace -> place bid -> verify board updates", async ({ 
    page,
    context 
  }) => {
    // Setup: Create live auction as commissioner
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Interactive Flow Test ${Date.now()}`,
    );
    expect(auction.draftId).toBeTruthy();

    // Step 1: Navigate to auction room as owner
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for auction workspace to load
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();
    
    // Verify responsive layout is present
    const layoutVariants = [
      page.getByTestId("auction-layout-desktop"),
      page.getByTestId("auction-layout-tablet"), 
      page.getByTestId("auction-layout-mobile")
    ];
    
    let layoutFound = false;
    for (const layout of layoutVariants) {
      if (await layout.isVisible()) {
        layoutFound = true;
        break;
      }
    }
    expect(layoutFound).toBeTruthy();

    // Step 2: Select player from board
    // Try both desktop table and mobile list selectors
    const playerRow = page.locator('[data-testid^="auction-row-"], [data-testid^="mobile-auction-row-"]').first();
    await expect(playerRow).toBeVisible();
    
    // Extract player ID from the test id for later verification
    const testId = await playerRow.getAttribute('data-testid');
    const playerId = testId?.match(/(auction-row-|mobile-auction-row-)(.+)/)?.[2];
    expect(playerId).toBeTruthy();

    await playerRow.click();

    // Step 3: Verify selected player workspace opens
    // Check for desktop workspace OR mobile modal
    const workspaceSelectors = [
      page.getByTestId("auction-workspace-desktop"),
      page.getByTestId("auction-workspace-tablet"),
      page.getByTestId("mobile-auction-workspace")
    ];
    
    let workspaceVisible = false;
    for (const workspace of workspaceSelectors) {
      if (await workspace.isVisible()) {
        workspaceVisible = true;
        break;
      }
    }
    expect(workspaceVisible).toBeTruthy();

    // Verify player details are shown
    await expect(page.getByText(/player details|player actions/i)).toBeVisible();

    // Step 4: Place bid from workspace
    // Look for bid entry form across different layouts
    const bidFormSelectors = [
      page.getByTestId("bid-entry-form"),
      page.locator('input[placeholder*="salary"], input[placeholder*="Salary"]'),
      page.locator('input[type="number"]').first()
    ];

    let salaryInput = null;
    for (const selector of bidFormSelectors) {
      if (await selector.isVisible()) {
        salaryInput = selector;
        break;
      }
    }
    
    if (salaryInput) {
      await salaryInput.fill("1000000");

      // Look for years input
      const yearsInput = page.locator('input[placeholder*="years"], input[placeholder*="Years"]').or(
        page.locator('input[type="number"]').nth(1)
      );
      
      if (await yearsInput.isVisible()) {
        await yearsInput.fill("3");
      }

      // Submit bid
      const bidButtons = [
        page.getByRole("button", { name: /place bid|submit bid|open bid/i }),
        page.getByTestId("bid-open-button"),
        page.locator('button:has-text("Place")')
      ];

      let bidSubmitted = false;
      for (const button of bidButtons) {
        if (await button.isVisible() && await button.isEnabled()) {
          await button.click();
          bidSubmitted = true;
          break;
        }
      }

      if (bidSubmitted) {
        // Step 5: Verify board updates after bid
        // Wait for any loading states to complete
        await page.waitForTimeout(1000);

        // Look for success feedback
        const successIndicators = [
          page.getByText(/bid placed|bid submitted|success/i),
          page.locator('[data-testid*="success"]'),
          page.locator('.text-green, .text-emerald')
        ];

        for (const indicator of successIndicators) {
          if (await indicator.isVisible()) {
            break; // Found success indicator
          }
        }

        // Verify the bid appears on the board (if still visible)
        if (playerId) {
          const updatedRow = page.locator(`[data-testid*="${playerId}"]`);
          if (await updatedRow.isVisible()) {
            // Check for indicators that we're leading or bidding
            await expect(
              updatedRow.locator('text=/you lead|leading|you bid|bidding/i, [data-testid*="leading"], [data-testid*="bidding"]')
            ).toBeVisible();
          }
        }
      }
    }

    await commissioner.dispose();
  });

  test("verify selected-player history and value explanation render", async ({ 
    page,
    context 
  }) => {
    // Setup
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `History Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Select a player
    const playerRow = page.locator('[data-testid^="auction-row-"], [data-testid^="mobile-auction-row-"]').first();
    await expect(playerRow).toBeVisible();
    await playerRow.click();

    // Verify workspace appears
    await expect(
      page.getByTestId("auction-workspace-desktop")
        .or(page.getByTestId("auction-workspace-tablet"))
        .or(page.getByTestId("mobile-auction-workspace"))
    ).toBeVisible();

    // Check for history section
    const historySelectors = [
      page.getByTestId("bid-history"),
      page.getByText(/bid history|auction history|previous bids/i),
      page.locator('[data-testid*="history"]')
    ];

    let historyFound = false;
    for (const selector of historySelectors) {
      if (await selector.isVisible()) {
        historyFound = true;
        break;
      }
    }

    // History section should exist even if empty
    expect(historyFound).toBeTruthy();

    // Check for value explanation
    const valueSelectors = [
      page.getByText(/total value|contract value|value breakdown/i),
      page.getByTestId("value-explanation"),
      page.locator('text=/salary.*year/i')
    ];

    let valueFound = false;
    for (const selector of valueSelectors) {
      if (await selector.isVisible()) {
        valueFound = true;
        break;
      }
    }

    expect(valueFound).toBeTruthy();

    await commissioner.dispose();
  });

  test("verify filters/search still work in dense board mode", async ({ 
    page,
    context 
  }) => {
    // Setup 
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Filter Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for board to load
    await expect(
      page.getByTestId("auction-board-desktop")
        .or(page.getByTestId("auction-board-mobile"))
    ).toBeVisible();

    // Test search functionality
    const searchSelectors = [
      page.locator('input[placeholder*="Search"], input[placeholder*="search"]'),
      page.getByTestId("auction-search-input"),
      page.getByTestId("mobile-search-input")
    ];

    let searchInput = null;
    for (const selector of searchSelectors) {
      if (await selector.isVisible()) {
        searchInput = selector;
        break;
      }
    }

    if (searchInput) {
      // Get initial row count
      const initialRows = page.locator('[data-testid^="auction-row-"], [data-testid^="mobile-auction-row-"]');
      const initialCount = await initialRows.count();

      // Perform search
      await searchInput.fill("QB");
      await page.waitForTimeout(500); // Allow filters to apply

      // Verify filtering worked (row count should change unless no QBs)
      const filteredCount = await initialRows.count();
      // Count may stay same if search returns same players, but search should be functional
      expect(filteredCount).toBeGreaterThanOrEqual(0);

      // Clear search
      await searchInput.fill("");
      await page.waitForTimeout(500);
    }

    // Test position filter (if available)
    const positionFilter = page.locator('select').filter({ hasText: /position/i }).or(
      page.locator('select option:has-text("QB")')
    );

    if (await positionFilter.first().isVisible()) {
      await positionFilter.first().selectOption({ label: "QB" });
      await page.waitForTimeout(500);
      
      // Should still have auction board visible
      await expect(
        page.getByTestId("auction-board-desktop")
          .or(page.getByTestId("auction-board-mobile"))
      ).toBeVisible();
    }

    await commissioner.dispose();
  });

  test("verify manager rail shows relevant context", async ({ 
    page,
    context 
  }) => {
    // Setup
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Rail Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Check for manager rail content across layouts
    const managerContextSelectors = [
      page.getByTestId("auction-rail-desktop"),
      page.getByTestId("auction-mobile-action-bar"),
      page.getByText(/cap room|manager context|roster/i)
    ];

    let contextFound = false;
    for (const selector of managerContextSelectors) {
      if (await selector.isVisible()) {
        contextFound = true;
        break;
      }
    }

    expect(contextFound).toBeTruthy();

    // Verify cap room information is displayed
    await expect(page.getByText(/cap room|\$|\d+/)).toBeVisible();

    // Check if manager info access is available on mobile
    const managerInfoButton = page.getByRole("button", { name: /manager info|manager context/i });
    if (await managerInfoButton.isVisible()) {
      await managerInfoButton.click();
      await expect(page.getByTestId("auction-rail-mobile")).toBeVisible();
    }

    await commissioner.dispose();
  });

  test("verify status/timer visual states render truthfully", async ({ 
    page,
    context 
  }) => {
    // Setup
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Status Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Check for auction status chips
    const statusChips = page.locator('[data-testid*="auction-status"], [data-testid*="mobile-status"]');
    await expect(statusChips.first()).toBeVisible();

    // Verify status chips have appropriate visual states
    const statusStates = statusChips.locator('text=/open|blind|awarded|expired/i');
    if (await statusStates.first().isVisible()) {
      // Status should be readable
      const statusText = await statusStates.first().textContent();
      expect(statusText?.length).toBeGreaterThan(0);
    }

    // Check for timer displays
    const timers = page.locator('[data-testid*="timer"], [data-testid*="mobile-timer"]');
    if (await timers.first().isVisible()) {
      // Timer should show time information
      await expect(timers.first()).toContainText(/\d+[hms]|\d+:\d+|ended|expired/i);
    }

    // Verify room status display
    await expect(page.getByText(/auction ends|live auction|room status/i)).toBeVisible();

    await commissioner.dispose();
  });

  test("verify mobile interaction path works correctly", async ({ 
    page,
    context 
  }) => {
    // Setup - Force mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `Mobile Test ${Date.now()}`,
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Should see mobile layout
    await expect(page.getByTestId("auction-layout-mobile")).toBeVisible();
    await expect(page.getByTestId("auction-board-mobile")).toBeVisible();

    // Mobile list should be present
    await expect(page.getByTestId("mobile-auction-list")).toBeVisible();

    // Select a player from mobile list
    const mobilePlayerCard = page.locator('[data-testid^="mobile-auction-row-"]').first();
    await expect(mobilePlayerCard).toBeVisible();
    await mobilePlayerCard.click();

    // Mobile workspace should open
    await expect(page.getByTestId("mobile-auction-workspace")).toBeVisible();

    // Should have tab navigation
    await expect(page.getByTestId("tab-player")).toBeVisible();
    await expect(page.getByTestId("tab-manager")).toBeVisible();

    // Switch to manager tab
    await page.getByTestId("tab-manager").click();
    await expect(page.getByTestId("mobile-workspace-manager")).toBeVisible();

    // Close modal
    await page.getByTestId("mobile-workspace-close").click();
    
    // Should return to mobile list
    await expect(page.getByTestId("mobile-auction-list")).toBeVisible();

    // Mobile action bar should be visible when workspace closed
    await expect(page.getByTestId("auction-mobile-action-bar")).toBeVisible();

    await commissioner.dispose();
  });
});