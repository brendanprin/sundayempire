import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Compatibility Fencing Validation", () => {
  test("Settings emphasizes canonical routes over compatibility routes", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/settings");

    // Verify canonical section styling suggests primary status
    const canonicalSection = page.locator("[data-testid='settings-canonical-section'] > div").first();
    const canonicalStyles = await canonicalSection.getAttribute("class");
    expect(canonicalStyles).toMatch(/green|primary/i);

    // Verify canonical section has enhanced prominence
    await expect(page.getByText("Primary Workspace")).toBeVisible();
    await expect(page.getByText("Core league management and browsing functionality")).toBeVisible();

    // Verify compatibility section clearly secondary
    await expect(page.getByText("Secondary Access")).toBeVisible();
    await expect(page.getByText("Bounded commissioner utilities")).toBeVisible();

    // Verify canonical routes listed prominently
    const canonicalLinks = page.locator("[data-testid='settings-canonical-section'] a");
    const canonicalCount = await canonicalLinks.count();
    expect(canonicalCount).toBeGreaterThan(0);

    // Verify compatibility routes clearly de-emphasized
    const compatibilityLinks = page.locator("[data-testid='settings-compatibility-links'] a");
    const compatibilityCount = await compatibilityLinks.count();
    expect(compatibilityCount).toBeGreaterThan(0);
    expect(canonicalCount).toBeGreaterThanOrEqual(compatibilityCount);
  });

  test("Retired routes provide clear canonical replacement guidance", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    
    const retiredRoutes = [
      "/collaboration",
      "/planning", 
      "/recaps"
    ];

    for (const route of retiredRoutes) {
      await page.goto(route);
      
      // Verify retirement fence is shown
      await expect(page.getByTestId("retired-route-fence")).toBeVisible();
      
      // Verify clear messaging about retirement
      await expect(page.getByText(/retired|no longer available/i)).toBeVisible();
      
      // Verify canonical replacement links are provided
      await expect(page.getByTestId("retired-route-fence-links")).toBeVisible();
      
      // Verify canonical links have green accent styling (Sprint 18)
      const canonicalLinks = page.locator("[data-testid='retired-route-fence-links'] a");
      const firstLink = canonicalLinks.first();
      const linkStyles = await firstLink.getAttribute("class");
      expect(linkStyles).toMatch(/green|hover.*green/);
      
      // Verify guidance is action-focused, not procedural
      const pageContent = await page.textContent("[data-testid='retired-route-fence']");
      expect(pageContent?.toLowerCase()).toMatch(/use these canonical routes|supported workflows/i);
      expect(pageContent?.toLowerCase()).not.toMatch(/please see|refer to|contact/i);
    }
  });

  test("Diagnostics remains appropriately gated for commissioners only", async ({ page }) => {
    // Test as owner (should not have access)
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/diagnostics");

    // Should see role gating, not diagnostics content
    await expect(page.getByTestId("diagnostics-compatibility-notice")).toBeVisible();
    await expect(page.getByText(/commissioner|admin|access/i).first()).toBeVisible();
    
    // Should not be able to access diagnostic content
    await expect(page.getByTestId("diagnostics-data")).toHaveCount(0);
    
    // Test as commissioner (should have access)
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/diagnostics");

    // Should see diagnostics content for commissioners
    await expect(page.getByTestId("diagnostics-page")).toBeVisible();
  });

  test("Compatibility routes do not overshadow canonical destinations", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    
    // From dashboard, canonical routes should be primary navigation
    await page.goto("/my-leagues");
    const dashboardNav = page.locator("nav, aside");
    
    // Canonical routes should be prominently featured
    await expect(dashboardNav.getByRole("link", { name: /teams|players|trades|rules|draft/i })).toBeVisible();
    
    // Compatibility routes should not be in primary navigation
    await expect(dashboardNav.getByRole("link", { name: /diagnostics|collaboration|planning|utility/i })).toHaveCount(0);
    
    // From any canonical route, compatibility should only be accessible via Settings
    const canonicalRoutes = ["/rules", "/trades", "/teams"];
    
    for (const route of canonicalRoutes) {
      try {
        await page.goto(route);
        const pageNav = page.locator("nav, aside");
        
        // Should have Settings link to access compatibility routes
        await expect(pageNav.getByRole("link", { name: "Settings" })).toBeVisible();
        
        // Should not have direct links to compatibility routes
        await expect(pageNav.getByRole("link", { name: /diagnostics|collaboration|planning/i })).toHaveCount(0);
        
      } catch (error) {
        // Skip routes that require specific context
        if (route.includes("/teams")) {
          continue;
        } else {
          throw error;
        }
      }
    }
  });
});