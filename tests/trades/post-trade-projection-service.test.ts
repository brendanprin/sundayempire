import assert from "node:assert/strict";
import test from "node:test";
import { createPostTradeProjectionService } from "@/lib/domain/trades/post-trade-projection-service";

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

test("post-trade projection moves active cap and roster counts between teams", async () => {
  const service = createPostTradeProjectionService({
    season: {
      async findFirst(args: { where?: { teamId?: string; id?: string; leagueId?: string } }) {
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
    leagueRuleSet: {
      async findFirst() {
        return buildRuleset();
      },
    },
    team: {
      async findFirst(args: { where?: { id?: string } }) {
        if (args.where?.id === "team-1") {
          return {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          };
        }

        return {
          id: "team-2",
          name: "Bench Mob",
          abbreviation: "BEN",
        };
      },
    },
    rosterSlot: {
      async findMany(args: { where?: { teamId?: string } }) {
        if (args.where?.teamId === "team-1") {
          return [
            {
              id: "slot-1",
              slotType: "BENCH",
              slotLabel: "BENCH1",
              player: {
                id: "player-1",
                name: "Alpha QB",
                position: "QB",
                injuryStatus: null,
              },
            },
          ];
        }

        return [
          {
            id: "slot-2",
            slotType: "BENCH",
            slotLabel: "BENCH1",
            player: {
              id: "player-2",
              name: "Beta WR",
              position: "WR",
              injuryStatus: null,
            },
          },
        ];
      },
    },
    contract: {
      async findMany(args: { where?: { teamId?: string } }) {
        if (args.where?.teamId === "team-1") {
          return [
            {
              id: "contract-1",
              salary: 10,
              yearsTotal: 3,
              yearsRemaining: 2,
              isFranchiseTag: false,
              player: {
                id: "player-1",
                name: "Alpha QB",
                position: "QB",
              },
            },
          ];
        }

        return [
          {
            id: "contract-2",
            salary: 4,
            yearsTotal: 2,
            yearsRemaining: 1,
            isFranchiseTag: false,
            player: {
              id: "player-2",
              name: "Beta WR",
              position: "WR",
            },
          },
        ];
      },
    },
    deadCapCharge: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const projection = await service.project({
    leagueId: "league-1",
    seasonId: "season-1",
    proposerTeamId: "team-1",
    counterpartyTeamId: "team-2",
    assets: [
      {
        fromTeamId: "team-1",
        toTeamId: "team-2",
        assetType: "PLAYER",
        playerId: "player-1",
        futurePickId: null,
        contractId: "contract-1",
        assetOrder: 0,
        snapshotLabel: "Alpha QB (QB)",
      },
      {
        fromTeamId: "team-2",
        toTeamId: "team-1",
        assetType: "PLAYER",
        playerId: "player-2",
        futurePickId: null,
        contractId: "contract-2",
        assetOrder: 1,
        snapshotLabel: "Beta WR (WR)",
      },
    ],
  });

  assert.equal(projection.available, true);
  assert.equal(projection.teamA?.activeCapBefore, 10);
  assert.equal(projection.teamA?.activeCapAfter, 4);
  assert.equal(projection.teamB?.activeCapBefore, 4);
  assert.equal(projection.teamB?.activeCapAfter, 10);
  assert.equal(projection.teamA?.rosterCountBefore, 1);
  assert.equal(projection.teamA?.rosterCountAfter, 1);
  assert.equal(projection.teamA?.introducedFindings.length, 0);
});

