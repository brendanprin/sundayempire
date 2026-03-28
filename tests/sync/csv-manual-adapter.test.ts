import assert from "node:assert/strict";
import test from "node:test";
import { csvManualSyncAdapter } from "@/lib/domain/sync/adapters/csv-manual-adapter";

test("csv/manual sync adapter parses roster and transaction csv payloads", () => {
  const payload = csvManualSyncAdapter.parse({
    sourceLabel: "Manual export",
    roster: {
      format: "csv",
      csv: [
        "playerSourceKey,playerSourcePlayerId,playerExternalId,playerName,position,teamName,rosterStatus,hostPlatformReferenceId",
        "sleeper,1001,player-1,Alpha QB,QB,Cap Casualties,ACTIVE,host-roster-1",
      ].join("\n"),
    },
    transactions: {
      format: "csv",
      csv: [
        "transactionType,summary,teamName,playerSourceKey,playerSourcePlayerId,playerExternalId,occurredAt",
        "ADD,Added Alpha QB,Cap Casualties,sleeper,1001,player-1,2026-03-21T12:00:00.000Z",
      ].join("\n"),
    },
  });

  assert.equal(payload.adapterKey, "csv-manual");
  assert.equal(payload.capabilities.rosterImport, true);
  assert.equal(payload.capabilities.transactionImport, true);
  assert.equal(payload.capabilities.bidirectionalRosterComparison, true);
  assert.equal(payload.capabilities.bidirectionalTransactionComparison, false);

  assert.equal(payload.roster?.rows.length, 1);
  assert.equal(payload.roster?.rows[0]?.playerSourceKey, "sleeper");
  assert.equal(payload.roster?.rows[0]?.playerSourcePlayerId, "1001");
  assert.equal(payload.roster?.rows[0]?.playerExternalId, "player-1");
  assert.equal(payload.roster?.rows[0]?.rosterStatus, "ACTIVE");
  assert.equal(payload.transactions?.rows.length, 1);
  assert.equal(payload.transactions?.rows[0]?.playerSourceKey, "sleeper");
  assert.equal(payload.transactions?.rows[0]?.playerSourcePlayerId, "1001");
  assert.equal(payload.transactions?.rows[0]?.transactionType, "ADD");
  assert.equal(payload.transactions?.rows[0]?.summary, "Added Alpha QB");
  assert.deepEqual(payload.warnings, [
    "CSV/manual transaction imports are treated as source rows for deterministic comparison. Missing-in-host transaction inference is disabled for this adapter.",
  ]);
});

test("csv/manual sync adapter reports request errors for malformed payloads", () => {
  const payload = csvManualSyncAdapter.parse({
    roster: {
      format: "csv",
      csv: "",
    },
    transactions: {
      format: "json",
      rows: "not-an-array",
    },
  });

  assert.equal(payload.roster?.requestError, "No import rows were provided.");
  assert.equal(payload.transactions?.requestError, "JSON import requires rows as an array of objects.");
});
