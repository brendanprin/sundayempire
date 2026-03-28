import assert from "node:assert/strict";
import test from "node:test";
import { csvManualPlayerDirectoryAdapter } from "@/lib/domain/player/adapters/csv-manual-adapter";
import { fantasyProsSeedPlayerDirectoryAdapter } from "@/lib/domain/player/adapters/fantasypros-seed-adapter";
import {
  getPlayerDirectoryAdapter,
  listPlayerDirectoryAdapters,
} from "@/lib/domain/player/adapters/registry";

test("player directory adapter registry exposes known adapters with csv/manual defaulting", () => {
  assert.equal(getPlayerDirectoryAdapter(null)?.key, "csv-manual");
  assert.equal(getPlayerDirectoryAdapter("fantasypros-seed")?.key, "fantasypros-seed");
  assert.deepEqual(
    listPlayerDirectoryAdapters().map((adapter) => adapter.key),
    ["csv-manual", "fantasypros-seed"],
  );
});

test("csv/manual player directory adapter normalizes rows and synthesizes fallback source identity", async () => {
  const payload = await csvManualPlayerDirectoryAdapter.read({
    sourceLabel: "Manual upload",
    payload: {
      format: "csv",
      csv: [
        "name,position,nflTeam,age,yearsPro,statusText",
        "Example Player,WR,BUF,24,3,Healthy",
      ].join("\n"),
    },
  });

  assert.equal(payload.adapterKey, "csv-manual");
  assert.equal(payload.sourceLabel, "Manual upload");
  assert.equal(payload.requestError, null);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0]?.sourceKey, "csv-manual");
  assert.match(payload.rows[0]?.sourcePlayerId ?? "", /^manual:/);
  assert.equal(payload.rows[0]?.displayName, "Example Player");
  assert.equal(payload.rows[0]?.searchName, "example player");
  assert.equal(payload.rows[0]?.statusText, "Healthy");
  assert.equal(payload.warnings.length, 1);
});

test("fantasypros seed player directory adapter returns normalized provider rows", async () => {
  const payload = await fantasyProsSeedPlayerDirectoryAdapter.read({
    sourceLabel: "Refresh bootstrap",
  });

  assert.equal(payload.adapterKey, "fantasypros-seed");
  assert.equal(payload.format, "provider");
  assert.equal(payload.requestError, null);
  assert.ok(payload.rows.length > 0);
  assert.equal(payload.rows[0]?.sourceKey, "fantasypros-draft-rankings");
  assert.ok(payload.rows[0]?.sourcePlayerId.startsWith("fantasypros-draft-rankings-v1-"));
  assert.equal(payload.rows[0]?.displayName, payload.rows[0]?.name);
  assert.equal("overallRank" in payload.rows[0]!, false);
});
