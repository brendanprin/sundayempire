import assert from "node:assert/strict";
import test from "node:test";
import { parseImportRows } from "@/lib/player-import";
import { validateSnapshotPayload } from "@/lib/snapshot";
import { parseTradeRequest } from "@/lib/trades";
import { SNAPSHOT_VERSION } from "@/types/snapshot";

test("parseTradeRequest parses valid mixed asset payload", () => {
  const parsed = parseTradeRequest({
    teamAId: "team-a",
    teamBId: "team-b",
    notes: "swap",
    teamAAssets: [
      { assetType: "PLAYER", playerId: "player-a1" },
      { assetType: "PICK", futurePickId: "pick-a1" },
    ],
    teamBAssets: [{ assetType: "PLAYER", playerId: "player-b1" }],
  });

  assert.equal(parsed.findings.length, 0);
  assert.ok(parsed.request);
  assert.equal(parsed.request?.teamAAssets.length, 2);
  assert.equal(parsed.request?.teamBAssets.length, 1);
  assert.equal(parsed.request?.notes, "swap");
});

test("parseTradeRequest returns finding for same-team input", () => {
  const parsed = parseTradeRequest({
    teamAId: "team-a",
    teamBId: "team-a",
    teamAAssets: [],
    teamBAssets: [],
  });

  assert.equal(parsed.request, null);
  assert.ok(
    parsed.findings.some((finding) => finding.code === "SAME_TEAM_NOT_ALLOWED"),
  );
});

test("validateSnapshotPayload rejects malformed payload", () => {
  const parsed = validateSnapshotPayload({
    version: 999,
    exportedAt: "bad-date",
    source: {},
    data: {},
  });

  assert.equal(parsed.valid, false);
  assert.ok(parsed.findings.length >= 3);
  assert.equal(parsed.snapshot, null);
});

test("validateSnapshotPayload accepts minimal valid payload", () => {
  const parsed = validateSnapshotPayload({
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      leagueId: "league-1",
      seasonId: "season-1",
      seasonYear: 2026,
    },
    data: {
      leagues: [],
      seasons: [],
      rulesets: [],
      owners: [],
      teams: [],
      players: [],
      rosterSlots: [],
      contracts: [],
      capPenalties: [],
      futurePicks: [],
      drafts: [],
      draftSelections: [],
      trades: [],
      tradeAssets: [],
      transactions: [],
    },
  });

  assert.equal(parsed.valid, true);
  assert.ok(parsed.snapshot);
  assert.equal(parsed.findings.length, 0);
});

test("parseImportRows validates json payload shape", () => {
  const parsed = parseImportRows({
    format: "json",
    players: { not: "an-array" },
  });

  assert.equal(parsed.requestError, "JSON import requires players as an array of rows.");
  assert.equal(parsed.normalizedRows.length, 0);
});

test("parseImportRows parses csv rows and flags invalid rows", () => {
  const parsed = parseImportRows({
    format: "csv",
    csv: [
      "sourceKey,sourcePlayerId,externalId,name,displayName,position,nflTeam,age,yearsPro,statusCode,statusText,isRestricted",
      "fantasypros,seed-1,legacy-1,Valid Player,Valid Player,WR,BUF,24,3,ACTIVE,Healthy,false",
      "fantasypros,seed-2,legacy-2,Bad Position,Bad Position,XYZ,BUF,24,3,ACTIVE,Healthy,false",
    ].join("\n"),
  });

  assert.equal(parsed.requestError, null);
  assert.equal(parsed.rawRows.length, 2);
  assert.equal(parsed.normalizedRows.length, 1);
  assert.equal(parsed.normalizedRows[0].name, "Valid Player");
  assert.equal(parsed.normalizedRows[0].sourceKey, "fantasypros");
  assert.equal(parsed.normalizedRows[0].sourcePlayerId, "seed-1");
  assert.equal(parsed.normalizedRows[0].displayName, "Valid Player");
  assert.equal(parsed.normalizedRows[0].searchName, "valid player");
  assert.equal(parsed.normalizedRows[0].statusCode, "ACTIVE");
  assert.equal(parsed.normalizedRows[0].statusText, "Healthy");
  assert.ok(
    parsed.errors.some((message) =>
      message.includes("position must be one of QB, RB, WR, TE, K, DST"),
    ),
  );
});
