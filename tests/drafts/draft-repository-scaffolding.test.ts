import assert from "node:assert/strict";
import test from "node:test";
import { createDraftOrderEntryRepository } from "@/lib/repositories/drafts/draft-order-entry-repository";
import { createDraftPickRepository } from "@/lib/repositories/drafts/draft-pick-repository";
import { createDraftSelectionRepository } from "@/lib/repositories/drafts/draft-selection-repository";

test("draft repository scaffolding exposes order entry, draft pick, and selection methods", () => {
  const stubClient = {} as never;

  const orderEntries = createDraftOrderEntryRepository(stubClient);
  const draftPicks = createDraftPickRepository(stubClient);
  const selections = createDraftSelectionRepository(stubClient);

  assert.equal(typeof orderEntries.replaceForDraft, "function");
  assert.equal(typeof orderEntries.create, "function");
  assert.equal(typeof orderEntries.findById, "function");
  assert.equal(typeof orderEntries.listForDraft, "function");
  assert.equal(typeof orderEntries.update, "function");

  assert.equal(typeof draftPicks.replaceForDraft, "function");
  assert.equal(typeof draftPicks.create, "function");
  assert.equal(typeof draftPicks.findById, "function");
  assert.equal(typeof draftPicks.findByPickNumber, "function");
  assert.equal(typeof draftPicks.listForDraft, "function");
  assert.equal(typeof draftPicks.update, "function");

  assert.equal(typeof selections.create, "function");
  assert.equal(typeof selections.findById, "function");
  assert.equal(typeof selections.listForDraft, "function");
  assert.equal(typeof selections.update, "function");
});
