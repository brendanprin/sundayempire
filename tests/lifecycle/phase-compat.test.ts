import assert from "node:assert/strict";
import test from "node:test";
import { getNextLeaguePhase, normalizeLeaguePhaseInput, toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";

test("normalizeLeaguePhaseInput accepts legacy and canonical phases", () => {
  assert.equal(normalizeLeaguePhaseInput("PRESEASON"), "PRESEASON_SETUP");
  assert.equal(normalizeLeaguePhaseInput("OFFSEASON"), "OFFSEASON_ROLLOVER");
  assert.equal(normalizeLeaguePhaseInput("ROOKIE_DRAFT"), "ROOKIE_DRAFT");
  assert.equal(normalizeLeaguePhaseInput("NOT_REAL"), null);
});

test("toLegacyLeaguePhase buckets canonical phases for legacy routes", () => {
  assert.equal(toLegacyLeaguePhase("ROOKIE_DRAFT"), "PRESEASON");
  assert.equal(toLegacyLeaguePhase("REGULAR_SEASON"), "REGULAR_SEASON");
  assert.equal(toLegacyLeaguePhase("TAG_OPTION_COMPLIANCE"), "OFFSEASON");
});

test("getNextLeaguePhase follows the canonical lifecycle order", () => {
  assert.equal(getNextLeaguePhase("PRESEASON_SETUP"), "ROOKIE_DRAFT");
  assert.equal(getNextLeaguePhase("PLAYOFFS"), "OFFSEASON_ROLLOVER");
  assert.equal(getNextLeaguePhase("TAG_OPTION_COMPLIANCE"), null);
});
