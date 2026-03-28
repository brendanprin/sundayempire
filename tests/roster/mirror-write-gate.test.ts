import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRosterWritePolicy } from "@/lib/domain/roster/roster-write-policy";

test("roster write policy blocks direct writes during regular season", () => {
  const result = evaluateRosterWritePolicy({
    phase: "REGULAR_SEASON",
    actorRole: "MEMBER",
    action: "move",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "ROSTER_WRITE_BLOCKED_REGULAR_SEASON");
});

test("roster write policy allows offseason governance actions", () => {
  const result = evaluateRosterWritePolicy({
    phase: "OFFSEASON_ROLLOVER",
    actorRole: "MEMBER",
    action: "cut",
  });

  assert.equal(result.ok, true);
});
