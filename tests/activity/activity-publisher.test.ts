import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVITY_EVENT_TYPES } from "@/lib/domain/activity/event-types";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";

test("activity publisher returns an existing event when dedupe key already exists", async () => {
  const existingRecord = {
    id: "activity-1",
    dedupeKey: "trade.proposal.submitted:proposal-1",
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalSubmitted,
  };
  let createCalls = 0;

  const publisher = createActivityPublisher(undefined as never, {
    repository: {
      async findByDedupeKey(dedupeKey: string) {
        assert.equal(dedupeKey, "trade.proposal.submitted:proposal-1");
        return existingRecord as never;
      },
      async create() {
        createCalls += 1;
        throw new Error("create should not be called when dedupe match exists");
      },
    },
  });

  const result = await publisher.publish({
    leagueId: "league-1",
    seasonId: "season-1",
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalSubmitted,
    title: "Trade proposal submitted",
    body: "Cap Casualties sent a trade proposal to Bench Mob.",
    dedupeKey: "trade.proposal.submitted:proposal-1",
  });

  assert.equal(result, existingRecord);
  assert.equal(createCalls, 0);
});

test("activity publisher publishSafe swallows write failures", async () => {
  const publisher = createActivityPublisher(undefined as never, {
    repository: {
      async findByDedupeKey() {
        return null;
      },
      async create() {
        throw new Error("db unavailable");
      },
    },
  });

  const result = await publisher.publishSafe({
    leagueId: "league-1",
    seasonId: "season-1",
    eventType: ACTIVITY_EVENT_TYPES.sync.mismatchResolved,
    title: "Sync issue resolved",
    body: "Cap Casualties resolved a roster team difference sync issue.",
    sourceEntityType: "SYNC_MISMATCH",
    sourceEntityId: "mismatch-1",
    dedupeKey: "sync.mismatch.resolved:mismatch-1",
  });

  assert.equal(result, null);
});
