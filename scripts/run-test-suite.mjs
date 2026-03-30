import { spawnSync } from "node:child_process";

const SUITE_COMMANDS = {
  lifecycle: "node --test --import tsx tests/lifecycle/*.test.ts",
  auth: "node --test --import tsx tests/auth/*.test.ts",
  sprint2: "node --test --import tsx tests/team-membership/*.test.ts tests/team-season-state/*.test.ts tests/roster/*.test.ts",
  sprint3: "node --test --import tsx tests/contracts/*.test.ts tests/team-season-state/*.test.ts",
  sprint4: "node --test --import tsx tests/compliance/*.test.ts tests/commissioner/*.test.ts",
  sprint5: "node --test --import tsx tests/dashboard/*.test.ts",
  sprint6: "node --test --import tsx tests/detail/*.test.ts tests/contracts/impact-preview-services.test.ts",
  sprint7: "node --test --import tsx tests/trades/*.test.ts tests/dashboard/league-landing-dashboard.test.ts",
  sprint8: "node --test --import tsx tests/drafts/*.test.ts",
  sprint9: "node --test --import tsx tests/auction/*.test.ts tests/drafts/*.test.ts",
  sprint10: "node --test --import tsx tests/sync/*.test.ts",
  sprint11: "node --test --import tsx tests/activity/*.test.ts",
  teams: "node --test --import tsx tests/teams/*.test.ts",
};

const DEFAULT_SUITE_ORDER = [
  "lifecycle",
  "auth",
  "sprint2",
  "sprint3",
  "sprint4",
  "sprint5",
  "sprint6",
  "sprint7",
  "sprint8",
  "sprint9",
  "sprint10",
  "sprint11",
  "teams",
];

function normalizeSuiteName(rawName) {
  if (!rawName) {
    return null;
  }

  if (rawName === "all") {
    return "all";
  }

  if (/^\d+$/.test(rawName)) {
    return `sprint${rawName}`;
  }

  return rawName;
}

function resolveSuites(args) {
  if (args.length === 0) {
    return [];
  }

  const normalized = args.map(normalizeSuiteName);
  if (normalized.includes("all")) {
    return DEFAULT_SUITE_ORDER;
  }

  return Array.from(new Set(normalized));
}

function printUsage() {
  console.error("Usage: npm run test:suite -- <lifecycle|auth|sprint2..sprint11|2..11|all> [...]");
}

function runShellCommand(label, command) {
  console.log(`[test:suite] running ${label}`);

  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const requestedSuites = resolveSuites(process.argv.slice(2));
if (requestedSuites.length === 0) {
  printUsage();
  process.exit(1);
}

for (const suite of requestedSuites) {
  const command = SUITE_COMMANDS[suite];
  if (!command) {
    console.error(`[test:suite] unknown suite: ${suite}`);
    printUsage();
    process.exit(1);
  }

  runShellCommand(suite, command);
}
