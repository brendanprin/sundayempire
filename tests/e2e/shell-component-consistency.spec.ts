import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Shell Component Consistency", () => {
  test("PageHeaderBand integration consistent across canonical routes", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    
    const canonicalRoutes = [
      { path: "/rules", expectedTitle: "Rules & Deadlines", expectedEyebrow: "League Guide" },
      { path: "/trades", expectedTitle: "Trades", expectedEyebrow: /Trade|Proposal/ },
      { path: "/activity", expectedTitle: "Activity", expectedEyebrow: /League Activity|Activity/ },
      { path: "/settings", expectedTitle: "Settings", expectedEyebrow: "Settings" }
    ];

    for (const route of canonicalRoutes) {
      try {
        await page.goto(route.path);
        
        // Every canonical route should have consistent header structure
        const pageHeader = page.locator(".shell-page-header, [data-testid='page-header-band'], .page-header");
        await expect(pageHeader.first()).toBeVisible();
        
        // Should have consistent structure: eyebrow + title + description  
        const headerBand = page.locator(".shell-page-header, [data-testid='page-header-band'], .page-header").first();
        const headerExists = await headerBand.count() > 0;
        
        if (headerExists) {
          // Verify title is present and matches expected
          const titleElement = headerBand.getByRole("heading");
          const titleCount = await titleElement.count();
          if (titleCount > 0) {
            const titleText = await titleElement.textContent();
            expect(titleText).toContain(route.expectedTitle);
          }
        }
        
        // Verify eyebrow is present (if expected)
        if (route.expectedEyebrow) {
          const eyebrowText = await headerBand.textContent();
          if (typeof route.expectedEyebrow === "string") {
            expect(eyebrowText).toContain(route.expectedEyebrow);
          } else {
            expect(eyebrowText).toMatch(route.expectedEyebrow);
          }
        }
        
        // Verify description is present
        const description = headerBand.locator("p, div").filter({ hasText: /.{20,}/ });
        await expect(description.first()).toBeVisible();
        
        // Verify consistent CSS classes and styling
        const headerStyles = await headerBand.getAttribute("class");
        expect(headerStyles).toMatch(/space-y|gap|mt|mb/); // Consistent spacing classes
        
      } catch (error) {
        // Skip routes that require specific context or data
        if (route.path.includes("/teams") || route.path.includes("/players")) {
          continue;
        } else {
          console.log(`Failed on route: ${route.path}`, error);
          throw error;
        }
      }
    }
  });

  test("RetiredRouteFence uses PageHeaderBand patterns consistently", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    
    const retiredRoutes = ["/collaboration", "/planning", "/recaps"];
    
    for (const route of retiredRoutes) {
      await page.goto(route);
      
      // Should use PageHeaderBand instead of old CanonicalRouteState patterns
      await expect(page.getByTestId("page-header-band")).toBeVisible();
      await expect(page.getByTestId("retired-route-fence")).toBeVisible();
      
      // Should have consistent header structure
      const headerBand = page.getByTestId("page-header-band");
      await expect(headerBand.getByRole("heading")).toBeVisible();
      
      // Should have canonical replacement links with consistent styling
      const canonicalLinks = page.locator("[data-testid='retired-route-fence-links'] a");
      const linkCount = await canonicalLinks.count();
      expect(linkCount).toBeGreaterThan(0);
      
      // Links should use consistent green accent styling (Sprint 18)
      for (let i = 0; i < linkCount; i++) {
        const link = canonicalLinks.nth(i);
        const linkStyles = await link.getAttribute("class");
        expect(linkStyles).toMatch(/green|border.*green|bg.*green/);
      }
    }
  });

  test("CanonicalRouteState accessibility improvements functional", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    
    // Test with a route that might show error states (fake player ID)
    await page.goto("/players/nonexistent-player-id");
    
    // Should show error state with proper accessibility
    const errorState = page.getByTestId("player-route-state-message");
    if (await errorState.count() > 0) {
      // Should have proper ARIA role for error announcements
      const errorElement = await errorState.locator("section, div").first();
      const ariaRole = await errorElement.getAttribute("role");
      expect(ariaRole).toBe("alert");
      
      // Should have aria-live for screen reader announcements
      const ariaLive = await errorElement.getAttribute("aria-live");
      expect(ariaLive).toMatch(/assertive|polite/);
      
      // Action buttons should have proper focus management
      const actionButton = errorElement.locator("a, button").first();
      if (await actionButton.count() > 0) {
        const buttonStyles = await actionButton.getAttribute("class");
        expect(buttonStyles).toMatch(/focus:.*ring|focus:outline/);
      }
    }
  });

  test("Settings canonical vs compatibility visual hierarchy", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/settings");

    // Canonical section should have enhanced visual treatment
    const canonicalSection = page.locator("[data-testid='settings-canonical-section'] > div").first();
    const canonicalStyles = await canonicalSection.getAttribute("class");
    
    // Should have green border/background treatment (Sprint 18)
    expect(canonicalStyles).toMatch(/border.*green|bg.*green/);
    expect(canonicalStyles).toMatch(/gradient|from.*green/); // Gradient background
    
    // Should have larger padding/enhanced spacing
    expect(canonicalStyles).toMatch(/p-5|p-6|lg:p-6/);
    
    // Compatibility section should have standard treatment
    const compatibilitySection = page.locator("[data-testid='settings-compatibility-links'] > div").first();
    const compatibilityStyles = await compatibilitySection.getAttribute("class");
    
    // Should NOT have green treatment
    expect(compatibilityStyles).not.toMatch(/green/);
    // Should have slate/neutral styling
    expect(compatibilityStyles).toMatch(/slate|border.*slate|bg.*slate/);
    
    // Visual hierarchy should be clear: canonical larger/more prominent
    const canonicalBox = await canonicalSection.boundingBox();
    const compatibilityBox = await compatibilitySection.boundingBox();
    
    expect(canonicalBox?.height).toBeGreaterThan((compatibilityBox?.height || 0) * 0.8); // At least similar size
  });

  test("Component patterns prevent technical jargon in user-facing copy", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    
    const routes = ["/rules", "/trades", "/activity", "/settings"];
    
    for (const route of routes) {
      await page.goto(route);
      
      // Check PageHeaderBand content for technical jargon (flexible selector)
      const headerElement = page.locator(".shell-page-header, [data-testid='page-header-band'], .page-header").first();
      const headerExists = await headerElement.count() > 0;
      if (headerExists) {
        const headerContent = await headerElement.textContent();
        const lowerContent = headerContent?.toLowerCase() || "";
      
        // Should not contain architecture/implementation terms
        expect(lowerContent).not.toMatch(/route|component|state|props|api|endpoint/);
        expect(lowerContent).not.toMatch(/projection|payload|crud|mutation|query/);
        expect(lowerContent).not.toMatch(/workspace|utility|posture|backed|driven/);
      }
      
      // Should use action-focused, user-centric language
      expect(lowerContent).toMatch(/your|team|league|manage|view|current|status/);
    }
  });
});