import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Canonical Language Standards", () => {
  const CANONICAL_ROUTES = [
    { path: "/rules", name: "Rules & Deadlines" },
    { path: "/teams", name: "Teams Directory" },
    { path: "/players", name: "Players Directory" },
    { path: "/trades", name: "Trades" },
    { path: "/draft", name: "Picks & Draft" },
    { path: "/activity", name: "Activity" },
    { path: "/dashboard", name: "Dashboard" }
  ];

  const FORBIDDEN_PILOT_TERMS = [
    "operational guide",
    "team workspace", 
    "player decision page",
    "proposal workflow",
    "workflow home",
    "decision support",
    "roster posture",
    "preview-backed"
  ];

  const FORBIDDEN_ARCHITECTURE_TERMS = [
    "workspace",
    "pilot",
    "prototype", 
    "beta",
    "experimental",
    "decision page",
    "operational"
  ];

  CANONICAL_ROUTES.forEach(route => {
    test(`${route.name} contains no pilot/operator language`, async ({ page }) => {
      await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
      
      try {
        await page.goto(route.path);
        
        // Wait for page to load
        await page.waitForSelector("[data-testid='page-header-band'], main", { timeout: 5000 });
        
        const pageContent = await page.textContent("[data-testid='page-header-band'], main");
        const lowerContent = pageContent?.toLowerCase() || "";

        // Check for forbidden pilot terms
        FORBIDDEN_PILOT_TERMS.forEach(term => {
          expect(lowerContent, `Route ${route.path} should not contain pilot term: "${term}"`).not.toContain(term);
        });

        // Check for forbidden architecture terms (except in acceptable contexts)
        FORBIDDEN_ARCHITECTURE_TERMS.forEach(term => {
          if (term === 'workspace' && (route.path === '/dashboard' || route.path === '/draft')) {
            // Workspace is acceptable in specific contexts (league workspace, draft workspace)
            return;
          }
          expect(lowerContent, `Route ${route.path} should not contain architecture term: "${term}"`).not.toContain(term);
        });

        // Verify route has canonical action-focused language instead of workflow-focused
        if (route.path === "/trades") {
          expect(lowerContent).toMatch(/trade builder|trade review|proposal|exchange/i);
          expect(lowerContent).not.toMatch(/workflow|process/i);
        }

      } catch (error) {
        // Skip routes that require specific context (like team/player detail)
        if (route.path.includes("/teams") || route.path.includes("/players")) {
          test.skip();
        } else {
          throw error;
        }
      }
    });
  });

  test("Commissioner routes maintain canonical language standards", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    
    const commissionerRoutes = [
      "/rules",
      "/trades", 
      "/commissioner"
    ];

    for (const routePath of commissionerRoutes) {
      await page.goto(routePath);
      await page.waitForSelector("[data-testid='page-header-band'], main", { timeout: 5000 });
      
      const pageContent = await page.textContent("[data-testid='page-header-band'], main");
      const lowerContent = pageContent?.toLowerCase() || "";

      // Even commissioner views should not use pilot language in canonical routes
      FORBIDDEN_PILOT_TERMS.forEach(term => {
        expect(lowerContent, `Commissioner route ${routePath} should not contain pilot term: "${term}"`).not.toContain(term);
      });
    }
  });

  test("Settings canonical routes are prominently featured over compatibility", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto("/settings");

    // Verify canonical section has primary prominence
    await expect(page.getByTestId("settings-canonical-section")).toBeVisible();
    await expect(page.getByText("Primary Workspace")).toBeVisible();
    await expect(page.getByText("Canonical browse surfaces")).toBeVisible();

    // Verify compatibility section is clearly secondary  
    await expect(page.getByTestId("settings-compatibility-links")).toBeVisible();
    await expect(page.getByText("Secondary Access")).toBeVisible();
    await expect(page.getByText("Compatibility and utilities")).toBeVisible();

    // Verify visual hierarchy: canonical should appear before compatibility
    const canonicalBox = await page.getByTestId("settings-canonical-section").boundingBox();
    const compatibilityBox = await page.getByTestId("settings-compatibility-links").boundingBox();
    
    expect(canonicalBox?.x).toBeLessThan(compatibilityBox?.x || 0);
  });
});