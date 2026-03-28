import assert from "node:assert/strict";
import test from "node:test";
import { createBidValuationService } from "@/lib/domain/auction/bid-valuation-service";

function buildRuleset() {
  return {
    id: "rules-1",
    leagueId: "league-1",
    isActive: true,
    version: 1,
    effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    rosterSize: 20,
    starterQb: 0,
    starterQbFlex: 0,
    starterRb: 0,
    starterWr: 0,
    starterTe: 0,
    starterFlex: 0,
    starterDst: 0,
    irSlots: 2,
    salaryCapSoft: 245,
    salaryCapHard: 300,
    waiverBidMaxAtOrAboveSoftCap: 0,
    minContractYears: 1,
    maxContractYears: 4,
    minSalary: 1,
    maxContractYearsIfSalaryBelowTen: 3,
    rookieBaseYears: 1,
    rookieOptionYears: 2,
    franchiseTagsPerTeam: 1,
    tradeDeadlineWeek: 11,
    regularSeasonWeeks: 13,
    playoffStartWeek: 14,
    playoffEndWeek: 16,
  };
}

function buildClient(auctionEndsAt: Date) {
  return {
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          status: "IN_PROGRESS",
          auctionMode: "STANDARD",
          auctionEndsAt,
          auctionOpenBidWindowSeconds: 60,
          auctionBidResetSeconds: 30,
        };
      },
    },
    auctionPlayerPoolEntry: {
      async findFirst() {
        return {
          id: "entry-1",
          draftId: "draft-1",
          status: "OPEN_BIDDING",
          currentLeadingBidAmount: 10,
          player: {
            id: "player-1",
            name: "Alpha Veteran",
            position: "WR",
            isRestricted: false,
          },
        };
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return buildRuleset();
      },
    },
    season: {
      async findFirst() {
        return {
          id: "season-1",
          year: 2026,
          phase: "REGULAR_SEASON",
          league: {
            id: "league-1",
            name: "Dynasty League",
          },
        };
      },
    },
    team: {
      async findFirst() {
        return {
          id: "team-1",
          name: "Cap Casualties",
          abbreviation: "CAP",
        };
      },
    },
    rosterSlot: {
      async findMany() {
        return Array.from({ length: 20 }, (_, index) => ({
          id: `slot-${index + 1}`,
        }));
      },
    },
    contract: {
      async findMany() {
        return [];
      },
    },
    deadCapCharge: {
      async findMany() {
        return [];
      },
    },
    contractSeasonLedger: {
      async findMany() {
        return [
          {
            annualSalary: 240,
            ledgerStatus: "ACTIVE",
          },
        ];
      },
    },
  };
}

test("bid valuation blocks open bids during the blind-auction window", async () => {
  const service = createBidValuationService(
    buildClient(new Date("2026-03-22T00:00:00.000Z")) as never,
  );

  const valuation = await service.evaluate({
    leagueId: "league-1",
    seasonId: "season-1",
    draftId: "draft-1",
    teamId: "team-1",
    poolEntryId: "entry-1",
    bidType: "OPEN",
    salaryAmount: 12,
    contractYears: 1,
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.equal(valuation.legal, false);
  assert.match(valuation.blockedReason ?? "", /Open bidding is closed/);
});

test("bid valuation returns warnings for blind bids that push soft cap and roster count", async () => {
  const service = createBidValuationService(
    buildClient(new Date("2026-03-22T00:00:00.000Z")) as never,
  );

  const valuation = await service.evaluate({
    leagueId: "league-1",
    seasonId: "season-1",
    draftId: "draft-1",
    teamId: "team-1",
    poolEntryId: "entry-1",
    bidType: "BLIND",
    salaryAmount: 12,
    contractYears: 1,
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.equal(valuation.legal, true);
  assert.equal(valuation.projected?.activeCapTotal, 252);
  assert.equal(valuation.projected?.hardCapTotal, 252);
  assert.equal(valuation.projected?.rosterCount, 21);
  assert.equal(valuation.warnings.length, 2);
  assert.match(valuation.warnings[0] ?? "", /soft cap/);
  assert.match(valuation.warnings[1] ?? "", /roster size/);
});
