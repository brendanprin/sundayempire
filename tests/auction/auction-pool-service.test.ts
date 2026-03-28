import assert from "node:assert/strict";
import test from "node:test";
import { createAuctionPoolService } from "@/lib/domain/auction/auction-pool-service";

type CreatedDraftPayload = {
  type: unknown;
  title: unknown;
  auctionMode: unknown;
  auctionOpenBidWindowSeconds: unknown;
  auctionBidResetSeconds: unknown;
};

type UpdatedDraftPayload = {
  auctionPoolReviewStatus: unknown;
  auctionPoolGeneratedAt: unknown;
  auctionPoolGeneratedByUserId: unknown;
  auctionPoolFinalizedAt: unknown;
  auctionPoolFinalizedByUserId: unknown;
};

function buildAvailablePlayer(input: {
  id: string;
  name: string;
  position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
  nflTeam: string;
  isRestricted?: boolean;
  rostered?: boolean;
}) {
  return {
    id: input.id,
    name: input.name,
    displayName: input.name,
    position: input.position,
    nflTeam: input.nflTeam,
    age: 25,
    yearsPro: 4,
    injuryStatus: null,
    isRestricted: input.isRestricted ?? false,
    rosterSlots: input.rostered
      ? [
          {
            id: `slot-${input.id}`,
            team: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
          },
        ]
      : [],
    contracts: [],
  };
}

test("ensureAuctionDraft creates a veteran auction draft with default title and config", async () => {
  let createdDraft: CreatedDraftPayload | null = null;

  const service = createAuctionPoolService({
    draft: {
      async findFirst() {
        return null;
      },
      async create(args: { data: Record<string, unknown> }) {
        createdDraft = {
          type: args.data.type,
          title: args.data.title,
          auctionMode: args.data.auctionMode,
          auctionOpenBidWindowSeconds: args.data.auctionOpenBidWindowSeconds,
          auctionBidResetSeconds: args.data.auctionBidResetSeconds,
        };
        return {
          id: "draft-1",
          ...args.data,
        };
      },
    },
  } as never);

  const draft = await service.ensureAuctionDraft({
    leagueId: "league-1",
    seasonId: "season-1",
    seasonYear: 2026,
    title: null,
  });

  assert.equal(draft.id, "draft-1");
  if (!createdDraft) {
    assert.fail("expected create payload");
  }
  const createPayload = createdDraft as CreatedDraftPayload;
  assert.equal(createPayload.type, "VETERAN_AUCTION");
  assert.equal(createPayload.title, "2026 Veteran Auction");
  assert.equal(createPayload.auctionMode, "STANDARD");
  assert.equal(createPayload.auctionOpenBidWindowSeconds, 300);
  assert.equal(createPayload.auctionBidResetSeconds, 300);
});

test("generatePool keeps emergency fill-in scope narrow and warns on skipped candidates", async () => {
  const replacedEntries: Array<Record<string, unknown>> = [];
  const replacedExclusions: Array<Record<string, unknown>> = [];

  const service = createAuctionPoolService({
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          status: "NOT_STARTED",
          auctionMode: "EMERGENCY_FILL_IN",
          auctionPoolReviewStatus: null,
        };
      },
      async update() {
        return {
          id: "draft-1",
        };
      },
    },
    auctionBid: {
      async count() {
        return 0;
      },
    },
    auctionAward: {
      async count() {
        return 0;
      },
      async findMany() {
        return [];
      },
    },
    auctionPlayerPoolEntry: {
      async count() {
        return 0;
      },
      async deleteMany() {
        return { count: 0 };
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        replacedEntries.push(...args.data);
        return { count: args.data.length };
      },
    },
    auctionPlayerPoolExclusion: {
      async deleteMany() {
        return { count: 0 };
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        replacedExclusions.push(...args.data);
        return { count: args.data.length };
      },
    },
    draftSelection: {
      async findMany() {
        return [];
      },
    },
    player: {
      async findMany() {
        return [
          buildAvailablePlayer({
            id: "player-1",
            name: "Ja'Marr Chase",
            position: "WR",
            nflTeam: "CIN",
          }),
          buildAvailablePlayer({
            id: "player-2",
            name: "Bijan Robinson",
            position: "RB",
            nflTeam: "ATL",
          }),
        ];
      },
    },
  } as never);

  const result = await service.generatePool({
    draftId: "draft-1",
    leagueId: "league-1",
    seasonId: "season-1",
    selectedPlayerIds: ["player-1", "missing-player"],
  });

  assert.equal(result.auctionMode, "EMERGENCY_FILL_IN");
  assert.equal(result.createdCount, 1);
  assert.equal(replacedEntries.length, 1);
  assert.equal(result.excludedCount, 1);
  assert.equal(replacedExclusions.length, 1);
  assert.equal(replacedEntries[0]?.playerId, "player-1");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.code, "EMERGENCY_POOL_PARTIAL");
});

