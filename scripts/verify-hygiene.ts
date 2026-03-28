import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PROJECT_ROOT = process.cwd();

const DEPRECATED_FILE_PATHS = [
  "src/app/page.tsx",
  "src/app/teams/page.tsx",
  "src/app/teams/[teamId]/page.tsx",
  "src/app/trades/page.tsx",
  "src/app/draft/page.tsx",
  "src/app/commissioner/page.tsx",
  "src/middleware.ts",
  "docs/mvp-spec.md",
  "docs/phase-1-tickets.md",
];

const BANNED_REFERENCE_STRINGS = [
  "src/app/page.tsx",
  "src/app/teams/page.tsx",
  "src/app/teams/[teamId]/page.tsx",
  "src/app/trades/page.tsx",
  "src/app/draft/page.tsx",
  "src/app/commissioner/page.tsx",
  "src/middleware.ts",
];

const SCAN_ROOTS = ["README.md", "docs", "src", "tests", "scripts", "prisma"];
const TEXT_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml"]);
const IGNORE_PREFIXES = [
  "docs/archive/",
  "node_modules/",
  ".next/",
  "playwright-report/",
  "test-results/",
  "scripts/verify-hygiene.ts",
];

function shouldIgnorePath(pathname: string) {
  return IGNORE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function collectFiles(pathname: string, output: string[]) {
  if (!existsSync(pathname)) {
    return;
  }

  const stats = statSync(pathname);
  if (stats.isFile()) {
    const rel = relative(PROJECT_ROOT, pathname).replaceAll("\\", "/");
    if (shouldIgnorePath(rel)) {
      return;
    }
    if (TEXT_EXTENSIONS.has(extname(pathname)) || extname(pathname) === "") {
      output.push(pathname);
    }
    return;
  }

  for (const entry of readdirSync(pathname)) {
    collectFiles(join(pathname, entry), output);
  }
}

const findings: string[] = [];

for (const deprecatedPath of DEPRECATED_FILE_PATHS) {
  if (existsSync(join(PROJECT_ROOT, deprecatedPath))) {
    findings.push(`Deprecated artifact still present: ${deprecatedPath}`);
  }
}

const filesToScan: string[] = [];
for (const root of SCAN_ROOTS) {
  collectFiles(join(PROJECT_ROOT, root), filesToScan);
}

for (const file of filesToScan) {
  const content = readFileSync(file, "utf8");
  const rel = relative(PROJECT_ROOT, file).replaceAll("\\", "/");

  for (const needle of BANNED_REFERENCE_STRINGS) {
    if (content.includes(needle)) {
      findings.push(`Stale reference found in ${rel}: ${needle}`);
    }
  }
}

if (findings.length > 0) {
  console.error("[verify:hygiene] FAILED");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("[verify:hygiene] Passed. No deprecated artifacts or stale references detected.");
