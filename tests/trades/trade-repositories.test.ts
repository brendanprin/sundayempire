import test from "node:test";
import assert from "node:assert/strict";
import { assertTradeAssetParentIntent } from "@/lib/repositories/trades/trade-asset-repository";

test("trade asset parent intent allows exactly one parent id", () => {
  assert.doesNotThrow(() => {
    assertTradeAssetParentIntent({ tradeId: "trade-1" });
  });

  assert.doesNotThrow(() => {
    assertTradeAssetParentIntent({ tradeProposalId: "proposal-1" });
  });
});

test("trade asset parent intent rejects missing parent ids", () => {
  assert.throws(() => {
    assertTradeAssetParentIntent({});
  }, /exactly one/);
});

test("trade asset parent intent rejects dual parent ids", () => {
  assert.throws(() => {
    assertTradeAssetParentIntent({
      tradeId: "trade-1",
      tradeProposalId: "proposal-1",
    });
  }, /exactly one/);
});