test("generatePool includes eligible unranked veterans and records exclusion reasons separately", async () => {
  const replacedEntries: Array<Record<string, unknown>> = [];
  const replacedExclusions: Array<Record<string, unknown>> = [];
  let updatedDraft: UpdatedDraftPayload | null = null;

  const service = createAuctionPoolService({
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          status: "NOT_STARTED",
          auctionMode: "STANDARD",
          auctionPoolReviewStatus: null,
        };
      },
      async update(args: { data: Record<string, unknown> }) {
        updatedDraft = {
          auctionPoolReviewStatus: args.data.auctionPoolReviewStatus,
          auctionPoolGeneratedAt: args.data.auctionPoolGeneratedAt,
          auctionPoolGeneratedByUserId: args.data.auctionPoolGeneratedByUserId,
          auctionPoolFinalizedAt: args.data.auctionPoolFinalizedAt,
          auctionPoolFinalizedByUserId: args.data.auctionPoolFinalizedByUserId,
        };
        return {
          id: "draft-1",
          ...args.data,
        };
      },
    },
    auctionBid: {
      async count() {
        return 0;
      },
    },
    auctionAward: {
      async count() {
        return 0;
      },
      async findMany() {
        return [];
      },
    },
    auctionPlayerPoolEntry: {
      async count() {
        return 0;
      },
      async deleteMany() {
        return { count: 0 };
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        replacedEntries.push(...args.data);
        return { count: args.data.length };
      },
    },
    auctionPlayerPoolExclusion: {
      async deleteMany() {
        return { count: 0 };
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        replacedExclusions.push(...args.data);
        return { count: args.data.length };
      },
    },
    player: {
      async findMany() {
        return [
          buildAvailablePlayer({
            id: "player-unranked",
            name: "Unranked Veteran",
            position: "WR",
            nflTeam: "FA",
          }),
          buildAvailablePlayer({
            id: "player-rostered",
            name: "Rostered Veteran",
            position: "RB",
            nflTeam: "DET",
            rostered: true,
          }),
        ];
      },
    },
  } as never);

  const result = await service.generatePool({
    draftId: "draft-1",
    leagueId: "league-1",
    seasonId: "season-1",
    createdByUserId: "user-1",
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.excludedCount, 1);
  assert.equal(replacedEntries[0]?.playerId, "player-unranked");
  assert.equal(replacedExclusions[0]?.playerId, "player-rostered");
  assert.equal(replacedExclusions[0]?.reason, "ROSTERED");
  if (!updatedDraft) {
    assert.fail("expected draft update payload");
  }
  const updatedDraftPayload = updatedDraft as UpdatedDraftPayload;
  assert.equal(updatedDraftPayload.auctionPoolReviewStatus, "PENDING_REVIEW");
  assert.equal(updatedDraftPayload.auctionPoolGeneratedByUserId, "user-1");
  assert.equal(updatedDraftPayload.auctionPoolFinalizedAt, null);
  assert.equal(updatedDraftPayload.auctionPoolFinalizedByUserId, null);
  assert.ok(updatedDraftPayload.auctionPoolGeneratedAt instanceof Date);
});

test("generatePool blocks unsafe regeneration once the pool is finalized or live activity exists", async () => {
  const finalizedService = createAuctionPoolService({
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          status: "NOT_STARTED",
          auctionMode: "STANDARD",
          auctionPoolReviewStatus: "FINALIZED",
        };
      },
    },
    auctionBid: {
      async count() {
        return 0;
      },
    },
    auctionAward: {
      async count() {
        return 0;
      },
    },
    auctionPlayerPoolEntry: {
      async count() {
        return 1;
      },
    },
  } as never);

  await assert.rejects(
    () =>
      finalizedService.generatePool({
        draftId: "draft-1",
        leagueId: "league-1",
        seasonId: "season-1",
        regenerate: true,
      }),
    /AUCTION_POOL_FINALIZED/,
  );

  const liveService = createAuctionPoolService({
    draft: {
      async findFirst() {
        return {
          id: "draft-2",
          status: "IN_PROGRESS",
          auctionMode: "STANDARD",
          auctionPoolReviewStatus: "PENDING_REVIEW",
        };
      },
    },
    auctionBid: {
      async count() {
        return 1;
      },
    },
    auctionAward: {
      async count() {
        return 0;
      },
    },
    auctionPlayerPoolEntry: {
      async count() {
        return 2;
      },
    },
  } as never);

  await assert.rejects(
    () =>
      liveService.generatePool({
        draftId: "draft-2",
        leagueId: "league-1",
        seasonId: "season-1",
        regenerate: true,
      }),
    /AUCTION_POOL_RECOVERY_REQUIRED/,
  );
});

test("finalizePool requires a generated reviewable pool and marks it durable", async () => {
  let finalizedData: Record<string, unknown> | null = null;

  const service = createAuctionPoolService({
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          status: "NOT_STARTED",
          auctionPoolReviewStatus: "PENDING_REVIEW",
        };
      },
      async update(args: { data: Record<string, unknown> }) {
        finalizedData = args.data;
        return {
          id: "draft-1",
          ...args.data,
        };
      },
    },
    auctionPlayerPoolEntry: {
      async count() {
        return 3;
      },
    },
    auctionBid: {
      async count() {
        return 0;
      },
    },
    auctionAward: {
      async count() {
        return 0;
      },
    },
  } as never);

  await service.finalizePool({
    draftId: "draft-1",
    leagueId: "league-1",
    seasonId: "season-1",
    finalizedByUserId: "user-9",
    now: new Date("2026-03-26T16:00:00.000Z"),
  });

  assert.deepEqual(finalizedData, {
    auctionPoolReviewStatus: "FINALIZED",
    auctionPoolFinalizedAt: new Date("2026-03-26T16:00:00.000Z"),
    auctionPoolFinalizedByUserId: "user-9",
  });
});
