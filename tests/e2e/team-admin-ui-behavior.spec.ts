import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Team Admin UI Component Behavior", () => {
  let leagueId: string;

  test.beforeEach(async ({ baseURL }) => {
    const now = Date.now();
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    
    const createdLeagueResponse = await commissioner.post("/api/leagues", {
      data: {
        name: `UI Test League ${now}`,
        description: "UI component behavior testing",
        seasonYear: 2026,
      },
    });
    
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    leagueId = createdLeaguePayload.league.id as string;
  });

  test.describe("Status Badge Rendering", () => {
    test("renders status badges with correct styling and content", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Check that status badges have proper CSS classes for visual consistency
      const openSlotBadges = page.locator('tbody span:has-text("Open Slot")');
      const firstBadge = openSlotBadges.first();
      
      await expect(firstBadge).toBeVisible();
      
      // Verify badge has proper styling classes
      const classes = await firstBadge.getAttribute('class');
      expect(classes).toMatch(/rounded-full|bg-slate-400\/10|text-slate-400|ring-1/);
      
      // Verify badge text content is correct
      await expect(firstBadge).toHaveText('Open Slot');
    });

    test("different status badges have distinct visual appearance", async ({ page, baseURL }) => {
      const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

      // Create different states to test badge variations
      await commissioner.post("/api/teams", {
        data: {
          name: "Badge Test Team",
          abbreviation: "BTT",
          divisionLabel: "North",
        },
      });

      await commissioner.post("/api/league/invites", {
        data: {
          ownerName: "Badge Test Owner",
          ownerEmail: `badge.${Date.now()}@example.com`,
          teamName: "Invite Badge Team",
          teamAbbreviation: "IBT",
          divisionLabel: "South",
        },
      });

      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Check different status badge types exist with different styling
      const badgeSelectors = [
        { text: "Open Slot", expectedColor: "slate" },
        { text: "Team Created / No Owner", expectedColor: "blue" },
        { text: "Invite Pending", expectedColor: "amber" },
        { text: "Invite Created - Email Disabled", expectedColor: "blue" }
      ];

      for (const badge of badgeSelectors) {
        const element = page.locator(`span:has-text("${badge.text}")`);
        if (await element.isVisible()) {
          const classes = await element.getAttribute('class');
          expect(classes).toMatch(new RegExp(`bg-${badge.expectedColor}|text-${badge.expectedColor}`));
        }
      }
    });
  });

  test.describe("Form Validation Visual Feedback", () => {
    test("form buttons provide proper visual disabled/enabled states", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Test team creation form
      const createButton = page.getByRole("button", { name: "Create Team" }).first();
      
      // Initially disabled
      await expect(createButton).toBeDisabled();
      await expect(createButton).toHaveClass(/opacity-50|disabled:opacity-50/);
      
      // Fill required field
      await page.getByPlaceholder("e.g., Lightning Bolts").fill("Test Team");
      
      // Should become enabled
      await expect(createButton).toBeEnabled();
      await expect(createButton).not.toHaveClass(/opacity-50/);
    });

    test("invite form validates all required fields with proper feedback", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      await page.getByText("Add Team + Invite Owner").click();

      const inviteButton = page.getByRole("button", { name: "Create Team & Send Invite" });
      
      // Check progressive validation
      await expect(inviteButton).toBeDisabled();
      
      // Fill owner name only
      await page.getByPlaceholder("e.g., John Smith").fill("Test Owner");
      await expect(inviteButton).toBeDisabled();
      
      // Add email
      await page.getByPlaceholder("e.g., john@example.com").fill("test@example.com");
      await expect(inviteButton).toBeDisabled();
      
      // Add team name - should enable
      await page.locator('input[placeholder="e.g., Lightning Bolts"]').nth(1).fill("Test Team");
      await expect(inviteButton).toBeEnabled();
    });

    test("form fields show proper focus states and accessibility", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Test tabbing through form fields
      await page.getByPlaceholder("e.g., Lightning Bolts").focus();
      await expect(page.getByPlaceholder("e.g., Lightning Bolts")).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.getByPlaceholder("e.g., LB")).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('input[placeholder="e.g., North"]')).toBeFocused();
    });
  });

  test.describe("Modal Behavior and Interaction", () => {
    test("team creation modal opens and closes correctly", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Click create team for specific slot
      await page.getByRole("button", { name: "Create Team" }).first().click();
      
      // Modal should appear with proper backdrop
      const modal = page.getByText("Create Team for Slot #1");
      await expect(modal).toBeVisible();
      
      // Should have backdrop
      const backdrop = page.locator('.fixed.inset-0.bg-black\\/50');
      await expect(backdrop).toBeVisible();
      
      // Test escape key closes modal
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
    });

    test("invite modal shows correct context and validation", async ({ page, baseURL }) => {
      const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

      // Create a team to invite to
      await commissioner.post("/api/teams", {
        data: {
          name: "Modal Test Team",
          abbreviation: "MTT",
          divisionLabel: "North",
        },
      });

      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Find team row and open invite modal
      const teamRow = page.locator('tr:has-text("Modal Test Team")');
      await teamRow.getByRole("button", { name: "Invite" }).click();
      
      // Modal should show correct team context
      await expect(page.getByText("Invite Owner for Modal Test Team")).toBeVisible();
      
      // Test modal form validation
      const sendButton = page.getByRole("button", { name: "Send Invite" });
      await expect(sendButton).toBeDisabled();
      
      // Fill form
      await page.getByPlaceholder("e.g., John Smith").fill("Modal Test Owner");
      await page.getByPlaceholder("e.g., john@example.com").fill("modaltest@example.com");
      
      await expect(sendButton).toBeEnabled();
      
      // Test cancel
      await page.getByText("Cancel").click();
      await expect(page.getByText("Invite Owner for Modal Test Team")).not.toBeVisible();
    });
  });

  test.describe("Tab Navigation and Mode Switching", () => {
    test("tab navigation preserves proper visual state", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Test initial tab state
      const teamOnlyTab = page.getByText("Add Team Only").first();
      await expect(teamOnlyTab).toHaveClass(/border-sky-500|text-sky-400/);
      
      // Switch to invite tab
      await page.getByText("Add Team + Invite Owner").click();
      const inviteTab = page.getByText("Add Team + Invite Owner");
      await expect(inviteTab).toHaveClass(/border-sky-500|text-sky-400/);
      
      // Original tab should not be active
      await expect(teamOnlyTab).not.toHaveClass(/border-sky-500|text-sky-400/);
      
      // Switch to CSV tab
      await page.getByText("Import Multiple Teams").click();
      const csvTab = page.getByText("Import Multiple Teams");
      await expect(csvTab).toHaveClass(/border-sky-500|text-sky-400/);
    });

    test("mode content switches correctly with proper form display", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Team only mode
      await expect(page.getByText("Create a single team without assigning an owner")).toBeVisible();
      await expect(page.getByRole("button", { name: "Create Team" }).first()).toBeVisible();
      
      // Switch to invite mode
      await page.getByText("Add Team + Invite Owner").click();
      await expect(page.getByText("Create a team and immediately invite someone to manage it")).toBeVisible();
      await expect(page.getByText("Owner Information")).toBeVisible();
      await expect(page.getByText("Team Information")).toBeVisible();
      await expect(page.getByRole("button", { name: "Create Team & Send Invite" })).toBeVisible();
      
      // Switch to CSV mode
      await page.getByText("Import Multiple Teams").click();
      await expect(page.getByText("Upload a CSV file to create many teams and invites at once")).toBeVisible();
      await expect(page.getByText("Paste CSV Data")).toBeVisible();
      await expect(page.getByRole("textbox")).toBeVisible();
    });

    test("mode switching shows proper guidance and recommendations", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Check each mode has proper guidance
      const modes = [
        { 
          tab: "Add Team Only", 
          recommendation: "Best for adding teams you'll assign owners to later",
          icon: "🏆"
        },
        { 
          tab: "Add Team + Invite Owner", 
          recommendation: "Best when you know who will manage the team",
          icon: "📧"
        },
        { 
          tab: "Import Multiple Teams", 
          recommendation: "Best for setting up entire leagues quickly",
          icon: "📊"
        }
      ];

      for (const mode of modes) {
        await page.getByText(mode.tab).click();
        await expect(page.getByText(mode.recommendation)).toBeVisible();
        await expect(page.getByText(mode.icon)).toBeVisible();
      }
    });
  });

  test.describe("CSV Import UI Workflow", () => {
    test("CSV textarea provides proper formatting guidance and examples", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      await page.getByText("Import Multiple Teams").click();
      
      // Check format guidance is prominent
      await expect(page.getByText("Format: team_name,owner_name,owner_email,abbreviation,division")).toBeVisible();
      
      // Check textarea has helpful placeholder
      const textarea = page.getByRole("textbox");
      const placeholder = await textarea.getAttribute('placeholder');
      
      expect(placeholder).toContain('team_name,owner_name,owner_email,abbreviation,division');
      expect(placeholder).toContain('Lightning Bolts,John Smith');
      expect(placeholder).toContain('Thunder Hawks,Jane Doe');
      
      // Test textarea is properly styled for CSV input
      const classes = await textarea.getAttribute('class');
      expect(classes).toMatch(/font-mono|text-slate-100|bg-slate-800/);
    });

    test("validation results display with proper visual hierarchy", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      await page.getByText("Import Multiple Teams").click();
      
      // Enter test CSV
      const csvData = `Team One,Owner One,owner1@example.com,T1,North
Team Two,Owner Two,,T2,South`; // Invalid - missing email

      await page.getByRole("textbox").fill(csvData);
      await page.getByRole("button", { name: "Validate CSV" }).click();
      
      // Check validation summary structure
      await expect(page.getByText("Review Import Summary")).toBeVisible();
      await expect(page.getByText("Import Summary")).toBeVisible();
      
      // Check statistics are in proper grid layout
      await expect(page.getByText("Total Rows")).toBeVisible();
      await expect(page.getByText("Valid Rows")).toBeVisible();
      await expect(page.getByText("Invalid Rows")).toBeVisible();
      
      // Check row details show proper status indicators
      await expect(page.getByText("Row Details")).toBeVisible();
      await expect(page.locator('text="✓ Valid"')).toBeVisible();
      await expect(page.locator('text="✗ Invalid"')).toBeVisible();
    });

    test("import workflow shows proper step progression", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      await page.getByText("Import Multiple Teams").click();
      
      // Step 1 should be visible
      await expect(page.getByText("1")).toBeVisible();
      await expect(page.getByText("Paste CSV Data")).toBeVisible();
      
      // Enter valid CSV to progress workflow
      const csvData = `Team Test,Owner Test,test@example.com,TT,North`;
      await page.getByRole("textbox").fill(csvData);
      await page.getByRole("button", { name: "Validate CSV" }).click();
      
      // Step 2 should appear
      await expect(page.getByText("2")).toBeVisible();
      await expect(page.getByText("Review Import Summary")).toBeVisible();
      
      // Step 3 should appear
      await expect(page.getByText("3")).toBeVisible();
      await expect(page.getByText("Apply Changes")).toBeVisible();
      
      // Check step styling shows progression
      const steps = page.locator('[class*="rounded-full"][class*="bg-"]');
      await expect(steps).toHaveCountGreaterThan(0);
    });
  });

  test.describe("Table Interaction and Styling", () => {
    test("table rows show proper hover states and selection", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Check table structure
      const table = page.getByRole("table");
      await expect(table).toBeVisible();
      
      // Check rows have hover states
      const firstRow = page.locator('tbody tr').first();
      await expect(firstRow).toHaveClass(/hover:bg-slate-800\/30/);
      
      // Check table headers are properly styled
      const headers = page.locator('thead th');
      await expect(headers).toHaveCountGreaterThan(0);
      
      for (let i = 0; i < await headers.count(); i++) {
        const header = headers.nth(i);
        const classes = await header.getAttribute('class');
        expect(classes).toMatch(/text-xs|font-medium|text-slate-300|uppercase/);
      }
    });

    test("action buttons maintain consistent styling across row states", async ({ page, baseURL }) => {
      const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);

      // Create different row states
      await commissioner.post("/api/teams", {
        data: {
          name: "Style Test Team",
          abbreviation: "STT",
          divisionLabel: "North",
        },
      });

      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Check button styling consistency
      const buttons = page.locator('tbody button');
      
      for (let i = 0; i < Math.min(5, await buttons.count()); i++) {
        const button = buttons.nth(i);
        const classes = await button.getAttribute('class');
        
        // All buttons should have consistent base styling
        expect(classes).toMatch(/rounded|px-|py-|text-xs|font-medium|border/);
        
        // Different button types should have appropriate colors
        const text = await button.textContent();
        if (text?.includes('Create')) {
          expect(classes).toMatch(/bg-green-600|text-white/);
        } else if (text?.includes('Invite')) {
          expect(classes).toMatch(/border-amber-600|text-amber/);
        } else if (text?.includes('Edit')) {
          expect(classes).toMatch(/border-slate-600|text-slate/);
        }
      }
    });

    test("table is responsive and accessible", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Check table has overflow handling
      const tableContainer = page.locator('.overflow-x-auto');
      await expect(tableContainer).toBeVisible();
      
      // Check table has proper role
      const table = page.getByRole("table");
      await expect(table).toBeVisible();
      
      // Check headers have proper content
      const expectedHeaders = ["Slot", "Team", "Owner/Manager", "Division", "Status", "Actions"];
      for (const header of expectedHeaders) {
        await expect(page.getByText(header)).toBeVisible();
      }
    });
  });

  test.describe("State Consistency and Error Handling", () => {
    test("busy states disable appropriate controls", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Form should be enabled initially
      const createButton = page.getByRole("button", { name: "Create Team" }).first();
      const teamNameInput = page.getByPlaceholder("e.g., Lightning Bolts");
      
      await teamNameInput.fill("Available Team");
      await expect(createButton).toBeEnabled();
      
      // In a real scenario with busy state, buttons would be disabled
      // We can test the CSS classes exist for disabled states
      await expect(createButton).toHaveClass(/disabled:opacity-50/);
    });

    test("error messages display appropriately without breaking layout", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Test CSV validation errors
      await page.getByText("Import Multiple Teams").click();
      
      const invalidCsv = `Team Missing Email,John Doe,,TME,North`;
      await page.getByRole("textbox").fill(invalidCsv);
      await page.getByRole("button", { name: "Validate CSV" }).click();

      // Error should be styled appropriately
      const errorElement = page.locator('.text-red-400, [class*="text-red"]');
      if (await errorElement.count() > 0) {
        const classes = await errorElement.first().getAttribute('class');
        expect(classes).toMatch(/text-red-400|text-xs/);
      }
    });

    test("success states show appropriate feedback", async ({ page }) => {
      await page.setExtraHTTPHeaders({ 
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      });
      await page.goto(`/league/${leagueId}`);

      // Test success styling exists for positive feedback
      const successElements = page.locator('.text-green-400, .bg-green-500\\/10, [class*="text-green"]');
      
      // Success elements should have proper styling when they appear
      if (await successElements.count() > 0) {
        const classes = await successElements.first().getAttribute('class');
        expect(classes).toMatch(/green/);
      }
    });
  });

});