import assert from "node:assert/strict";
import test from "node:test";
import { createAuctionAwardRepository } from "@/lib/repositories/auction/auction-award-repository";
import { createAuctionBidRepository } from "@/lib/repositories/auction/auction-bid-repository";
import { createAuctionPlayerPoolExclusionRepository } from "@/lib/repositories/auction/auction-player-pool-exclusion-repository";
import { createAuctionPlayerPoolEntryRepository } from "@/lib/repositories/auction/auction-player-pool-entry-repository";

test("auction player pool repository replaces a draft pool with safe defaults", async () => {
  const calls: {
    deletedWhere?: unknown;
    createManyData?: unknown;
  } = {};

  const repository = createAuctionPlayerPoolEntryRepository({
    auctionPlayerPoolEntry: {
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
        leagueId: "league-1",
        seasonId: "season-1",
        playerId: "player-1",
      },
      {
        leagueId: "league-1",
        seasonId: "season-1",
        playerId: "player-2",
        nominatedByTeamId: "team-2",
        openedByUserId: "user-2",
        status: "OPEN_BIDDING",
        openBiddingOpenedAt: new Date("2026-03-21T10:00:00.000Z"),
        openBidClosesAt: new Date("2026-03-21T10:01:00.000Z"),
        currentLeadingBidAmount: 17,
        currentLeadingTeamId: "team-2",
      },
    ],
  });

  assert.deepEqual(calls.deletedWhere, {
    draftId: "draft-1",
  });

  assert.deepEqual(calls.createManyData, [
    {
      draftId: "draft-1",
      leagueId: "league-1",
      seasonId: "season-1",
      playerId: "player-1",
      nominatedByTeamId: null,
      openedByUserId: null,
      status: "ELIGIBLE",
      blindEligibleAt: null,
      blindConvertedAt: null,
      openBiddingOpenedAt: null,
      openBidClosesAt: null,
      blindBiddingOpenedAt: null,
      blindBidClosesAt: null,
      currentLeadingBidAmount: null,
      currentLeadingTeamId: null,
      awardedAt: null,
      blindEligibleTeamIds: null,
      leadHistoryJson: null,
      reopenedAt: null,
      reopenedByUserId: null,
      reopenReason: null,
      previousStatus: null,
    },
    {
      draftId: "draft-1",
      leagueId: "league-1",
      seasonId: "season-1",
      playerId: "player-2",
      nominatedByTeamId: "team-2",
      openedByUserId: "user-2",
      status: "OPEN_BIDDING",
      blindEligibleAt: null,
      blindConvertedAt: null,
      openBiddingOpenedAt: new Date("2026-03-21T10:00:00.000Z"),
      openBidClosesAt: new Date("2026-03-21T10:01:00.000Z"),
      blindBiddingOpenedAt: null,
      blindBidClosesAt: null,
      currentLeadingBidAmount: 17,
      currentLeadingTeamId: "team-2",
      awardedAt: null,
      blindEligibleTeamIds: null,
      leadHistoryJson: null,
      reopenedAt: null,
      reopenedByUserId: null,
      reopenReason: null,
      previousStatus: null,
    },
  ]);
});

test("auction player pool exclusion repository replaces exclusions with durable reasons", async () => {
  const calls: {
    deletedWhere?: unknown;
    createManyData?: unknown;
  } = {};

  const repository = createAuctionPlayerPoolExclusionRepository({
    auctionPlayerPoolExclusion: {
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
    entries: [
      {
        leagueId: "league-1",
        seasonId: "season-1",
        playerId: "player-1",
        reason: "RESTRICTED",
        reasonDetailsJson: ["RESTRICTED"],
      },
    ],
  });

  assert.deepEqual(calls.deletedWhere, {
    draftId: "draft-1",
  });
  assert.deepEqual(calls.createManyData, [
    {
      draftId: "draft-1",
      leagueId: "league-1",
      seasonId: "season-1",
      playerId: "player-1",
      reason: "RESTRICTED",
      reasonDetailsJson: ["RESTRICTED"],
    },
  ]);
});

test("auction bid repository create defaults bid status", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createAuctionBidRepository({
    auctionBid: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    draftId: "draft-1",
    leagueId: "league-1",
    seasonId: "season-1",
    poolEntryId: "entry-1",
    biddingTeamId: "team-1",
    bidType: "OPEN",
    salaryAmount: 12,
    contractYears: 2,
    submittedAt: new Date("2026-03-21T10:05:00.000Z"),
  });

  assert.deepEqual(capturedData, {
    draftId: "draft-1",
    leagueId: "league-1",
    seasonId: "season-1",
    poolEntryId: "entry-1",
    biddingTeamId: "team-1",
    bidderUserId: null,
    bidType: "OPEN",
    salaryAmount: 12,
    contractYears: 2,
    status: "ACTIVE",
    submittedAt: new Date("2026-03-21T10:05:00.000Z"),
  });
});

test("auction award repository update writes contract linkage fields", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createAuctionAwardRepository({
    auctionAward: {
      async update(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.update("award-1", {
    winningBidId: "bid-1",
    contractId: "contract-1",
    rosterAssignmentId: "assignment-1",
    acquisitionType: "EMERGENCY_FILL_IN",
    status: "VOIDED",
  });

  assert.deepEqual(capturedData, {
    winningBidId: "bid-1",
    awardedTeamId: undefined,
    playerId: undefined,
    contractId: "contract-1",
    rosterAssignmentId: "assignment-1",
    salaryAmount: undefined,
    contractYears: undefined,
    acquisitionType: "EMERGENCY_FILL_IN",
    status: "VOIDED",
    createdByUserId: undefined,
    awardedAt: undefined,
  });
});
