import assert from "node:assert/strict";
import test from "node:test";
import { createAuctionBiddingService } from "@/lib/domain/auction/auction-bidding-service";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";

function buildMockClientForReopen() {
  return {
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          leagueId: "league-1",
          seasonId: "season-1", 
          type: "VETERAN_AUCTION",
          status: "IN_PROGRESS",
          title: "Test Auction",
          auctionMode: "STANDARD",
          auctionEndsAt: new Date("2026-03-22T12:00:00.000Z"),
          season: { year: 2026 },
        };
      },
    },
    auctionPlayerPoolEntry: {
      async findUnique() {
        return {
          id: "entry-1",
          draftId: "draft-1",
          status: "AWARDED", // Resolved status that can be reopened
          award: {
            id: "award-1",
            status: "FINALIZED",
          },
          bids: [
            { id: "bid-1", status: "ACTIVE" },
            { id: "bid-2", status: "ACTIVE" },
          ],
        };
      },
      async update() {
        return { id: "entry-1" };
      },
    },
    auctionAward: {
      async update() {
        return {};
      },
    },
    auctionBid: {
      async updateMany() {
        return {};
      },
    },
    commissionerOverride: {
      async create() {
        return { id: "override-1" };
      },
    },
    notification: {
      async create() {
        return { id: "notification-1" };
      },
    },
  } as any;
}

test("commissioner reopen requires valid reason", async () => {
  const client = buildMockClientForReopen();
  const service = createAuctionBiddingService(client);

  // Test empty reason
  try {
    await service.reopenAuctionEntry({
      leagueId: "league-1",
      seasonId: "season-1",
      draftId: "draft-1",
      poolEntryId: "entry-1",
      reason: "",
      actor: {
        userId: "user-1",
        leagueRole: "COMMISSIONER",
      },
    });
    assert.fail("Should have thrown reason required error");
  } catch (error: any) {
    assert.equal(error.code, "OVERRIDE_REASON_REQUIRED");
  }

  // Test invalid reason
  try {
    await service.reopenAuctionEntry({
      leagueId: "league-1",
      seasonId: "season-1", 
      draftId: "draft-1",
      poolEntryId: "entry-1",
      reason: "I don't like the result",
      actor: {
        userId: "user-1",
        leagueRole: "COMMISSIONER",
      },
    });
    assert.fail("Should have thrown invalid reason error");
  } catch (error: any) {
    assert.equal(error.code, "INVALID_REOPEN_REASON");
    assert.match(error.message, /entry error, sync error, or administrative error/);
  }
});

test("commissioner reopen requires commissioner role", async () => {
  const client = buildMockClientForReopen();
  const service = createAuctionBiddingService(client);

  try {
    await service.reopenAuctionEntry({
      leagueId: "league-1",
      seasonId: "season-1",
      draftId: "draft-1", 
      poolEntryId: "entry-1",
      reason: "entry error in player name",
      actor: {
        userId: "user-1",
        leagueRole: "MEMBER", // Not commissioner
      },
    });
    assert.fail("Should have thrown forbidden error");
  } catch (error: any) {
    assert.equal(error.message, "FORBIDDEN");
  }
});

test("commissioner reopen accepts valid reasons", async () => {
  const client = buildMockClientForReopen();
  const service = createAuctionBiddingService(client);

  const validReasons = [
    "entry error in player position",
    "sync error with host platform", 
    "administrative error during award",
    "Data entry error in contract terms",
    "Host sync error corrupted bid history",
    "Commissioner administrative error in eligibility",
  ];

  for (const reason of validReasons) {
    const result = await service.reopenAuctionEntry({
      leagueId: "league-1",
      seasonId: "season-1",
      draftId: "draft-1",
      poolEntryId: "entry-1", 
      reason,
      actor: {
        userId: "user-1",
        leagueRole: "COMMISSIONER",
      },
    });

    assert.equal(result.entryId, "entry-1");
  }
});

test("reopen only works on resolved entries", async () => {
  const client = {
    ...buildMockClientForReopen(),
    auctionPlayerPoolEntry: {
      async findUnique() {
        return {
          id: "entry-1",
          draftId: "draft-1",
          status: "OPEN_BIDDING", // Not resolved
          award: null,
          bids: [],
        };
      },
    },
  };
  
  const service = createAuctionBiddingService(client as any);

  try {
    await service.reopenAuctionEntry({
      leagueId: "league-1",
      seasonId: "season-1",
      draftId: "draft-1",
      poolEntryId: "entry-1",
      reason: "administrative error",
      actor: {
        userId: "user-1",
        leagueRole: "COMMISSIONER",
      },
    });
    assert.fail("Should have thrown not resolved error");
  } catch (error: any) {
    assert.equal(error.code, "AUCTION_ENTRY_NOT_RESOLVED");
    assert.match(error.message, /Only awarded or expired entries can be reopened/);
  }
});
