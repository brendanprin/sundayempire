import assert from "node:assert/strict";
import test from "node:test";
import { createAuctionAwardRepository } from "@/lib/repositories/auction/auction-award-repository";
import { createAuctionBidRepository } from "@/lib/repositories/auction/auction-bid-repository";
import { createAuctionPlayerPoolExclusionRepository } from "@/lib/repositories/auction/auction-player-pool-exclusion-repository";
import { createAuctionPlayerPoolEntryRepository } from "@/lib/repositories/auction/auction-player-pool-entry-repository";

test("auction repository scaffolding exposes pool, bid, and award methods", () => {
  const stubClient = {} as never;

  const poolEntries = createAuctionPlayerPoolEntryRepository(stubClient);
  const exclusions = createAuctionPlayerPoolExclusionRepository(stubClient);
  const bids = createAuctionBidRepository(stubClient);
  const awards = createAuctionAwardRepository(stubClient);

  assert.equal(typeof poolEntries.replaceForDraft, "function");
  assert.equal(typeof poolEntries.create, "function");
  assert.equal(typeof poolEntries.findById, "function");
  assert.equal(typeof poolEntries.findByPlayer, "function");
  assert.equal(typeof poolEntries.listForDraft, "function");
  assert.equal(typeof poolEntries.update, "function");

  assert.equal(typeof exclusions.replaceForDraft, "function");
  assert.equal(typeof exclusions.listForDraft, "function");

  assert.equal(typeof bids.create, "function");
  assert.equal(typeof bids.findById, "function");
  assert.equal(typeof bids.listForDraft, "function");
  assert.equal(typeof bids.listForPoolEntry, "function");
  assert.equal(typeof bids.update, "function");

  assert.equal(typeof awards.create, "function");
  assert.equal(typeof awards.findById, "function");
  assert.equal(typeof awards.findByPoolEntry, "function");
  assert.equal(typeof awards.listForDraft, "function");
  assert.equal(typeof awards.update, "function");
});
