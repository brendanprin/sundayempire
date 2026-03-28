import { spawnSync } from "node:child_process";

const PHASE_COMMANDS = {
  "1": "node --import tsx scripts/phase1-smoke.ts",
  "2": "node --import tsx scripts/phase2-smoke.ts",
  "3": "node --import tsx scripts/phase3-smoke.ts",
  "6": "node --import tsx scripts/phase6-smoke.ts",
  "7": "node --import tsx scripts/phase7-smoke.ts",
  "8": "node --import tsx scripts/phase8-smoke.ts",
  "9": "node --import tsx scripts/phase9-smoke.ts",
  "10": "node --import tsx scripts/phase10-smoke.ts",
  "11": "node --import tsx scripts/phase11-smoke.ts",
};

const DEFAULT_PHASE_ORDER = ["1", "2", "3", "6", "7", "8", "9", "10", "11"];

function normalizePhase(rawPhase) {
  if (!rawPhase) {
    return null;
  }

  if (rawPhase === "all") {
    return "all";
  }

  return rawPhase.replace(/^phase/, "");
}

function resolvePhases(args) {
  if (args.length === 0) {
    return [];
  }

  const normalized = args.map(normalizePhase);
  if (normalized.includes("all")) {
    return DEFAULT_PHASE_ORDER;
  }

  return Array.from(new Set(normalized));
}

function printUsage() {
  console.error("Usage: npm run smoke:phase -- <1|2|3|6|7|8|9|10|11|phase1..phase11|all> [...]");
}

function runShellCommand(label, command) {
  console.log(`[smoke:phase] running phase ${label}`);

  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const requestedPhases = resolvePhases(process.argv.slice(2));
if (requestedPhases.length === 0) {
  printUsage();
  process.exit(1);
}

for (const phase of requestedPhases) {
  const command = PHASE_COMMANDS[phase];
  if (!command) {
    console.error(`[smoke:phase] unknown phase: ${phase}`);
    printUsage();
    process.exit(1);
  }

  runShellCommand(phase, command);
}
