import { Page, TestInfo } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

export interface SmokeEvidence {
  screenshots: string[];
  videoPath?: string;
  tracePath?: string;
}

/**
 * Base directory for smoke test artifacts
 */
const SMOKE_ARTIFACTS_DIR = "artifacts/smoke";

/**
 * Captures a full-page screenshot for smoke evidence
 */
export async function captureScreenshot(
  page: Page, 
  testInfo: TestInfo, 
  name: string,
  options: { fullPage?: boolean } = {}
): Promise<string> {
  const { fullPage = true } = options;
  
  // Create artifacts directory
  const artifactDir = path.join(SMOKE_ARTIFACTS_DIR, testInfo.project.name || "default");
  await fs.mkdir(artifactDir, { recursive: true });
  
  // Generate screenshot path
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotName = `${testInfo.title.replace(/[^a-zA-Z0-9]/g, "-")}-${name}-${timestamp}.png`;
  const screenshotPath = path.join(artifactDir, screenshotName);
  
  // Capture screenshot
  await page.screenshot({ 
    path: screenshotPath, 
    fullPage,
    animations: "disabled"
  });
  
  return screenshotPath;
}

/**
 * Captures smoke evidence for a test spec
 */
export async function captureSmokeEvidence(
  page: Page,
  testInfo: TestInfo,
  stage: string
): Promise<SmokeEvidence> {
  const evidence: SmokeEvidence = {
    screenshots: [],
  };
  
  try {
    // Capture screenshot
    const screenshotPath = await captureScreenshot(page, testInfo, stage);
    evidence.screenshots.push(screenshotPath);
    
    // Video is automatically captured by Playwright config
    // Trace is captured on failure by Playwright config
    
    return evidence;
  } catch (error) {
    console.warn(`Failed to capture smoke evidence for ${stage}:`, error);
    return evidence;
  }
}

/**
 * Saves smoke test summary to machine-readable format
 */
export async function saveSmokeTestSummary(
  testInfo: TestInfo,
  summary: {
    specName: string;
    status: "passed" | "failed" | "skipped";
    duration: number;
    evidence: SmokeEvidence;
    errors?: string[];
  }
): Promise<void> {
  try {
    const artifactDir = path.join(SMOKE_ARTIFACTS_DIR, testInfo.project.name || "default");
    await fs.mkdir(artifactDir, { recursive: true });
    
    const timestamp = new Date().toISOString();
    const summaryPath = path.join(
      artifactDir, 
      `${testInfo.title.replace(/[^a-zA-Z0-9]/g, "-")}-summary.json`
    );
    
    const summaryData = {
      ...summary,
      timestamp,
      projectName: testInfo.project.name,
      testPath: testInfo.file,
    };
    
    await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2));
  } catch (error) {
    console.warn("Failed to save smoke test summary:", error);
  }
}

/**
 * Waits for page to be fully loaded and stable
 */
export async function waitForPageStable(page: Page): Promise<void> {
  // Wait for network to be idle and DOM content loaded
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  
  // Wait for any animations to settle
  await page.waitForTimeout(500);
}

/**
 * Sets up consistent browser state for smoke tests
 */
export async function setupSmokeTestPage(page: Page): Promise<void> {
  // Reduce motion for consistent screenshots
  await page.emulateMedia({ reducedMotion: "reduce" });
  
  // Set consistent viewport
  await page.setViewportSize({ width: 1280, height: 720 });
  
  // Clear any existing storage - wrap in try/catch for security errors
  await page.context().clearCookies();
  
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch (error) {
    // Ignore localStorage security errors when page hasn't loaded yet
    console.log('Note: localStorage not accessible yet (this is normal)');
  }
}