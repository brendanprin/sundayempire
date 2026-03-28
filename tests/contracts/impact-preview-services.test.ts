import assert from "node:assert/strict";
import test from "node:test";
import { createCutImpactPreviewService } from "@/lib/domain/contracts/cut-impact-preview-service";
import { createFranchiseTagImpactPreviewService } from "@/lib/domain/contracts/franchise-tag-impact-preview-service";
import { createRookieOptionImpactPreviewService } from "@/lib/domain/contracts/rookie-option-impact-preview-service";

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

test("franchise tag impact preview reports cap delta without mutating state", async () => {
  const service = createFranchiseTagImpactPreviewService({
    contract: {
      async findUnique() {
        return {
          id: "contract-1",
          seasonId: "season-1",
          teamId: "team-1",
          playerId: "player-1",
          salary: 20,
          startYear: 2025,
          yearsRemaining: 2,
          yearsTotal: 3,
          isFranchiseTag: false,
          status: "ACTIVE",
          player: {
            id: "player-1",
            name: "Alpha QB",
            position: "QB",
          },
          team: {
            id: "team-1",
            leagueId: "league-1",
          },
          season: {
            id: "season-1",
            year: 2026,
            sourceSeasonId: null,
          },
        };
      },
      async findFirst(args: { where?: { season?: { leagueId?: string; year?: number }; teamId?: string; playerId?: string; isFranchiseTag?: boolean } }) {
        if (args.where?.season?.year === 2025 && !args.where?.isFranchiseTag) {
          return { salary: 20 };
        }

        return null;
      },
      async findMany(args: { where?: { seasonId?: string; season?: { id?: string } } }) {
        if (args.where?.seasonId === "season-1") {
          return [
            {
              id: "contract-1",
              salary: 20,
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

        if (args.where?.season?.id === "season-0") {
          return [{ salary: 20 }, { salary: 30 }, { salary: 40 }];
        }

        return [];
      },
    },
    franchiseTagUsage: {
      async findFirst() {
        return null;
      },
    },
    season: {
      async findUnique() {
        return null;
      },
      async findFirst(args: { where?: { id?: string; leagueId?: string; year?: { lt?: number } } }) {
        if (args.where?.id === "season-1") {
          return {
            id: "season-1",
            year: 2026,
            phase: "TAG_OPTION_COMPLIANCE",
            league: {
              id: "league-1",
              name: "Dynasty League",
            },
          };
        }

        if (args.where?.year?.lt === 2026) {
          return {
            id: "season-0",
            year: 2025,
          };
        }

        return null;
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return buildRuleset();
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
        return [];
      },
    },
    deadCapCharge: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const preview = await service.preview({
    contractId: "contract-1",
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.equal(preview.action, "franchise_tag");
  assert.equal(preview.legal, true);
  assert.equal(preview.before.activeCapTotal, 20);
  assert.ok(preview.after.activeCapTotal > preview.before.activeCapTotal);
  assert.equal(preview.delta.deadCapTotal, 0);
  assert.ok(preview.details.franchiseTag);
});

test("rookie option impact preview extends years without changing cap totals", async () => {
  const service = createRookieOptionImpactPreviewService({
    team: {
      async findUnique() {
        return {
          leagueId: "league-1",
          abbreviation: "CAP",
        };
      },
      async findFirst() {
        return {
          id: "team-1",
          name: "Cap Casualties",
          abbreviation: "CAP",
        };
      },
    },
    contract: {
      async findUnique() {
        return {
          id: "contract-1",
          seasonId: "season-1",
          teamId: "team-1",
          playerId: "player-1",
          salary: 5,
          yearsTotal: 1,
          yearsRemaining: 1,
          endYear: 2026,
          rookieOptionEligible: true,
          rookieOptionExercised: false,
          isFranchiseTag: false,
          status: "EXPIRING",
          player: {
            id: "player-1",
            name: "Rookie WR",
          },
          team: {
            id: "team-1",
            name: "Cap Casualties",
          },
          endedAt: null,
        };
      },
      async findMany() {
        return [
          {
            id: "contract-1",
            salary: 5,
            yearsTotal: 1,
            yearsRemaining: 1,
            isFranchiseTag: false,
            player: {
              id: "player-1",
              name: "Rookie WR",
              position: "WR",
            },
          },
        ];
      },
    },
    season: {
      async findFirst() {
        return {
          id: "season-1",
          year: 2026,
          phase: "TAG_OPTION_COMPLIANCE",
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
    rosterSlot: {
      async findMany() {
        return [];
      },
    },
    deadCapCharge: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const preview = await service.preview({
    contractId: "contract-1",
    yearsToAdd: 2,
    maxContractYears: 4,
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.equal(preview.action, "rookie_option");
  assert.equal(preview.legal, true);
  assert.equal(preview.delta.activeCapTotal, 0);
  assert.equal(preview.details.rookieOption?.nextYearsTotal, 3);
  assert.equal(preview.details.rookieOption?.nextYearsRemaining, 3);
});

test("cut impact preview produces dead cap schedule and roster delta", async () => {
  const service = createCutImpactPreviewService({
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
      async findFirst() {
        return {
          id: "slot-1",
          playerId: "player-1",
          slotLabel: "BN1",
          player: {
            id: "player-1",
            name: "Veteran RB",
            position: "RB",
            injuryStatus: null,
          },
        };
      },
      async findMany() {
        return [
          {
            id: "slot-1",
            slotType: "BENCH",
            slotLabel: "BN1",
            player: {
              id: "player-1",
              name: "Veteran RB",
              position: "RB",
              injuryStatus: null,
            },
          },
        ];
      },
    },
    season: {
      async findFirst() {
        return {
          id: "season-1",
          year: 2026,
          phase: "OFFSEASON_ROLLOVER",
          league: {
            id: "league-1",
            name: "Dynasty League",
          },
        };
      },
      async findMany() {
        return [
          { id: "season-1", year: 2026 },
          { id: "season-2", year: 2027 },
        ];
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return buildRuleset();
      },
    },
    contract: {
      async findFirst() {
        return {
          id: "contract-1",
          salary: 24,
          yearsTotal: 4,
          yearsRemaining: 4,
          status: "ACTIVE",
        };
      },
      async findMany() {
        return [
          {
            id: "contract-1",
            salary: 24,
            yearsTotal: 4,
            yearsRemaining: 4,
            isFranchiseTag: false,
            player: {
              id: "player-1",
              name: "Veteran RB",
              position: "RB",
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

  const preview = await service.preview({
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    playerId: "player-1",
    afterTradeDeadline: false,
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.equal(preview.action, "cut");
  assert.equal(preview.before.rosterCount, 1);
  assert.equal(preview.after.rosterCount, 0);
  assert.equal(preview.delta.activeCapTotal, -24);
  assert.equal(preview.details.currentSeasonDeadCapCharge, 24);
  assert.equal(preview.details.deadCapSchedule?.length, 2);
});
