import { runNpmScriptWithArgs } from "./mvp-harness";

const FIXTURE_PHASES = ["7", "8", "9", "10", "11"] as const;

async function main() {
  for (const phase of FIXTURE_PHASES) {
    runNpmScriptWithArgs("smoke:phase", [phase]);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        fixturePhases: [...FIXTURE_PHASES],
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to seed MVP demo fixtures.");
  process.exitCode = 1;
});
