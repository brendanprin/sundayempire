import assert from "node:assert/strict";
import test from "node:test";
import { createDraftOrderEntryRepository } from "@/lib/repositories/drafts/draft-order-entry-repository";
import { createDraftPickRepository } from "@/lib/repositories/drafts/draft-pick-repository";
import { createDraftSelectionRepository } from "@/lib/repositories/drafts/draft-selection-repository";

test("draft order entry repository replaces a draft board deterministically", async () => {
  const calls: {
    deletedWhere?: unknown;
    createManyData?: unknown;
  } = {};

  const repository = createDraftOrderEntryRepository({
    draftOrderEntry: {
      async deleteMany(args: { where: unknown }) {
        calls.deletedWhere = args.where;
        return { count: 2 };
      },
      async createMany(args: { data: unknown }) {
        calls.createManyData = args.data;
        return { count: 2 };
      },
    },
  } as never);

  await repository.replaceForDraft({
    draftId: "draft-1",
    entries: [
      {
        seasonId: "season-1",
        pickNumber: 1,
        round: 1,
        sourceType: "FUTURE_PICK",
        futurePickId: "pick-1",
        originalTeamId: "team-1",
        owningTeamId: "team-1",
        selectingTeamId: "team-1",
      },
      {
        seasonId: "season-1",
        pickNumber: 2,
        round: 1,
        sourceType: "MANUAL",
        futurePickId: null,
        originalTeamId: null,
        owningTeamId: "team-2",
        selectingTeamId: "team-2",
        isManualOverride: true,
        overrideReason: "Correction",
      },
    ],
  });

  assert.deepEqual(calls.deletedWhere, {
    draftId: "draft-1",
  });

  assert.deepEqual(calls.createManyData, [
    {
      draftId: "draft-1",
      seasonId: "season-1",
      pickNumber: 1,
      round: 1,
      sourceType: "FUTURE_PICK",
      futurePickId: "pick-1",
      originalTeamId: "team-1",
      owningTeamId: "team-1",
      selectingTeamId: "team-1",
      isBonus: false,
      isManualOverride: false,
      overrideReason: null,
      createdByUserId: null,
    },
    {
      draftId: "draft-1",
      seasonId: "season-1",
      pickNumber: 2,
      round: 1,
      sourceType: "MANUAL",
      futurePickId: null,
      originalTeamId: null,
      owningTeamId: "team-2",
      selectingTeamId: "team-2",
      isBonus: false,
      isManualOverride: true,
      overrideReason: "Correction",
      createdByUserId: null,
    },
  ]);
});

test("draft pick repository replaces board picks with status defaults", async () => {
  const calls: {
    deletedWhere?: unknown;
    createManyData?: unknown;
  } = {};

  const repository = createDraftPickRepository({
    draftPick: {
      async deleteMany(args: { where: unknown }) {
        calls.deletedWhere = args.where;
        return { count: 1 };
      },
      async createMany(args: { data: unknown }) {
        calls.createManyData = args.data;
        return { count: 1 };
      },
    },
  } as never);

  await repository.replaceForDraft({
    draftId: "draft-1",
    picks: [
      {
        seasonId: "season-1",
        draftOrderEntryId: "entry-1",
        futurePickId: "pick-1",
        selectingTeamId: "team-1",
        pickNumber: 1,
        round: 1,
      },
    ],
  });

  assert.deepEqual(calls.deletedWhere, {
    draftId: "draft-1",
  });

  assert.deepEqual(calls.createManyData, [
    {
      draftId: "draft-1",
      seasonId: "season-1",
      draftOrderEntryId: "entry-1",
      futurePickId: "pick-1",
      selectingTeamId: "team-1",
      pickNumber: 1,
      round: 1,
      status: "PENDING",
      openedAt: null,
      resolvedAt: null,
    },
  ]);
});

test("draft selection repository update writes additive sprint 8 fields", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createDraftSelectionRepository({
    draftSelection: {
      async update(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.update("selection-1", {
    draftPickId: "draft-pick-1",
    actedByUserId: "user-1",
    contractId: "contract-1",
    rosterAssignmentId: "assignment-1",
    outcome: "FORFEITED",
    isPassed: true,
  });

  assert.deepEqual(capturedData, {
    draftPickId: "draft-pick-1",
    pickId: undefined,
    selectingTeamId: undefined,
    playerId: undefined,
    actedByUserId: "user-1",
    contractId: "contract-1",
    rosterAssignmentId: "assignment-1",
    salary: undefined,
    contractYears: undefined,
    outcome: "FORFEITED",
    isPassed: true,
    madeAt: undefined,
  });
});
