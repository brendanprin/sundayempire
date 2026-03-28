import assert from "node:assert/strict";
import test from "node:test";
import { createAuctionBiddingService } from "@/lib/domain/auction/auction-bidding-service";

function buildMockClient(overrides = {}) {
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
          auctionEndsAt: new Date("2026-03-22T12:00:00.000Z"), // 24 hours from blind window start
          auctionOpenBidWindowSeconds: 300,
          auctionBidResetSeconds: 300,
          season: { year: 2026 },
        };
      },
      async findUnique() {
        return this.findFirst();
      },
      ...overrides.draft,
    },
    auctionPlayerPoolEntry: {
      async findFirst() {
        return {
          id: "entry-1",
          draftId: "draft-1",
          status: "BLIND_BIDDING",
          blindEligibleTeamIds: JSON.stringify(["team-1", "team-2"]),
          currentLeadingTeamId: "team-1",
        };
      },
      async findUnique() {
        return this.findFirst();
      },
      async findMany() {
        return [];
      },
      async update() {
        return {};
      },
      ...overrides.auctionPlayerPoolEntry,
    },
    auctionBid: {
      async findFirst() {
        return {
          salaryAmount: 10,
          contractYears: 2,
        };
      },
      async findMany() {
        return [];
      },
      async updateMany() {
        return {};
      },
      async create(args: any) {
        return { id: "bid-1", ...args.data };
      },
      ...overrides.auctionBid,
    },
    auctionBlindTieResolution: {
      async create(args: any) {
        return { id: "resolution-1", ...args.data };
      },
      ...overrides.auctionBlindTieResolution,
    },
    leagueRuleSet: {
      async findFirst() {
        return {
          minSalary: 1,
          minContractYears: 1,
          maxContractYears: 4,
          maxContractYearsIfSalaryBelowTen: 3,
        };
      },
      ...overrides.leagueRuleSet,
    },
    team: {
      async findFirst() {
        return { id: "team-1", name: "Test Team" };
      },
      ...overrides.team,
    },
    season: {
      async findFirst() {
        return { id: "season-1", year: 2026 };
      },
      ...overrides.season,
    },
    rosterSlot: {
      async findMany() {
        return Array.from({ length: 20 }, (_, i) => ({ id: `slot-${i}` }));
      },
      ...overrides.rosterSlot,
    },
    contract: {
      async findMany() {
        return [];
      },
      ...overrides.contract,
    },
    deadCapCharge: {
      async findMany() {
        return [];
      },
      ...overrides.deadCapCharge,
    },
    contractSeasonLedger: {
      async findMany() {
        return [{ annualSalary: 100, ledgerStatus: "ACTIVE" }];
      },
      ...overrides.contractSeasonLedger,
    },
    ...overrides,
  } as any;
}

test("blind bid eligibility enforcement blocks non-eligible teams", async () => {
  const client = buildMockClient();
  const service = createAuctionBiddingService(client);

  try {
    await service.placeBlindBid({
      leagueId: "league-1",
      seasonId: "season-1", 
      draftId: "draft-1",
      poolEntryId: "entry-1",
      biddingTeamId: "team-3", // Not in eligible list
      salaryAmount: 15,
      contractYears: 2,
      actor: {
        userId: "user-1",
        leagueRole: "MEMBER",
        teamId: "team-3",
      },
      now: new Date("2026-03-22T06:00:00.000Z"), // During blind window
    });
    
    assert.fail("Should have thrown eligibility error");
  } catch (error: any) {
    assert.equal(error.code, "BLIND_BID_NOT_ELIGIBLE");
    assert.match(error.message, /held the lead during the final 24 hours/);
  }
});

test("blind bid floor rule prevents lower offers than end-of-open bid", async () => {
  const client = buildMockClient({
    auctionBid: {
      async findFirst() {
        return {
          salaryAmount: 20, // Team's end-of-open bid
          contractYears: 3,
        };
      },
      async findMany() {
        return [];
      },
      async updateMany() {
        return {};
      },
      async create() {
        return {};
      },
    },
  });
  
  const service = createAuctionBiddingService(client);

  try {
    await service.placeBlindBid({
      leagueId: "league-1",
      seasonId: "season-1",
      draftId: "draft-1", 
      poolEntryId: "entry-1",
      biddingTeamId: "team-1", // Eligible team
      salaryAmount: 15, // Lower salary
      contractYears: 2,   // Would result in lower bid value than 20*3 + 20*0.5*1 = 70
      actor: {
        userId: "user-1", 
        leagueRole: "MEMBER",
        teamId: "team-1",
      },
      now: new Date("2026-03-22T06:00:00.000Z"),
    });
    
    assert.fail("Should have thrown floor violation error");
  } catch (error: any) {
    assert.equal(error.code, "BLIND_BID_FLOOR_VIOLATION");
    assert.match(error.message, /cannot be lower than team's end-of-open bid value/);
  }
});

test("blind tie resolution uses deterministic random draw", async () => {
  const client = buildMockClient();
  const service = createAuctionBiddingService(client);
  
  const tiedBids = [
    { id: "bid-1", biddingTeamId: "team-1", salaryAmount: 10, contractYears: 2 },
    { id: "bid-2", biddingTeamId: "team-2", salaryAmount: 10, contractYears: 2 },
    { id: "bid-3", biddingTeamId: "team-3", salaryAmount: 10, contractYears: 2 },
  ];
  
  // Call tie resolution multiple times with same inputs - should get same result
  const results: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const result: any = await (service as any).resolveBlindTieRandomly({
      tx: {
        auctionBlindTieResolution: {
          create: (args: any) => ({
            id: `resolution-${i}`,
            winningBidId: args.data.winningBidId,
            drawResult: args.data.drawResult,
          }),
        },
      },
      draft: { id: "draft-1", leagueId: "league-1", seasonId: "season-1" },
      poolEntryId: "entry-1", 
      tiedBids,
      resolvedAt: new Date("2026-03-22T12:00:00.000Z"),
    });
    
    results.push(result.winningBidId);
  }
  
  // All results should be the same (deterministic)
  assert.ok(results.every(result => result === results[0]));
  assert.ok(tiedBids.some(bid => bid.id === results[0]));
});
