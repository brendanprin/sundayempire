import test from "node:test";
import assert from "node:assert/strict";
import { createTradeAssetRepository } from "@/lib/repositories/trades/trade-asset-repository";
import { createTradeEvaluationRepository } from "@/lib/repositories/trades/trade-evaluation-repository";
import { createTradeProposalRepository } from "@/lib/repositories/trades/trade-proposal-repository";

test("trade repository scaffolding exposes proposal, asset, and evaluation methods", () => {
  const proposalRepository = createTradeProposalRepository();
  const assetRepository = createTradeAssetRepository();
  const evaluationRepository = createTradeEvaluationRepository();

  assert.equal(typeof proposalRepository.create, "function");
  assert.equal(typeof proposalRepository.findById, "function");
  assert.equal(typeof proposalRepository.update, "function");
  assert.equal(typeof assetRepository.createManyForLegacyTrade, "function");
  assert.equal(typeof assetRepository.replaceForTradeProposal, "function");
  assert.equal(typeof evaluationRepository.create, "function");
  assert.equal(typeof evaluationRepository.findCurrentForProposal, "function");
  assert.equal(typeof evaluationRepository.markAllNotCurrent, "function");
});
