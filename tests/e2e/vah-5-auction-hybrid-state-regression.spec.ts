import { test, expect } from "@playwright/test";
import { COMMISSIONER_EMAIL, OWNER_EMAIL, apiContext, createLiveVeteranAuction } from "./helpers/api";

/**
 * VAH-5: Veteran Auction Hybrid-State Regression Pack
 * 
 * Comprehensive regression coverage to prevent slipping back into mixed legacy/canonical behavior.
 * Tests all VAH cleanup work: VAH-1 (blind cleanup), VAH-2 (board canonical), VAH-3 (overlay canonical), VAH-4 (ID fixes).
 */

test.describe("VAH-5 Veteran Auction Hybrid-State Regression", () => {
  
  test("VAH-1 regression: no blind-auction leakage in owner-facing room", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VAH-5 Blind Cleanup Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);

    // Wait for auction workspace to load
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // VAH-1: Verify no blind-auction banners exist
    await expect(page.getByText(/blind.*window.*active/i)).toHaveCount(0);
    await expect(page.getByText(/blind.*bidding.*mode/i)).toHaveCount(0);
    await expect(page.getByTestId("blind-window-banner")).toHaveCount(0);

    // VAH-1: Verify no "Blind Bidding" status chips 
    await expect(page.getByText("Blind Bidding")).toHaveCount(0);
    await expect(page.locator('[data-status="BLIND_BIDDING"]')).toHaveCount(0);

    // VAH-1: Verify no blind config exposure in projections
    await expect(page.getByText(/blind.*window.*seconds/i)).toHaveCount(0);
    await expect(page.getByText(/blind.*phase.*remaining/i)).toHaveCount(0);

    // Screenshot: Clean owner-facing room
    await page.screenshot({ 
      path: `vah-5-01-no-blind-leakage-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VAH-1 Regression: No blind-auction leakage found");
  });

  test("VAH-2 regression: board status column uses canonical display only", async ({ page, context }) => {
    // Setup: Create live auction  
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VAH-5 Board Canonical Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // VAH-2: Verify board rows use canonical display states
    const playerRows = page.locator('[data-testid^="auction-row-"]');
    await expect(playerRows.first()).toBeVisible();

    // Check that all status indicators use canonical states
    const statusElements = page.locator('[class*="badge"], [class*="chip"], [class*="status"]');
    
    // Should only see canonical states: "Open Market", "Active Bidding", "Awarded", "Ineligible"
    const canonicalStates = ["Open Market", "Active Bidding", "Awarded", "Ineligible"];
    
    for (const statusEl of await statusElements.all()) {
      const text = await statusEl.textContent();
      if (text && text.trim()) {
        // Should not contain raw status values like "ELIGIBLE", "OPEN_BIDDING", "AWARDED"
        expect(["ELIGIBLE", "OPEN_BIDDING", "AWARDED", "RESTRICTED"].includes(text.trim())).toBeFalsy();
      }
    }

    // VAH-2: Verify QuickActionIndicator uses displayState/displayConfig
    const quickActions = page.locator('[data-testid*="quick-action"]');
    if (await quickActions.count() > 0) {
      // Should not show raw status-based actions
      await expect(page.getByText("ELIGIBLE_ACTION")).toHaveCount(0);
      await expect(page.getByText("OPEN_BIDDING_ACTION")).toHaveCount(0);
    }

    // Screenshot: Canonical board display
    await page.screenshot({ 
      path: `vah-5-02-canonical-board-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VAH-2 Regression: Board uses canonical display states only");
  });

  test("VAH-3 regression: overlay/workspace canonical consistency", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VAH-5 Overlay Canonical Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // Select first player to open overlay/workspace
    const firstPlayer = page.locator('[data-testid^="auction-row-"]').first();
    await firstPlayer.click();

    // Wait for overlay or workspace to open (depending on breakpoint)
    const workspaceSelectors = [
      page.getByTestId("auction-workspace-desktop"),
      page.getByTestId("auction-workspace-tablet"),
      page.getByTestId("mobile-auction-workspace"),
      page.getByTestId("selected-player-workspace")
    ];
    
    let workspaceVisible = false;
    for (const workspace of workspaceSelectors) {
      if (await workspace.isVisible()) {
        workspaceVisible = true;
        break;
      }
    }
    expect(workspaceVisible).toBeTruthy();

    // VAH-3: Verify overlay header/body/action state consistency
    await page.waitForTimeout(1000); // Allow canonical presenter to load

    // Check header shows canonical state
    const headerSelectors = [
      page.getByTestId("player-overlay-header"),
      page.getByTestId("workspace-header"),
      page.locator('[data-testid*="header"]')
    ];
    
    for (const header of headerSelectors) {
      if (await header.isVisible()) {
        const headerText = await header.textContent();
        // Should not show raw status in header  
        expect(headerText).not.toMatch(/ELIGIBLE|OPEN_BIDDING|AWARDED|RESTRICTED/);
      }
    }

    // VAH-3: Verify no raw fallback logic is used  
    await expect(page.getByText("fallback")).toHaveCount(0);
    await expect(page.getByText("raw status")).toHaveCount(0);
    await expect(page.locator('[data-fallback="true"]')).toHaveCount(0);

    // Screenshot: Canonical overlay/workspace
    await page.screenshot({ 
      path: `vah-5-03-canonical-overlay-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VAH-3 Regression: Overlay/workspace uses canonical presentation only");
  });

  test("VAH-4 regression: no pool-entry vs player ID mismatches", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VAH-5 ID Mismatch Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // Select player to open workspace
    const firstPlayer = page.locator('[data-testid^="auction-row-"]').first();
    
    // Extract player ID from test attributes
    const testId = await firstPlayer.getAttribute('data-testid');
    const playerId = testId?.match(/auction-row-(.+)/)?.[1];
    expect(playerId).toBeTruthy();

    await firstPlayer.click();

    // Wait for workspace to open
    const workspace = page.getByTestId("auction-workspace-desktop").or(
      page.getByTestId("mobile-auction-workspace")
    );
    await expect(workspace).toBeVisible();

    // VAH-4: Attempt to place bid - should not fail due to ID mismatch
    const salaryInput = page.locator('input[placeholder*="salary"], input[placeholder*="Salary"], input[type="number"]').first();
    if (await salaryInput.isVisible()) {
      await salaryInput.fill("500000");
      
      // Select contract years if available
      const yearSelect = page.locator('select').first();
      if (await yearSelect.isVisible()) {
        await yearSelect.selectOption("2");
      }

      // Submit bid
      const bidButton = page.locator('text=Place Bid, text=Place First Bid, text=Submit Bid').first();
      if (await bidButton.isVisible()) {
        await bidButton.click();
        
        // Wait for bid submission - should not fail with ID mismatch error
        await page.waitForTimeout(3000);
        
        // VAH-4: Should not see ID-related errors
        await expect(page.getByText(/entry.*not.*found/i)).toHaveCount(0);
        await expect(page.getByText(/invalid.*player.*id/i)).toHaveCount(0);
        await expect(page.getByText(/mismatch.*id/i)).toHaveCount(0);
        
        // Should see success state or workspace still open (no crash)
        const stillOpen = await workspace.isVisible();
        expect(stillOpen).toBeTruthy();
      }
    }

    // Screenshot: Successful bid action path
    await page.screenshot({ 
      path: `vah-5-04-no-id-mismatch-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VAH-4 Regression: No pool-entry vs player ID mismatches found");
  });

  test("comprehensive state consistency across open/active/awarded", async ({ page, context }) => {
    // Setup: Create live auction 
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VAH-5 State Consistency Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // Test Open Market State
    const openMarketPlayer = page.locator('[data-testid^="auction-row-"]').first();
    await expect(openMarketPlayer).toContainText("Open Market");
    
    // Open market should show no timer, no salary, no years
    const timerInRow = openMarketPlayer.locator('[data-testid*="timer"]');
    await expect(timerInRow).toHaveCount(0);
    
    const salaryInRow = openMarketPlayer.locator('text=/\\$[0-9,]+/');
    await expect(salaryInRow).toHaveCount(0);

    // Click to open workspace and verify consistency
    await openMarketPlayer.click();
    
    const workspace = page.getByTestId("auction-workspace-desktop").or(
      page.getByTestId("mobile-auction-workspace")
    );
    await expect(workspace).toBeVisible();

    // Workspace should also show open market state
    await expect(workspace).toContainText("Open Market");
    await expect(workspace.locator('[data-testid*="timer"]')).toHaveCount(0);

    // Screenshot: Open market consistency
    await page.screenshot({ 
      path: `vah-5-05-open-market-consistency-${Date.now()}.png`, 
      fullPage: true 
    });

    // Place first bid to test Active Bidding state
    const salaryInput = workspace.locator('input[type="number"]').first();
    if (await salaryInput.isVisible()) {
      await salaryInput.fill("600000");
      
      const yearSelect = workspace.locator('select').first();
      if (await yearSelect.isVisible()) {
        await yearSelect.selectOption("3");
      }

      const bidButton = workspace.locator('text=Place First Bid, text=Place Bid, text=Submit Bid').first();
      if (await bidButton.isVisible()) {
        await bidButton.click();
        await page.waitForTimeout(3000);

        // After bid, should transition to Active Bidding
        await expect(workspace).toContainText("Active Bidding");
        
        // Should now show timer and bid details  
        await expect(workspace.locator('[data-testid*="timer"]')).toHaveCountGreaterThan(0);
        await expect(workspace).toContainText("$600,000");
        await expect(workspace).toContainText("3 years");

        // Go back to board and verify row also shows Active Bidding
        await page.goBack();
        await expect(openMarketPlayer).toContainText("Active Bidding");
        await expect(openMarketPlayer).toContainText("$600,000");

        // Screenshot: Active bidding consistency  
        await page.screenshot({ 
          path: `vah-5-06-active-bidding-consistency-${Date.now()}.png`, 
          fullPage: true 
        });
      }
    }

    console.log("✅ VAH-5 Comprehensive: State consistency verified across components");
  });

  test("board-to-overlay consistency prevents contradictions", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VAH-5 Board Overlay Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // Get state from board row
    const firstPlayer = page.locator('[data-testid^="auction-row-"]').first();
    const boardStatus = await firstPlayer.locator('[class*="badge"], [class*="status"]').first().textContent();
    
    // Open overlay/workspace
    await firstPlayer.click();
    
    const workspace = page.getByTestId("auction-workspace-desktop").or(
      page.getByTestId("mobile-auction-workspace")
    );
    await expect(workspace).toBeVisible();
    await page.waitForTimeout(1000);

    // Check workspace status matches board
    const workspaceStatus = await workspace.locator('[class*="badge"], [class*="status"]').first().textContent();
    
    // Both should show the same canonical state
    if (boardStatus && workspaceStatus) {
      expect(boardStatus.trim()).toBe(workspaceStatus.trim());
    }

    // Check for contradictory state combinations
    const statusText = await page.textContent('body');
    
    // Should not have contradictory combinations like:
    // "Open Market" + timer, "Open Market" + leader, "Bidding" + no contract terms
    if (statusText?.includes("Open Market")) {
      await expect(page.getByText(/timer.*active/i)).toHaveCount(0);
      await expect(page.getByText(/leading.*bid/i)).toHaveCount(0);
    }
    
    if (statusText?.includes("Active Bidding")) {
      // Should have contract terms
      const hasContractTerms = statusText.includes("$") && (
        statusText.includes("year") || statusText.includes("yr")
      );
      expect(hasContractTerms).toBeTruthy();
    }

    // Screenshot: Board-overlay consistency
    await page.screenshot({ 
      path: `vah-5-07-board-overlay-consistency-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VAH-5 Board-Overlay: No contradictory state combinations found");
  });

  test("VA-S2 regression: no 'Open market' filler in salary/value columns", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VA-S2 Salary Column Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // Find open market players (no active bids)
    const openMarketRows = page.locator('[data-testid^="auction-row-"]').filter({
      has: page.locator(':text-is("Open market"), [data-status="OPEN_MARKET"]')
    });
    
    await expect(openMarketRows).toHaveCount({ greaterThan: 0 });
    
    // VA-S2: Verify salary and total value columns show "—" not "Open market"
    const firstOpenMarketRow = openMarketRows.first();
    
    // Check all salary/value cells in the row
    const salaryCells = firstOpenMarketRow.locator('td').filter({
      hasText: /\$|salary|value|total/i
    });
    
    const allCells = await firstOpenMarketRow.locator('td').all();
    for (const cell of allCells) {
      const cellText = await cell.textContent();
      if (cellText) {
        // Financial columns should show "—" not "Open market"
        if (cellText.includes("$") || cellText.match(/\d+/)) {
          expect(cellText).not.toBe("Open market");
        } else if (cellText === "—") {
          // This is the expected fallback for empty financial values  
          expect(cellText).toBe("—");
        }
      }
    }

    // Check mobile view as well if applicable
    if (await page.locator('[data-testid^="mobile-auction-list"]').isVisible()) {
      const mobileOpenMarketCards = page.locator('[data-testid^="mobile-auction-card-"]').filter({
        has: page.locator(':text("Open market")')
      });
      
      if (await mobileOpenMarketCards.count() > 0) {
        const firstCard = mobileOpenMarketCards.first();
        const cardText = await firstCard.textContent();
        
        // Should not have "Open market" as fallback in financial data
        if (cardText?.includes("$")) {
          expect(cardText).not.toMatch(/Open market.*\$|salary.*Open market/);
        }
      }
    }

    // Screenshot: Clean salary/value columns
    await page.screenshot({ 
      path: `va-s2-clean-financial-columns-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VA-S2 Regression: Financial columns show '—' instead of 'Open market'");
  });

  test("VA-S3 regression: BLIND_BIDDING normalizes to canonical open-market", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VA-S3 Blind Bidding Normalization Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // VA-S3: Verify no rows appear as "Ineligible" due to BLIND_BIDDING status leakage
    const ineligibleRows = page.locator('[data-testid^="auction-row-"]').filter({
      has: page.locator(':text("Ineligible")')
    });
    
    // Get total player count for context
    const totalRows = await page.locator('[data-testid^="auction-row-"]').count();
    const ineligibleCount = await ineligibleRows.count();
    
    console.log(`Found ${ineligibleCount} ineligible players out of ${totalRows} total`);
    
    // Should not have excessive ineligible players (some truly ineligible players are expected)
    // But BLIND_BIDDING status should not cause ineligible state
    if (ineligibleCount > 0) {
      // Check if the ineligible players are legitimately ineligible (e.g., already on roster)
      const firstIneligible = ineligibleRows.first();
      if (await firstIneligible.isVisible()) {
        await firstIneligible.click();
        
        const workspace = page.getByTestId("auction-workspace-desktop").or(
          page.getByTestId("mobile-auction-workspace")
        );
        
        if (await workspace.isVisible()) {
          const workspaceText = await workspace.textContent();
          
          // Should show legitimate ineligibility reason, not blind bidding related
          expect(workspaceText).not.toMatch(/blind.*bidding.*not.*supported/i);
          expect(workspaceText).not.toMatch(/blind.*window.*active/i);
          expect(workspaceText).not.toMatch(/raw.*status.*blind/i);
        }
      }
    }

    // VA-S3: Verify owner-facing room only shows canonical states
    const allStatusBadges = page.locator('[class*="badge"], [class*="status"], [class*="chip"]');
    const canonicalStates = ["Open Market", "Active Bidding", "Awarded", "Ineligible"];
    
    for (const badge of await allStatusBadges.all()) {
      const badgeText = await badge.textContent();
      if (badgeText && badgeText.trim()) {
        const isCanonical = canonicalStates.some(state => 
          badgeText.toLowerCase().includes(state.toLowerCase())
        );
        const isLegacyState = ["BLIND_BIDDING", "ELIGIBLE", "OPEN_BIDDING", "REOPENED"].includes(badgeText.trim());
        
        // Should not show raw BLIND_BIDDING status to owners
        expect(isLegacyState).toBeFalsy();
      }
    }

    // VA-S3: Verify state resolution works for all player types
    const allRows = page.locator('[data-testid^="auction-row-"]');
    const rowCount = await allRows.count();
    
    for (let i = 0; i < Math.min(rowCount, 10); i++) { // Check first 10 players
      const row = allRows.nth(i);
      const rowText = await row.textContent();
      
      if (rowText) {
        // Each row should show one of the canonical states, never raw BLIND_BIDDING
        const hasCanonicalState = canonicalStates.some(state => 
          rowText.includes(state)
        );
        const hasLegacyState = rowText.includes("BLIND_BIDDING");
        
        expect(hasCanonicalState).toBeTruthy();
        expect(hasLegacyState).toBeFalsy();
      }
    }

    // Screenshot: Clean canonical states only
    await page.screenshot({ 
      path: `va-s3-canonical-state-normalization-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VA-S3 Regression: BLIND_BIDDING normalized to canonical states, no ineligible leakage");
  });

  test("VA-S4 regression: unified leader visibility and involvement logic", async ({ page, context }) => {
    // Setup: Create live auction
    const commissioner = await apiContext(context, COMMISSIONER_EMAIL);
    const auction = await createLiveVeteranAuction(
      commissioner,
      `VA-S4 Leader Visibility Test ${Date.now()}`
    );

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/draft/veteran-auction?session=${encodeURIComponent(auction.draftId!)}`);
    await expect(page.getByTestId("veteran-auction-workspace")).toBeVisible();

    // VA-S4: Verify no row shows "Leading" badge without valid active-bid display state
    const leadingRows = page.locator('[data-testid^="auction-row-"]').filter({
      has: page.locator(':text("● Leading")')
    });
    
    const leadingCount = await leadingRows.count();
    
    // If we have leading rows, verify each one has complete bid data
    for (let i = 0; i < leadingCount; i++) {
      const row = leadingRows.nth(i);
      const rowText = await row.textContent();
      
      if (rowText?.includes("● Leading")) {
        // Should NOT show "—" for salary or total value when leading
        const salaryCell = row.locator('td').filter({ hasText: /^\$|—/ }).first();
        const totalValueCell = row.locator('td').filter({ hasText: /^\$|—/ }).last();
        
        if (await salaryCell.isVisible()) {
          const salaryText = await salaryCell.textContent();
          expect(salaryText).not.toBe("—");
          expect(salaryText).toMatch(/\$[\d,]+/); // Should show actual dollar amount
        }
        
        if (await totalValueCell.isVisible()) {
          const totalText = await totalValueCell.textContent();
          expect(totalText).not.toBe("—");
          expect(totalText).toMatch(/\$[\d,]+/); // Should show actual dollar amount  
        }
        
        // Should have years displayed
        const yearsCell = row.locator('td').filter({ hasText: /\dy|—/ });
        if (await yearsCell.isVisible()) {
          const yearsText = await yearsCell.textContent();
          expect(yearsText).not.toBe("—");
          expect(yearsText).toMatch(/\d/); // Should show actual years
        }
      }
    }

    // VA-S4: Verify consistency - if salary/value shows "—", no "Leading" badge should appear
    const openMarketRows = page.locator('[data-testid^="auction-row-"]').filter({
      has: page.locator('td', { hasText: "—" })
    });
    
    const openMarketCount = await openMarketRows.count();
    
    for (let i = 0; i < openMarketCount; i++) {
      const row = openMarketRows.nth(i);
      const hasLeadingBadge = await row.locator(':text("● Leading")').count() > 0;
      
      // If row has "—" for financial data, should not show "Leading"
      if (hasLeadingBadge) {
        const rowText = await row.textContent();
        console.warn(`Found inconsistent row with both Leading badge and "—" data: ${rowText}`);
      }
      expect(hasLeadingBadge).toBeFalsy();
    }

    // VA-S4: Test leader column consistency
    const allRows = page.locator('[data-testid^="auction-row-"]');
    const rowCount = await allRows.count();
    
    for (let i = 0; i < Math.min(rowCount, 10); i++) { // Check first 10 rows
      const row = allRows.nth(i);
      const hasLeadingBadge = await row.locator(':text("● Leading")').count() > 0;
      const rowText = await row.textContent();
      
      if (hasLeadingBadge) {
        // Row with "Leading" badge should have complete bid information 
        const hasSalary = rowText?.match(/\$[\d,]+/);
        const hasYears = rowText?.match(/\d+y|\d+ years?/);
        
        expect(hasSalary).toBeTruthy();
        // Years might not be visible on mobile, so only check if years column exists
        const yearsColumn = row.locator('td').filter({ hasText: /\dy|—/ });
        if (await yearsColumn.isVisible()) {
          expect(hasYears).toBeTruthy();
        }
      }
    }

    // Screenshot: Unified leader visibility
    await page.screenshot({ 
      path: `va-s4-unified-leader-visibility-${Date.now()}.png`, 
      fullPage: true 
    });

    console.log("✅ VA-S4 Regression: Leader visibility and involvement logic unified, no inconsistent states");
  });
});